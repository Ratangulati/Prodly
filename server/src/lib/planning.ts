import { Type, type Schema } from '@google/genai'

// ── PRD → tasks ──────────────────────────────────────────────────────

export const TASKS_SYSTEM_PROMPT = `You are a senior engineering manager turning a Product Requirements Document into an implementation task list for a small product team.

Rules:
- Produce 5–15 concrete, independently shippable tasks that together deliver the PRD's in-scope requirements.
- Each title starts with a verb and is under 80 characters (e.g. "Build role picker on sign-up form").
- Each description is 1–3 sentences: what to build and how we know it is done.
- Cover design, frontend, backend, analytics/instrumentation and QA where the PRD needs them.
- Skip anything the PRD marks out of scope.
- Priority: P0 = blocks launch, P1 = needed for launch, P2 = important but can follow, P3 = nice to have.
- Estimate uses t-shirt sizes: XS (<½ day), S (1 day), M (2–3 days), L (1 week), XL (2+ weeks).`

export const TASKS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['P0', 'P1', 'P2', 'P3'] },
          estimate: { type: Type.STRING, enum: ['XS', 'S', 'M', 'L', 'XL'] },
        },
        required: ['title', 'description', 'priority', 'estimate'],
      },
    },
  },
  required: ['tasks'],
}

export interface ProposedTask {
  title: string
  description: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  estimate: 'XS' | 'S' | 'M' | 'L' | 'XL'
}

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
const ESTIMATES = ['XS', 'S', 'M', 'L', 'XL'] as const

/** Keeps only well-formed tasks and fills in safe defaults, since model output can't be fully trusted. */
export function normalizeTasks(raw: unknown): ProposedTask[] {
  const list = (raw as { tasks?: unknown })?.tasks
  if (!Array.isArray(list)) return []
  return list
    .filter((t): t is Record<string, unknown> => typeof t?.title === 'string' && t.title.trim() !== '')
    .map((t) => ({
      title: (t.title as string).trim().slice(0, 200),
      description: typeof t.description === 'string' ? t.description.trim() : '',
      priority: PRIORITIES.includes(t.priority as never) ? (t.priority as ProposedTask['priority']) : 'P2',
      estimate: ESTIMATES.includes(t.estimate as never) ? (t.estimate as ProposedTask['estimate']) : 'M',
    }))
    .slice(0, 25)
}

// ── PRD quality review ───────────────────────────────────────────────

export const REVIEW_SYSTEM_PROMPT = `You are a demanding Head of Product reviewing a PRD before engineering starts.

Score the PRD from 0 to 100 and check each of these areas:
1. Problem statement — specific user, pain, evidence
2. Goals & success metrics — measurable, with baselines and targets
3. Target users / personas
4. Scope — clear in-scope and out-of-scope
5. Requirements — specific and testable
6. User experience / key flows
7. Edge cases & error states
8. Risks & dependencies
9. Launch plan / rollout
10. Open questions

For each area return status "pass" (solid), "warn" (present but weak) or "fail" (missing), plus one sentence of specific, actionable feedback that quotes or references the PRD. Keep the summary to two sentences.`

export const REVIEW_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    summary: { type: Type.STRING },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          area: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['pass', 'warn', 'fail'] },
          feedback: { type: Type.STRING },
        },
        required: ['area', 'status', 'feedback'],
      },
    },
  },
  required: ['score', 'summary', 'checks'],
}

export interface PrdReview {
  score: number
  summary: string
  checks: { area: string; status: 'pass' | 'warn' | 'fail'; feedback: string }[]
}

export function normalizeReview(raw: unknown): PrdReview {
  const r = (raw ?? {}) as Record<string, unknown>
  const score = typeof r.score === 'number' ? Math.round(Math.min(100, Math.max(0, r.score))) : 0
  const checks = Array.isArray(r.checks) ? r.checks : []
  return {
    score,
    summary: typeof r.summary === 'string' ? r.summary.trim() : '',
    checks: checks
      .filter((c): c is Record<string, unknown> => typeof c?.area === 'string')
      .map((c) => ({
        area: (c.area as string).trim(),
        status: c.status === 'pass' || c.status === 'fail' ? c.status : 'warn',
        feedback: typeof c.feedback === 'string' ? c.feedback.trim() : '',
      })),
  }
}

/** Strips HTML so the model sees plain document text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

// ── Sprint planning ──────────────────────────────────────────────────

/** Story points per t-shirt estimate; unestimated tasks count as a medium. */
export const ESTIMATE_POINTS: Record<string, number> = { XS: 1, S: 2, M: 3, L: 5, XL: 8, '': 3 }

export const SPRINT_SYSTEM_PROMPT = `You are an experienced engineering manager planning the next sprint.

You get the open tasks (with priority, estimate in points, current assignee and status) and each teammate's capacity in points for this sprint.

Rules:
- Commit only to tasks that fit: the points assigned to each person must not exceed their capacity.
- Prefer higher priority (P0 before P1 before P2 before P3), and keep tasks already in progress.
- Keep a task with its current assignee when they have capacity; otherwise assign it to someone with room.
- Use each task id and member id exactly as given. Do not invent tasks or people.
- Give each committed task a short reason, and each deferred task a short reason (e.g. "over capacity", "lower priority").
- Write a one-sentence sprint goal that describes the outcome of the committed work.`

export const SPRINT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    goal: { type: Type.STRING },
    committed: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.STRING },
          assigneeId: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['taskId', 'assigneeId', 'reason'],
      },
    },
    deferred: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { taskId: { type: Type.STRING }, reason: { type: Type.STRING } },
        required: ['taskId', 'reason'],
      },
    },
  },
  required: ['goal', 'committed', 'deferred'],
}

export interface SprintPlan {
  goal: string
  committed: { taskId: string; assigneeId: string; points: number; reason: string }[]
  deferred: { taskId: string; reason: string }[]
}

interface PlanInput {
  tasks: { id: string; estimate: string }[]
  capacity: Record<string, number>
}

/**
 * Drops unknown tasks and people, and enforces capacity even if the model ignored it:
 * anything that doesn't fit is moved to deferred.
 */
export function normalizeSprintPlan(raw: unknown, { tasks, capacity }: PlanInput): SprintPlan {
  const r = (raw ?? {}) as Record<string, unknown>
  const taskPoints = new Map(tasks.map((t) => [t.id, ESTIMATE_POINTS[t.estimate] ?? 3]))
  const remaining = new Map(Object.entries(capacity))
  const seen = new Set<string>()
  const committed: SprintPlan['committed'] = []
  const deferred: SprintPlan['deferred'] = []

  for (const c of Array.isArray(r.committed) ? r.committed : []) {
    const { taskId, assigneeId, reason } = (c ?? {}) as Record<string, unknown>
    if (typeof taskId !== 'string' || !taskPoints.has(taskId) || seen.has(taskId)) continue
    seen.add(taskId)
    const points = taskPoints.get(taskId)!
    const left = typeof assigneeId === 'string' ? remaining.get(assigneeId) : undefined
    if (left === undefined || points > left) {
      deferred.push({ taskId, reason: 'Over capacity' })
      continue
    }
    remaining.set(assigneeId as string, left - points)
    committed.push({ taskId, assigneeId: assigneeId as string, points, reason: typeof reason === 'string' ? reason.trim() : '' })
  }

  for (const d of Array.isArray(r.deferred) ? r.deferred : []) {
    const { taskId, reason } = (d ?? {}) as Record<string, unknown>
    if (typeof taskId !== 'string' || !taskPoints.has(taskId) || seen.has(taskId)) continue
    seen.add(taskId)
    deferred.push({ taskId, reason: typeof reason === 'string' ? reason.trim() : '' })
  }

  // Anything the model skipped entirely is deferred too
  for (const t of tasks) if (!seen.has(t.id)) deferred.push({ taskId: t.id, reason: 'Not included in this sprint' })

  return { goal: typeof r.goal === 'string' ? r.goal.trim() : '', committed, deferred }
}
