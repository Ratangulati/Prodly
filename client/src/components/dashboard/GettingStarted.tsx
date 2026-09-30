import { useState } from 'react'
import { ArrowRight, Check, Rocket, X } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import { toast } from '@/lib/toast'

// Dismissing is a per-browser convenience; if storage is unavailable the card simply shows again
const dismissKey = (userId: string) => `prodly:getting-started-dismissed:${userId}`
function isDismissed(userId: string) {
  try { return localStorage.getItem(dismissKey(userId)) === '1' } catch { return false }
}

const hasText = (html: string) => html.replace(/<[^>]+>/g, '').trim().length > 40

interface Step {
  id: string
  title: string
  description: string
  done: boolean
  action: string
  run: () => void
  disabled?: boolean
}

/** First-run checklist that walks a new workspace through the core flow. Ticks itself off. */
export default function GettingStarted() {
  const {
    documents, tasks, members, sprints, insights,
    addDocumentFile, setActiveDoc, setPendingAICommand, setActiveSidebarTab, openTaskReview, openTasks,
  } = useWorkspaceStore()
  const user = useAuthStore((s) => s.user)
  const workspace = useAuthStore((s) => s.workspace)
  const [dismissed, setDismissed] = useState(() => (user ? isDismissed(user.id) : false))

  if (!user || !workspace || dismissed) return null

  const prd = documents.find((d) => d.type === 'prd' && hasText(d.content)) ?? null
  const teammatesWithLogin = members.filter((m) => m.userId).length

  const steps: Step[] = [
    {
      id: 'prd',
      title: 'Write your first PRD',
      description: 'Describe a feature idea and the AI drafts a full PRD for you to edit.',
      done: !!prd,
      action: 'Draft with AI',
      run: () => {
        const id = addDocumentFile('prd', 'Untitled PRD', null)
        setActiveDoc(id)
        setPendingAICommand('prd', 'Draft a complete PRD for this feature:\n\nFeature: \nProblem: \nTarget users: ')
        setActiveSidebarTab('chat')
      },
    },
    {
      id: 'tasks',
      title: 'Turn it into tasks',
      description: 'Break the PRD into a reviewed task list on your board.',
      done: tasks.some((t) => t.sourceDocId),
      action: 'Generate tasks',
      disabled: !prd,
      run: () => { if (prd) openTaskReview(prd.id) },
    },
    {
      id: 'team',
      title: 'Invite your team',
      description: `Teammates join with your invite code ${workspace.joinCode} when they create an account.`,
      done: teammatesWithLogin > 1,
      action: 'Copy invite code',
      run: async () => {
        try {
          await navigator.clipboard.writeText(workspace.joinCode)
          toast.success(`Invite code ${workspace.joinCode} copied`)
        } catch {
          toast.info(`Your invite code is ${workspace.joinCode}`)
        }
      },
    },
    {
      id: 'research',
      title: 'Add user research',
      description: 'Paste interview notes and get themes, quotes and feature ideas.',
      done: insights.length > 0,
      action: 'Open research',
      run: () => setActiveSidebarTab('research'),
    },
    {
      id: 'sprint',
      title: 'Plan a sprint',
      description: 'Set capacity per person and let the AI propose what fits.',
      done: sprints.length > 0,
      action: 'Open the board',
      disabled: tasks.length === 0,
      run: () => openTasks(),
    },
  ]

  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null
  const next = steps.find((s) => !s.done && !s.disabled)

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(user.id), '1') } catch { /* storage unavailable */ }
    setDismissed(true)
  }

  return (
    <section
      className="rounded-xl p-5"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.3)' }}
      aria-label="Getting started"
    >
      <header className="flex items-start gap-3">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: 'rgba(99,102,241,0.2)' }}>
          <Rocket size={16} style={{ color: '#a5b4fc' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>Get started with Prodly</h2>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{doneCount} of {steps.length} done. Each step ticks itself off as you go.</p>
          <div className="h-1.5 rounded-full overflow-hidden mt-2 max-w-xs" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%`, background: '#818cf8' }} />
          </div>
        </div>
        <button onClick={dismiss} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: '#9d9da6' }} aria-label="Dismiss getting started" title="Dismiss">
          <X size={14} />
        </button>
      </header>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, i) => {
          const isNext = step.id === next?.id
          return (
            <li
              key={step.id}
              className="flex flex-col rounded-lg p-3"
              style={{
                background: step.done ? 'rgba(34,197,94,0.06)' : '#141416',
                border: `1px solid ${isNext ? 'rgba(129,140,248,0.6)' : step.done ? 'rgba(34,197,94,0.25)' : '#27272a'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center rounded-full flex-shrink-0 text-[11px] font-semibold"
                  style={{
                    width: 20, height: 20,
                    background: step.done ? '#22c55e' : isNext ? '#6366f1' : '#27272a',
                    color: step.done || isNext ? '#fff' : '#9d9da6',
                  }}
                >
                  {step.done ? <Check size={12} /> : i + 1}
                </span>
                <span className="text-xs font-semibold" style={{ color: step.done ? '#86efac' : '#f4f4f5' }}>{step.title}</span>
              </div>
              <p className="text-[11px] leading-relaxed mt-1.5 flex-1" style={{ color: '#a1a1aa' }}>{step.description}</p>
              {!step.done && (
                <button
                  onClick={step.run}
                  disabled={step.disabled}
                  className="mt-2.5 inline-flex items-center justify-center gap-1 self-start px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={isNext
                    ? { background: '#6366f1', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid #2e2e32' }}
                  title={step.disabled ? 'Do the earlier steps first' : undefined}
                >
                  {step.action}
                  <ArrowRight size={11} />
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
