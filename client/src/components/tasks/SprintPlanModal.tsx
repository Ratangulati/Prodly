import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Loader2, Rocket, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { AIError, postAI, toAIError } from '@/lib/ai'
import { AIErrorNotice, SlowAINotice, useSlowAI } from '@/components/ui/AIStatus'
import Modal from './Modal'
import MemberAvatar from './MemberAvatar'
import { PRIORITY_META } from './meta'

/** Story points per t-shirt estimate; matches the server. */
const ESTIMATE_POINTS: Record<string, number> = { XS: 1, S: 2, M: 3, L: 5, XL: 8, '': 3 }

interface Plan {
  goal: string
  committed: { taskId: string; assigneeId: string; points: number; reason: string }[]
  deferred: { taskId: string; reason: string }[]
}

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

const fieldStyle = { background: '#18181b', border: '1px solid #2a2a2e', color: '#e4e4e7' }

/** Plans the next sprint with AI suggestions, then starts it. */
export default function SprintPlanModal({ onClose }: { onClose: () => void }) {
  const { tasks, members, sprints, startSprint } = useWorkspaceStore()

  const [name, setName] = useState(`Sprint ${sprints.length + 1}`)
  const [weeks, setWeeks] = useState(2)
  const [startDate, setStartDate] = useState(toIsoDate(new Date()))
  const [capacity, setCapacity] = useState<Record<string, number>>(() =>
    Object.fromEntries(members.map((m) => [m.id, 10])),
  )
  const [plan, setPlan] = useState<Plan | null>(null)
  const [goal, setGoal] = useState('')
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [assignees, setAssignees] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<AIError | null>(null)
  const slow = useSlowAI(loading)

  const openTasks = tasks.filter((t) => t.status !== 'done' && !t.sprintId)
  const endDate = addDays(startDate, weeks * 7 - 1)
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const setWeeksAndCapacity = (w: number) => {
    // Scale each person's capacity with the sprint length
    setCapacity((prev) => Object.fromEntries(Object.entries(prev).map(([id, pts]) => [id, Math.round((pts / weeks) * w)])))
    setWeeks(w)
  }

  const requestPlan = async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await postAI<Plan>('/api/ai/sprint', { capacity })
      setPlan(p)
      setGoal(p.goal)
      setIncluded(Object.fromEntries([...p.committed.map((c) => [c.taskId, true]), ...p.deferred.map((d) => [d.taskId, false])]))
      setAssignees(Object.fromEntries(p.committed.map((c) => [c.taskId, c.assigneeId])))
    } catch (err) {
      setError(toAIError(err))
    } finally {
      setLoading(false)
    }
  }

  // Points each person would carry with the current selection
  const load = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const [taskId, on] of Object.entries(included)) {
      if (!on) continue
      const who = assignees[taskId] ?? taskById.get(taskId)?.assigneeId
      if (!who) continue
      totals[who] = (totals[who] ?? 0) + (ESTIMATE_POINTS[taskById.get(taskId)?.estimate ?? ''] ?? 3)
    }
    return totals
  }, [included, assignees, taskById])

  const selectedIds = Object.entries(included).filter(([, on]) => on).map(([id]) => id)

  const start = async () => {
    setStarting(true)
    try {
      await startSprint({
        name: name.trim() || `Sprint ${sprints.length + 1}`,
        goal,
        startDate,
        endDate,
        assignments: selectedIds.map((taskId) => ({ taskId, assigneeId: assignees[taskId] ?? taskById.get(taskId)?.assigneeId ?? null })),
      })
      toast.success(`${name} started with ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sprint')
      setStarting(false)
    }
  }

  const reasonFor = (taskId: string) =>
    plan?.committed.find((c) => c.taskId === taskId)?.reason ?? plan?.deferred.find((d) => d.taskId === taskId)?.reason ?? ''

  const renderRow = (taskId: string) => {
    const t = taskById.get(taskId)
    if (!t) return null
    const on = included[taskId]
    const priority = PRIORITY_META[t.priority] ?? PRIORITY_META.P2
    return (
      <div key={taskId} className="flex gap-3 rounded-lg px-3 py-2.5" style={{ background: on ? '#18181b' : 'transparent', border: `1px solid ${on ? '#2a2a2e' : '#1f1f23'}` }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setIncluded((prev) => ({ ...prev, [taskId]: e.target.checked }))}
          className="mt-0.5 accent-indigo-500"
          aria-label={`Include ${t.title}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate" style={{ color: on ? '#f4f4f5' : '#a1a1aa' }}>{t.title}</span>
            <span className="px-1.5 rounded text-[11px] font-semibold flex-shrink-0" style={{ background: priority.bg, color: priority.color }}>{t.priority}</span>
            <span className="text-[11px] flex-shrink-0" style={{ color: '#9d9da6' }}>{ESTIMATE_POINTS[t.estimate] ?? 3} pts</span>
          </div>
          {reasonFor(taskId) && <p className="text-[11px] mt-0.5" style={{ color: '#9d9da6' }}>{reasonFor(taskId)}</p>}
        </div>
        {on && (
          <select
            value={assignees[taskId] ?? t.assigneeId ?? ''}
            onChange={(e) => setAssignees((prev) => ({ ...prev, [taskId]: e.target.value }))}
            className="self-start rounded px-1.5 py-1 text-[11px] outline-none"
            style={fieldStyle}
            aria-label="Assignee"
          >
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
    )
  }

  return (
    <Modal
      title={<span className="flex items-center gap-2"><CalendarRange size={14} style={{ color: '#818cf8' }} />Plan a sprint</span>}
      subtitle={`${openTasks.length} open task${openTasks.length === 1 ? '' : 's'} in the backlog`}
      onClose={onClose}
      width={760}
      footer={
        plan ? (
          <>
            <button onClick={() => setPlan(null)} className="px-3 py-1.5 rounded-md text-xs hover:bg-white/5" style={{ color: '#a1a1aa' }}>Back</button>
            <span className="ml-auto text-[11px]" style={{ color: '#9d9da6' }}>{selectedIds.length} tasks · {startDate} → {endDate}</span>
            <button
              onClick={start}
              disabled={starting || selectedIds.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
              style={{ background: '#6366f1', color: '#fff' }}
            >
              {starting ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
              Start sprint
            </button>
          </>
        ) : (
          <button
            onClick={requestPlan}
            disabled={loading || openTasks.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? 'Planning…' : 'Suggest a plan'}
          </button>
        )
      }
    >
      {!plan ? (
        <div className="px-5 py-4 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none" style={fieldStyle} />
            </label>
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Starts</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none" style={{ ...fieldStyle, colorScheme: 'dark' }} />
            </label>
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Length</span>
              <select value={weeks} onChange={(e) => setWeeksAndCapacity(Number(e.target.value))} className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none" style={fieldStyle}>
                {[1, 2, 3].map((w) => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9d9da6' }}>Capacity (points)</span>
            <p className="text-[11px] mb-2.5" style={{ color: '#8a8a93' }}>XS = 1 · S = 2 · M = 3 · L = 5 · XL = 8. Set 0 for anyone who is away.</p>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: '#18181b', border: '1px solid #2a2a2e' }}>
                  <MemberAvatar member={m} size={22} />
                  <span className="flex-1 text-xs truncate" style={{ color: '#e4e4e7' }}>{m.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={capacity[m.id] ?? 0}
                    onChange={(e) => setCapacity((prev) => ({ ...prev, [m.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-16 rounded px-2 py-1 text-xs text-right outline-none"
                    style={{ background: '#0f0f11', border: '1px solid #2a2a2e', color: '#e4e4e7' }}
                    aria-label={`${m.name} capacity`}
                  />
                </label>
              ))}
            </div>
          </div>

          {loading && slow && <SlowAINotice />}
          {error && <AIErrorNotice error={error} onRetry={requestPlan} />}
        </div>
      ) : (
        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>Sprint goal</span>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={fieldStyle} />
          </label>

          <div className="flex flex-wrap gap-2">
            {members.filter((m) => (capacity[m.id] ?? 0) > 0 || load[m.id]).map((m) => {
              const used = load[m.id] ?? 0
              const cap = capacity[m.id] ?? 0
              const over = used > cap
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: '#18181b', border: `1px solid ${over ? 'rgba(239,68,68,0.5)' : '#2a2a2e'}` }}>
                  <MemberAvatar member={m} size={18} />
                  <span className="text-[11px] tabular-nums" style={{ color: over ? '#fca5a5' : '#a1a1aa' }}>{used}/{cap} pts</span>
                </div>
              )
            })}
          </div>

          <div>
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-2" style={{ color: '#9d9da6' }}>Committed · {plan.committed.length}</span>
            <div className="space-y-1.5">{plan.committed.map((c) => renderRow(c.taskId))}</div>
          </div>
          {plan.deferred.length > 0 && (
            <div>
              <span className="block text-[11px] uppercase tracking-wider font-medium mb-2" style={{ color: '#9d9da6' }}>Left in the backlog · {plan.deferred.length}</span>
              <div className="space-y-1.5">{plan.deferred.map((d) => renderRow(d.taskId))}</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
