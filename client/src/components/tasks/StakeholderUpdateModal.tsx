import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, FilePlus2, Megaphone, RefreshCw, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { AIError, isAbort, streamAI, toAIError } from '@/lib/ai'
import { AIErrorNotice, SlowAINotice, useSlowAI } from '@/components/ui/AIStatus'
import { markdownToHtml } from '@/lib/markdown'
import { toast } from '@/lib/toast'
import type { Member, Task } from '@/lib/types'
import Modal from './Modal'
import { isOverdue } from './meta'

type Audience = 'Team' | 'Leadership' | 'Slack'

const AUDIENCES: { id: Audience; description: string }[] = [
  { id: 'Team',       description: 'Detailed, task-level' },
  { id: 'Leadership', description: 'Outcomes and risks' },
  { id: 'Slack',      description: 'Short and scannable' },
]

const PERIODS = [7, 14, 30]

/** Turns the workspace's real data into a compact brief for the AI. */
function buildBrief(
  days: number,
  tasks: Task[],
  members: Member[],
  features: { title: string; status: string; priority: string }[],
  insights: { theme: string; frequency: number }[],
  docTitle: (id: string | null) => string | null,
): string {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const who = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'unassigned'
  const line = (t: Task) => {
    const prd = docTitle(t.sourceDocId)
    return `- ${t.title} (${t.priority}, ${who(t.assigneeId)}${t.dueDate ? `, due ${t.dueDate}` : ''}${prd ? `, PRD: ${prd}` : ''})`
  }
  const section = (title: string, list: string[]) => `${title}:\n${list.length ? list.join('\n') : '- none'}`

  const done = tasks.filter((t) => t.status === 'done' && new Date(t.updatedAt).getTime() >= since)
  const inProgress = tasks.filter((t) => t.status === 'in-progress')
  const review = tasks.filter((t) => t.status === 'review')
  const todo = tasks.filter((t) => t.status === 'todo')
  const overdue = tasks.filter((t) => t.status !== 'done' && isOverdue(t.dueDate))
  const topTodo = [...todo].sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 8)

  return [
    `Reporting period: last ${days} days (today is ${new Date().toISOString().slice(0, 10)}).`,
    section(`Completed in this period (${done.length})`, done.map(line)),
    section(`In progress (${inProgress.length})`, inProgress.map(line)),
    section(`In review (${review.length})`, review.map(line)),
    section(`Overdue (${overdue.length})`, overdue.map(line)),
    section(`Highest-priority tasks not started (${todo.length} total)`, topTodo.map(line)),
    section('Roadmap', features.map((f) => `- ${f.title} — ${f.status} (${f.priority})`)),
    section('Top research themes', [...insights].sort((a, b) => b.frequency - a.frequency).slice(0, 3).map((i) => `- ${i.theme} (mentioned by ${i.frequency} users)`)),
  ].join('\n\n')
}

/** Drafts a status update for stakeholders from the board, roadmap and research. */
export default function StakeholderUpdateModal({ onClose }: { onClose: () => void }) {
  const { tasks, members, features, insights, documents, addDocument, setActiveDoc } = useWorkspaceStore()
  const [audience, setAudience] = useState<Audience>('Leadership')
  const [days, setDays] = useState(7)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState<AIError | null>(null)
  const [copied, setCopied] = useState(false)
  const slow = useSlowAI(status === 'streaming' && !text)
  const abortRef = useRef<AbortController | null>(null)

  const generate = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setText('')
    setError(null)
    setStatus('streaming')

    const docTitle = (id: string | null) => documents.find((d) => d.id === id)?.title ?? null
    const brief = buildBrief(days, tasks, members, features, insights, docTitle)

    try {
      await streamAI(
        { workflow: 'update', userMessage: `Write a status update for this audience: ${audience}.\n\nTEAM DATA:\n${brief}` },
        { signal: controller.signal, onText: setText },
      )
      setStatus('done')
    } catch (err) {
      if (isAbort(err)) return
      setError(toAIError(err))
      setText('')
      setStatus('error')
    }
  }

  const close = () => {
    abortRef.current?.abort()
    onClose()
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const saveAsDoc = () => {
    const title = `${audience} update — ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    // Created with its content in one request, so there's no follow-up save to race
    const id = addDocument({ title, content: markdownToHtml(text), type: 'general', tags: ['update'] })
    setActiveDoc(id)
    toast.success(`Saved "${title}"`)
    close()
  }

  return (
    <Modal
      title={<span className="flex items-center gap-2"><Megaphone size={14} style={{ color: '#818cf8' }} />Stakeholder update</span>}
      subtitle="Written from your tasks, roadmap and research. Nothing is invented."
      onClose={close}
      width={680}
      footer={
        status === 'done' ? (
          <>
            <button onClick={generate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs hover:bg-white/5" style={{ color: '#a1a1aa' }}>
              <RefreshCw size={12} />
              Rewrite
            </button>
            <button onClick={copy} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium" style={{ border: '1px solid #3f3f46', color: copied ? '#4ade80' : '#e4e4e7' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={saveAsDoc} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium" style={{ background: '#6366f1', color: '#fff' }}>
              <FilePlus2 size={12} />
              Save as document
            </button>
          </>
        ) : (
          <button
            onClick={generate}
            disabled={status === 'streaming'}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            <Sparkles size={12} className={status === 'streaming' ? 'animate-spin' : undefined} />
            {status === 'streaming' ? 'Writing…' : 'Write update'}
          </button>
        )
      }
    >
      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Audience</span>
            <div className="flex gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAudience(a.id)}
                  className="px-3 py-1.5 rounded-lg text-left transition-colors"
                  style={{
                    background: audience === a.id ? 'rgba(99,102,241,0.15)' : '#18181b',
                    border: `1px solid ${audience === a.id ? 'rgba(99,102,241,0.5)' : '#2a2a2e'}`,
                  }}
                >
                  <span className="block text-xs font-medium" style={{ color: audience === a.id ? '#e0e7ff' : '#d4d4d8' }}>{a.id}</span>
                  <span className="block text-[11px]" style={{ color: '#9d9da6' }}>{a.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Period</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg px-2.5 py-2 text-xs outline-none"
              style={{ background: '#18181b', border: '1px solid #2a2a2e', color: '#d4d4d8' }}
            >
              {PERIODS.map((p) => <option key={p} value={p}>Last {p} days</option>)}
            </select>
          </div>
        </div>

        {slow && <SlowAINotice />}
        {status === 'error' && error && <AIErrorNotice error={error} onRetry={generate} />}

        {text ? (
          <div className="rounded-lg px-4 py-3 text-sm leading-relaxed update-markdown" style={{ background: '#18181b', border: '1px solid #27272a', color: '#d4d4d8' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : status === 'streaming' ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />)}</div>
        ) : (
          <p className="text-xs" style={{ color: '#9d9da6' }}>
            Pick an audience and period, then write the update. It uses {tasks.length} tasks, {features.length} roadmap features and {insights.length} research themes.
          </p>
        )}
      </div>
    </Modal>
  )
}
