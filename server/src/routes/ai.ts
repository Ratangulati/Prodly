import { Router } from 'express'
import { getSystemPrompt } from '../lib/prompts.js'
import type { AIWorkflow } from '../lib/types.js'
import { aiErrorKind, aiErrorMessage, type ChatTurn, type GenerateJson, type StreamChat } from '../lib/ai.js'
import {
  ESTIMATE_POINTS, REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT, SPRINT_SCHEMA, SPRINT_SYSTEM_PROMPT, TASKS_SCHEMA, TASKS_SYSTEM_PROMPT,
  htmlToText, normalizeReview, normalizeSprintPlan, normalizeTasks,
} from '../lib/planning.js'
import { authOf } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

/**
 * Marks a failure that happens after streaming has started (headers already sent).
 * The client strips it and shows the message instead of a silently cut-off reply.
 */
export const STREAM_ERROR_MARKER = '\u0000PRODLY_AI_ERROR:'

/** JSON body for AI failures; the header lets streaming clients read the kind too. */
function sendAIError(res: import('express').Response, err: unknown) {
  res.status(502).set('X-AI-Error-Kind', aiErrorKind(err)).json({ error: aiErrorMessage(err), kind: aiErrorKind(err) })
}

const WORKFLOWS: AIWorkflow[] = ['prd', 'stories', 'roadmap', 'prioritization', 'research', 'data', 'general', 'update']

// Keeps prompts well inside the model's context window
const MAX_DOC_CHARS = 60_000

interface ChatBody {
  workflow?: AIWorkflow
  userMessage?: string
  documentContext?: string
  conversationHistory?: ChatTurn[]
}

interface DocBody {
  title?: string
  content?: string
}

export function aiRouter({ streamChat, generateJson }: { streamChat: StreamChat; generateJson: GenerateJson }) {
  const router = Router()

  router.post('/', async (req, res) => {
    const { workflow = 'general', userMessage, documentContext, conversationHistory = [] } =
      (req.body ?? {}) as ChatBody

    if (!userMessage?.trim()) {
      res.status(400).send('userMessage is required')
      return
    }
    if (!WORKFLOWS.includes(workflow)) {
      res.status(400).send(`Unknown workflow: ${workflow}`)
      return
    }

    let chunks: AsyncIterable<string>
    try {
      chunks = await streamChat(getSystemPrompt(workflow, documentContext), conversationHistory, userMessage)
    } catch (err) {
      // Fails before anything is streamed, so the client still gets a proper error status
      console.error('AI request failed:', err instanceof Error ? err.message : err)
      res.status(502).set('X-AI-Error-Kind', aiErrorKind(err)).type('text/plain').send(aiErrorMessage(err))
      return
    }

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })

    try {
      for await (const text of chunks) res.write(text)
    } catch (err) {
      console.error('AI stream error:', err)
      res.write(`${STREAM_ERROR_MARKER}${aiErrorKind(err)}:${aiErrorMessage(err)}`)
    } finally {
      res.end()
    }
  })

  /** Reads a PRD and proposes an implementation task list. */
  router.post('/tasks', async (req, res) => {
    const { title = '', content = '' } = (req.body ?? {}) as DocBody
    const text = htmlToText(content).slice(0, MAX_DOC_CHARS)
    if (text.length < 20) {
      res.status(400).json({ error: 'The PRD is empty. Write or generate it first.' })
      return
    }
    try {
      const raw = await generateJson(TASKS_SYSTEM_PROMPT, `PRD title: ${title}\n\n${text}`, TASKS_SCHEMA)
      const tasks = normalizeTasks(raw)
      if (tasks.length === 0) {
        res.status(502).json({ error: 'The AI did not return any tasks. Please try again.', kind: 'failed' })
        return
      }
      res.json({ tasks })
    } catch (err) {
      console.error('Task generation failed:', err instanceof Error ? err.message : err)
      sendAIError(res, err)
    }
  })

  /** Scores a PRD against a checklist of what a good PRD covers. */
  router.post('/review', async (req, res) => {
    const { title = '', content = '' } = (req.body ?? {}) as DocBody
    const text = htmlToText(content).slice(0, MAX_DOC_CHARS)
    if (text.length < 20) {
      res.status(400).json({ error: 'The PRD is empty. Write or generate it first.' })
      return
    }
    try {
      const raw = await generateJson(REVIEW_SYSTEM_PROMPT, `PRD title: ${title}\n\n${text}`, REVIEW_SCHEMA)
      res.json(normalizeReview(raw))
    } catch (err) {
      console.error('PRD review failed:', err instanceof Error ? err.message : err)
      sendAIError(res, err)
    }
  })

  /**
   * Proposes a sprint from the workspace's open tasks (not done, not in a sprint).
   * Body: { capacity: { [memberId]: points } }. Nothing is saved.
   */
  router.post('/sprint', async (req, res) => {
    const { workspaceId } = authOf(req)
    const rawCapacity = req.body?.capacity
    const members = await prisma.member.findMany({ where: { workspaceId } })
    const capacity: Record<string, number> = {}
    for (const m of members) {
      const points = Number(rawCapacity?.[m.id])
      if (Number.isFinite(points) && points > 0) capacity[m.id] = Math.min(points, 100)
    }
    if (!Object.keys(capacity).length) {
      res.status(400).json({ error: 'Give at least one teammate some capacity' })
      return
    }

    const tasks = await prisma.task.findMany({
      where: { workspaceId, status: { not: 'done' }, sprintId: null },
      orderBy: [{ priority: 'asc' }, { order: 'asc' }],
      take: 60,
    })
    if (!tasks.length) {
      res.status(400).json({ error: 'There are no open tasks to plan. Add or generate tasks first.' })
      return
    }

    const brief = [
      'TEAM CAPACITY (points):',
      ...members.filter((m) => capacity[m.id]).map((m) => `- ${m.name} (id: ${m.id}): ${capacity[m.id]}`),
      '',
      'OPEN TASKS:',
      ...tasks.map((t) => `- id: ${t.id} | ${t.title} | ${t.priority} | ${ESTIMATE_POINTS[t.estimate] ?? 3} pts | status: ${t.status} | assignee: ${t.assigneeId ?? 'none'}`),
    ].join('\n')

    try {
      const raw = await generateJson(SPRINT_SYSTEM_PROMPT, brief, SPRINT_SCHEMA)
      res.json(normalizeSprintPlan(raw, { tasks, capacity }))
    } catch (err) {
      console.error('Sprint planning failed:', err instanceof Error ? err.message : err)
      sendAIError(res, err)
    }
  })

  return router
}
