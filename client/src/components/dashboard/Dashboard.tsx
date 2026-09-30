import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, AtSign, CalendarRange, FileText, FlaskConical, Flag, LayoutDashboard, ListChecks } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import { commentsApi, type Comment } from '@/lib/comments'
import type { FeatureStatus, Task } from '@/lib/types'
import MemberAvatar from '@/components/tasks/MemberAvatar'
import { PRIORITY_META, formatDue, isOverdue } from '@/components/tasks/meta'
import { CommentBody } from '@/components/comments/CommentThread'
import GettingStarted from './GettingStarted'

const BAR_COLOR = '#6366f1'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4 flex flex-col min-w-0" style={{ background: '#141416', border: '1px solid #1f1f23' }}>
      <header className="flex items-center gap-2 mb-3">
        <span style={{ color: '#818cf8' }}>{icon}</span>
        <h2 className="text-xs font-semibold" style={{ color: '#e4e4e7' }}>{title}</h2>
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  )
}

function Stat({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'bad' | 'good' }) {
  const color = tone === 'bad' ? '#fca5a5' : tone === 'good' ? '#86efac' : '#f4f4f5'
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: '#141416', border: '1px solid #1f1f23' }}>
      <p className="text-[11px]" style={{ color: '#a1a1aa' }}>{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-[11px] mt-0.5" style={{ color: '#9d9da6' }}>{hint}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs py-2" style={{ color: '#9d9da6' }}>{children}</p>
}

interface BarRow {
  key: string
  label: React.ReactNode
  /** How full the bar is, 0–1. */
  fraction: number
  /** Text shown at the end of the bar. */
  value: React.ReactNode
  tooltip: string
}

/** One horizontal bar per row, single colour, value labelled at the end. */
function BarList({ rows }: { rows: BarRow[] }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2.5" title={r.tooltip}>
          <span className="w-28 flex-shrink-0 min-w-0">{r.label}</span>
          <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#1f1f23' }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(1, r.fraction) * 100}%`, background: BAR_COLOR, minWidth: r.fraction > 0 ? 4 : 0 }}
            />
          </span>
          <span className="w-14 text-right text-[11px] tabular-nums flex-shrink-0" style={{ color: '#d4d4d8' }}>{r.value}</span>
        </li>
      ))}
    </ul>
  )
}

const unitLabel = (n: number, unit: string) => <>{n} <span style={{ color: '#9d9da6' }}>{unit}</span></>

function TaskRow({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const members = useWorkspaceStore((s) => s.members)
  const assignee = members.find((m) => m.id === task.assigneeId)
  const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.P2
  const overdue = task.status !== 'done' && isOverdue(task.dueDate)
  return (
    <li>
      <button onClick={() => onOpen(task.id)} className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 -mx-2 text-left hover:bg-white/5">
        <span className="px-1.5 rounded text-[11px] font-semibold flex-shrink-0" style={{ background: priority.bg, color: priority.color }}>{task.priority}</span>
        <span className="flex-1 min-w-0 text-xs truncate" style={{ color: '#e4e4e7' }}>{task.title}</span>
        {task.dueDate && (
          <span className="text-[11px] flex-shrink-0" style={{ color: overdue ? '#fca5a5' : '#71717a' }}>
            {overdue ? 'Overdue · ' : ''}{formatDue(task.dueDate)}
          </span>
        )}
        <MemberAvatar member={assignee} size={18} />
      </button>
    </li>
  )
}

/** Workspace overview: my work, what's at risk, progress and recent activity. */
export default function Dashboard() {
  const {
    tasks, members, features, insights, documents, sprints,
    openTask, openTasks, setActiveDoc, setActiveSidebarTab,
  } = useWorkspaceStore()
  const user = useAuthStore((s) => s.user)
  const workspace = useAuthStore((s) => s.workspace)
  const [mentions, setMentions] = useState<Comment[] | null>(null)

  useEffect(() => {
    commentsApi.mentions().then(setMentions).catch(() => setMentions([]))
  }, [])

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done')
    const overdue = open.filter((t) => isOverdue(t.dueDate))
    const doneThisWeek = tasks.filter((t) => t.status === 'done' && Date.now() - new Date(t.updatedAt).getTime() < WEEK_MS)
    const mine = open.filter((t) => t.assigneeId && t.assigneeId === user?.memberId)
    return { open, overdue, doneThisWeek, mine }
  }, [tasks, user?.memberId])

  const activeSprint = sprints.find((s) => s.status === 'active')
  const sprintTasks = activeSprint ? tasks.filter((t) => t.sprintId === activeSprint.id) : []
  const sprintDone = sprintTasks.filter((t) => t.status === 'done').length

  const workload = members
    .map((m) => ({ member: m, count: stats.open.filter((t) => t.assigneeId === m.id).length }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count)
  const unassigned = stats.open.filter((t) => !t.assigneeId).length

  const prdProgress = documents
    .filter((d) => d.type === 'prd')
    .map((d) => {
      const own = tasks.filter((t) => t.sourceDocId === d.id)
      return { doc: d, total: own.length, done: own.filter((t) => t.status === 'done').length }
    })
    .filter((p) => p.total > 0)

  const roadmap = (['Now', 'Next', 'Later', 'Done'] as FeatureStatus[]).map((s) => ({ status: s, count: features.filter((f) => f.status === s).length }))
  const recentDocs = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const topThemes = [...insights].sort((a, b) => b.frequency - a.frequency).slice(0, 4)
  const maxThemeFreq = Math.max(1, ...topThemes.map((i) => i.frequency))

  const goToMention = (m: Comment) => (m.targetType === 'task' ? openTask(m.targetId) : setActiveDoc(m.targetId))
  const firstName = user?.name.split(' ')[0] ?? 'there'

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0f0f0f' }}>
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <header className="flex items-center gap-3">
          <LayoutDashboard size={18} style={{ color: '#818cf8' }} />
          <div>
            <h1 className="text-base font-semibold" style={{ color: '#f4f4f5' }}>Hi {firstName}</h1>
            <p className="text-[11px]" style={{ color: '#9d9da6' }}>{workspace?.name} at a glance</p>
          </div>
        </header>

        <GettingStarted />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Open tasks" value={stats.open.length} hint={`${unassigned} unassigned`} />
          <Stat label="Overdue" value={stats.overdue.length} tone={stats.overdue.length ? 'bad' : 'default'} hint={stats.overdue.length ? 'Needs attention' : 'Nothing late'} />
          <Stat label="Done in the last 7 days" value={stats.doneThisWeek.length} tone={stats.doneThisWeek.length ? 'good' : 'default'} />
          <Stat
            label={activeSprint ? activeSprint.name : 'Sprint'}
            value={activeSprint ? `${sprintDone}/${sprintTasks.length}` : '—'}
            hint={activeSprint ? `tasks done · ends ${formatDue(activeSprint.endDate)}` : 'No active sprint'}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <Card
            title={`My tasks · ${stats.mine.length}`}
            icon={<ListChecks size={14} />}
            action={<button onClick={() => openTasks()} className="text-[11px]" style={{ color: '#a5b4fc' }}>Open board</button>}
          >
            {stats.mine.length ? (
              <ul className="space-y-0.5">
                {[...stats.mine].sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 6).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
              </ul>
            ) : <Empty>Nothing assigned to you right now.</Empty>}
          </Card>

          <Card title={`Overdue · ${stats.overdue.length}`} icon={<AlertTriangle size={14} />}>
            {stats.overdue.length ? (
              <ul className="space-y-0.5">{stats.overdue.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}</ul>
            ) : <Empty>No overdue tasks. Nice.</Empty>}
          </Card>

          <Card title="Open tasks per person" icon={<CalendarRange size={14} />}>
            {workload.length ? (
              <BarList
                rows={workload.map((w) => ({
                  key: w.member.id,
                  fraction: w.count / workload[0].count,
                  value: unitLabel(w.count, 'open'),
                  tooltip: `${w.member.name}: ${w.count} open task${w.count === 1 ? '' : 's'}`,
                  label: (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MemberAvatar member={w.member} size={18} />
                      <span className="text-[11px] truncate" style={{ color: '#d4d4d8' }}>{w.member.name}</span>
                    </span>
                  ),
                }))}
              />
            ) : <Empty>No assigned open tasks.</Empty>}
          </Card>

          <Card title="PRD progress" icon={<Flag size={14} />}>
            {prdProgress.length ? (
              <BarList
                rows={prdProgress.map((p) => ({
                  key: p.doc.id,
                  fraction: p.done / p.total,
                  value: <>{p.done}/{p.total}</>,
                  tooltip: `${p.doc.title}: ${p.done} of ${p.total} tasks done`,
                  label: (
                    <button onClick={() => openTasks(p.doc.id)} className="block text-[11px] truncate text-left w-full hover:underline" style={{ color: '#d4d4d8' }} title={p.doc.title}>
                      {p.doc.title}
                    </button>
                  ),
                }))}
              />
            ) : <Empty>Generate tasks from a PRD to track its progress here.</Empty>}
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <Card title="Roadmap" icon={<CalendarRange size={14} />} action={<button onClick={() => setActiveSidebarTab('roadmap')} className="text-[11px]" style={{ color: '#a5b4fc' }}>Open</button>}>
            <div className="grid grid-cols-4 gap-2">
              {roadmap.map((r) => (
                <div key={r.status} className="rounded-lg px-2 py-2 text-center" style={{ background: '#18181b' }}>
                  <p className="text-lg font-semibold tabular-nums" style={{ color: '#f4f4f5' }}>{r.count}</p>
                  <p className="text-[11px]" style={{ color: '#a1a1aa' }}>{r.status}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Top research themes" icon={<FlaskConical size={14} />}>
            {topThemes.length ? (
              <BarList
                rows={topThemes.map((i) => ({
                  key: i.id,
                  fraction: i.frequency / maxThemeFreq,
                  value: unitLabel(i.frequency, 'users'),
                  tooltip: `${i.theme}: mentioned by ${i.frequency} users`,
                  label: <span className="block text-[11px] truncate" style={{ color: '#d4d4d8' }} title={i.theme}>{i.theme}</span>,
                }))}
              />
            ) : <Empty>Analyze research notes to see themes here.</Empty>}
          </Card>

          <Card title="Recent documents" icon={<FileText size={14} />}>
            {recentDocs.length ? (
              <ul className="space-y-0.5">
                {recentDocs.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setActiveDoc(d.id)} className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 -mx-2 text-left hover:bg-white/5">
                      <span className="flex-1 min-w-0 text-xs truncate" style={{ color: '#e4e4e7' }}>{d.title}</span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: '#9d9da6' }}>{formatDistanceToNow(new Date(d.updatedAt), { addSuffix: true })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <Empty>No documents yet.</Empty>}
          </Card>
        </div>

        <Card title="Recent mentions" icon={<AtSign size={14} />}>
          {mentions === null ? (
            <div className="skeleton h-8 w-full" />
          ) : mentions.length ? (
            <ul className="space-y-1">
              {mentions.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <button onClick={() => goToMention(m)} className="flex gap-2 w-full rounded-md px-2 py-1.5 -mx-2 text-left hover:bg-white/5">
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: '#e4e4e7' }}>{m.author.name}</span>
                    <span className="flex-1 min-w-0 text-xs truncate" style={{ color: '#a1a1aa' }}>
                      <CommentBody body={m.body} mentions={m.mentions} members={members} />
                    </span>
                    <span className="text-[11px] flex-shrink-0" style={{ color: '#9d9da6' }}>{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty>No one has mentioned you yet.</Empty>}
        </Card>
      </div>
    </div>
  )
}
