import { useMemo, useRef, useState, useEffect } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CalendarRange, ChevronDown, Flag, ListChecks, Loader2, Megaphone, Plus, Search, Sparkles, Upload, Users, X } from 'lucide-react'
import { sortTasks, useWorkspaceStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import type { Task, TaskStatus } from '@/lib/types'
import TaskCard from './TaskCard'
import TaskDetail from './TaskDetail'
import TeamModal from './TeamModal'
import StakeholderUpdateModal from './StakeholderUpdateModal'
import SprintPlanModal from './SprintPlanModal'
import { toast } from '@/lib/toast'
import MemberAvatar from './MemberAvatar'
import { TASK_COLUMNS } from './meta'

const COLUMN_PREFIX = 'column:'

/* ── Column ───────────────────────────────────────────────────────── */
function Column({
  status, label, color, tasks, isOver, onOpen, onQuickAdd,
}: {
  status: TaskStatus
  label: string
  color: string
  tasks: Task[]
  isOver: boolean
  onOpen: (id: string) => void
  onQuickAdd: (status: TaskStatus, title: string) => void
}) {
  const { setNodeRef } = useDroppable({ id: COLUMN_PREFIX + status })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = () => {
    if (title.trim()) onQuickAdd(status, title.trim())
    setTitle('')
  }

  return (
    <section
      ref={setNodeRef}
      className="flex flex-col rounded-xl min-w-[220px] flex-1 transition-colors"
      style={{
        background: isOver ? 'rgba(99,102,241,0.07)' : '#141416',
        border: `1px solid ${isOver ? 'rgba(99,102,241,0.45)' : '#1f1f23'}`,
      }}
    >
      <header className="flex items-center gap-2 px-3.5 py-3">
        <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
        <h3 className="text-xs font-semibold" style={{ color: '#d4d4d8' }}>{label}</h3>
        <span className="px-1.5 rounded text-[11px] font-semibold tabular-nums" style={{ background: '#27272a', color: '#a1a1aa' }}>
          {tasks.length}
        </span>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto p-1 rounded transition-colors hover:bg-white/10"
          style={{ color: '#9d9da6' }}
          aria-label={`Add task to ${label}`}
        >
          <Plus size={13} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2 min-h-[80px]">
        {adding && (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setTitle(''); setAdding(false) }
            }}
            onBlur={() => { submit(); setAdding(false) }}
            placeholder="Task title, then Enter"
            className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none"
            style={{ background: '#1b1b1e', border: '1px solid #6366f1', color: '#e4e4e7' }}
          />
        )}

        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpen} />)}
        </SortableContext>

        {tasks.length === 0 && !adding && (
          <div
            className="flex items-center justify-center rounded-lg py-6 text-[11px]"
            style={{ border: '1px dashed #27272a', color: '#8a8a93' }}
          >
            Drop tasks here
          </div>
        )}
      </div>
    </section>
  )
}

/* ── "Generate from PRD" menu ─────────────────────────────────────── */
function GenerateMenu() {
  const { documents, openTaskReview } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prds = documents.filter((d) => d.type === 'prd')

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
      >
        <Sparkles size={12} />
        Generate from PRD
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-20 w-72 rounded-lg py-1 shadow-2xl"
          style={{ background: '#18181b', border: '1px solid #27272a' }}
        >
          {prds.length === 0 ? (
            <p className="px-3 py-2.5 text-xs" style={{ color: '#9d9da6' }}>No PRDs yet. Create one first.</p>
          ) : prds.map((d) => (
            <button
              key={d.id}
              onClick={() => { openTaskReview(d.id); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-xs truncate transition-colors hover:bg-white/5"
              style={{ color: '#d4d4d8' }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Board ────────────────────────────────────────────────────────── */
export default function TasksBoard() {
  const {
    tasks, members, documents, taskDocFilter, setTaskDocFilter,
    addTask, moveTask, focusTaskId, clearFocusTask, sprints, completeSprint, integrations, exportToGithub,
  } = useWorkspaceStore()
  const [exporting, setExporting] = useState(false)
  const activeSprint = sprints.find((s) => s.status === 'active') ?? null

  const myMemberId = useAuthStore((s) => s.user?.memberId ?? null)
  const [query, setQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null) // member id, 'none', or null for all
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [teamOpen, setTeamOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [sprintOnly, setSprintOnly] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null)

  // Opened from elsewhere, e.g. a mention in the inbox
  useEffect(() => {
    if (!focusTaskId) return
    setSelectedId(focusTaskId)
    clearFocusTask()
  }, [focusTaskId, clearFocusTask])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // a plain click opens the task
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (taskDocFilter && t.sourceDocId !== taskDocFilter) return false
      if (sprintOnly && (!activeSprint || t.sprintId !== activeSprint.id)) return false
      if (assigneeFilter === 'none' && t.assigneeId) return false
      if (assigneeFilter && assigneeFilter !== 'none' && t.assigneeId !== assigneeFilter) return false
      if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, taskDocFilter, assigneeFilter, query, sprintOnly, activeSprint])

  const byStatus = useMemo(() => {
    const groups = {} as Record<TaskStatus, Task[]>
    for (const c of TASK_COLUMNS) groups[c.id] = sortTasks(filtered.filter((t) => t.status === c.id))
    return groups
  }, [filtered])

  const docsWithTasks = useMemo(
    () => documents.filter((d) => tasks.some((t) => t.sourceDocId === d.id)),
    [documents, tasks],
  )

  const scope = taskDocFilter ? tasks.filter((t) => t.sourceDocId === taskDocFilter) : tasks
  const doneCount = scope.filter((t) => t.status === 'done').length
  const progress = scope.length ? Math.round((doneCount / scope.length) * 100) : 0
  const filtersActive = Boolean(query || assigneeFilter || taskDocFilter || sprintOnly)
  const sprintTasks = activeSprint ? tasks.filter((t) => t.sprintId === activeSprint.id) : []
  const sprintDone = sprintTasks.filter((t) => t.status === 'done').length

  // Exports what's on screen (respecting filters) that isn't done or already exported
  const exportable = filtered.filter((t) => t.status !== 'done' && !t.externalUrl)
  const exportVisible = async () => {
    if (!integrations.github || !exportable.length) return
    setExporting(true)
    try {
      const { created, error } = await exportToGithub(exportable.slice(0, 50).map((t) => t.id))
      if (created) toast.success(`Created ${created} issue${created === 1 ? '' : 's'} in ${integrations.github.repo}`)
      if (error) toast.error(error)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export to GitHub')
    } finally {
      setExporting(false)
    }
  }

  const finishSprint = async () => {
    if (!activeSprint) return
    try {
      const returned = await completeSprint(activeSprint.id)
      toast.success(`${activeSprint.name} complete${returned ? ` · ${returned} unfinished task${returned === 1 ? '' : 's'} moved back to the backlog` : ''}`)
      setSprintOnly(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete the sprint')
    } finally {
      setConfirmComplete(false)
    }
  }

  const statusOf = (id: string): TaskStatus | null => {
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length) as TaskStatus
    return tasks.find((t) => t.id === id)?.status ?? null
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = (e: DragOverEvent) => setOverColumn(e.over ? statusOf(String(e.over.id)) : null)

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setOverColumn(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const activeTask = tasks.find((t) => t.id === active.id)
    const targetStatus = statusOf(String(over.id))
    if (!activeTask || !targetStatus) return

    // Dropped on the column itself (empty area) → move to the end
    if (String(over.id).startsWith(COLUMN_PREFIX)) {
      moveTask(activeTask.id, targetStatus, null)
      return
    }

    // Dropped on a card. Within the same column, dragging downwards lands after that card.
    const column = byStatus[targetStatus]
    const overIndex = column.findIndex((t) => t.id === over.id)
    const activeIndex = column.findIndex((t) => t.id === active.id)
    const movingDown = activeTask.status === targetStatus && activeIndex !== -1 && activeIndex < overIndex
    const before = movingDown ? (column[overIndex + 1]?.id ?? null) : String(over.id)
    moveTask(activeTask.id, targetStatus, before)
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  return (
    <div className="relative flex flex-col h-full overflow-hidden" style={{ background: '#0f0f0f' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 lg:px-6 pt-5 pb-4 border-b" style={{ borderColor: '#1e1e1e' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <ListChecks size={18} style={{ color: '#818cf8' }} />
          <div>
            <h1 className="text-base font-semibold" style={{ color: '#f4f4f5' }}>Tasks</h1>
            <p className="text-[11px]" style={{ color: '#9d9da6' }}>
              {scope.length - doneCount} open · {doneCount} done
            </p>
          </div>
          <div className="w-32 h-1.5 rounded-full overflow-hidden ml-2" style={{ background: '#27272a' }} title={`${progress}% complete`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#22c55e' }} />
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: '#9d9da6' }}>{progress}%</span>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {!activeSprint && (
              <button
                onClick={() => setPlanOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
                title="Plan the next sprint with AI"
              >
                <CalendarRange size={12} />
                Plan sprint
              </button>
            )}
            {integrations.github && (
              <button
                onClick={exportVisible}
                disabled={exporting || !exportable.length}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
                title={exportable.length ? `Create GitHub issues for the ${exportable.length} open task(s) shown` : 'Nothing left to export in this view'}
              >
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Export {exportable.length || ''} to GitHub
              </button>
            )}
            <button
              onClick={() => setUpdateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
              style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
              title="Draft a status update for stakeholders"
            >
              <Megaphone size={12} />
              Write update
            </button>
            <button
              onClick={() => setTeamOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
              style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
            >
              <Users size={12} />
              Team
              <span className="flex -space-x-1.5 ml-0.5">
                {members.slice(0, 4).map((m) => <MemberAvatar key={m.id} member={m} size={16} />)}
              </span>
            </button>
            <button
              onClick={() => setSelectedId(addTask({ title: 'New task', sourceDocId: taskDocFilter }))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
              style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
            >
              <Plus size={12} />
              New task
            </button>
            <GenerateMenu />
          </div>
        </div>

        {/* Active sprint */}
        {activeSprint && (
          <div className="flex items-center gap-3 mt-4 rounded-lg px-3.5 py-2.5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <Flag size={14} style={{ color: '#818cf8' }} className="flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: '#e0e7ff' }}>
                {activeSprint.name}
                <span className="font-normal ml-2" style={{ color: '#818cf8' }}>
                  {new Date(`${activeSprint.startDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })} – {new Date(`${activeSprint.endDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </p>
              {activeSprint.goal && <p className="text-[11px] truncate" style={{ color: '#a5b4fc' }}>{activeSprint.goal}</p>}
            </div>
            <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#a5b4fc' }}>{sprintDone}/{sprintTasks.length} done</span>
            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setSprintOnly((v) => !v)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium"
                style={{ background: sprintOnly ? '#6366f1' : 'transparent', color: sprintOnly ? '#fff' : '#c7d2fe', border: '1px solid rgba(99,102,241,0.4)' }}
              >
                {sprintOnly ? 'Showing sprint' : 'Show sprint only'}
              </button>
              {confirmComplete ? (
                <>
                  <button onClick={finishSprint} className="px-2.5 py-1 rounded-md text-[11px] font-medium" style={{ background: '#22c55e', color: '#052e16' }}>Complete</button>
                  <button onClick={() => setConfirmComplete(false)} className="px-2 py-1 rounded-md text-[11px]" style={{ color: '#a1a1aa' }}>Cancel</button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmComplete(true)}
                  className="px-2.5 py-1 rounded-md text-[11px]"
                  style={{ color: '#c7d2fe' }}
                  title="Unfinished tasks go back to the backlog"
                >
                  Complete sprint
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#18181b', border: '1px solid #2a2a2e' }}>
            <Search size={12} style={{ color: '#9d9da6' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks"
              className="bg-transparent outline-none text-xs w-40"
              style={{ color: '#e4e4e7' }}
            />
          </div>

          <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg" style={{ background: '#18181b', border: '1px solid #2a2a2e' }}>
            <button
              onClick={() => setAssigneeFilter(null)}
              className="px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ background: assigneeFilter === null ? '#27272a' : 'transparent', color: assigneeFilter === null ? '#f4f4f5' : '#71717a' }}
            >
              Everyone
            </button>
            {myMemberId && (
              <button
                onClick={() => setAssigneeFilter(assigneeFilter === myMemberId ? null : myMemberId)}
                className="px-2 py-0.5 rounded text-[11px] font-medium"
                style={{ background: assigneeFilter === myMemberId ? 'rgba(99,102,241,0.2)' : 'transparent', color: assigneeFilter === myMemberId ? '#c7d2fe' : '#71717a' }}
              >
                My tasks
              </button>
            )}
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setAssigneeFilter(assigneeFilter === m.id ? null : m.id)}
                className="rounded-full transition-opacity"
                style={{
                  opacity: assigneeFilter && assigneeFilter !== m.id ? 0.35 : 1,
                  outline: assigneeFilter === m.id ? '2px solid #818cf8' : 'none',
                  outlineOffset: 1,
                }}
                title={`Only ${m.name}'s tasks`}
              >
                <MemberAvatar member={m} size={20} />
              </button>
            ))}
            <button
              onClick={() => setAssigneeFilter(assigneeFilter === 'none' ? null : 'none')}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{ background: assigneeFilter === 'none' ? '#27272a' : 'transparent', color: assigneeFilter === 'none' ? '#f4f4f5' : '#71717a' }}
            >
              Unassigned
            </button>
          </div>

          {docsWithTasks.length > 0 && (
            <select
              value={taskDocFilter ?? ''}
              onChange={(e) => setTaskDocFilter(e.target.value || null)}
              className="px-2.5 py-1.5 rounded-lg text-xs outline-none max-w-[240px]"
              style={{ background: '#18181b', border: '1px solid #2a2a2e', color: taskDocFilter ? '#a5b4fc' : '#a1a1aa' }}
            >
              <option value="">All PRDs</option>
              {docsWithTasks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          )}

          {filtersActive && (
            <button
              onClick={() => { setQuery(''); setAssigneeFilter(null); setTaskDocFilter(null); setSprintOnly(false) }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] transition-colors hover:bg-white/5"
              style={{ color: '#a1a1aa' }}
            >
              <X size={11} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      {tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 52, height: 52, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <ListChecks size={22} style={{ color: '#818cf8' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: '#e4e4e7' }}>No tasks yet</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: '#9d9da6' }}>
            Turn a PRD into an implementation plan with <strong style={{ color: '#a5b4fc' }}>Generate from PRD</strong>,
            or add tasks by hand with <strong style={{ color: '#d4d4d8' }}>New task</strong>.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => { setActiveId(null); setOverColumn(null) }}
        >
          <div className="flex-1 flex gap-3 p-4 overflow-x-auto overflow-y-hidden">
            {TASK_COLUMNS.map((c) => (
              <Column
                key={c.id}
                status={c.id}
                label={c.label}
                color={c.color}
                tasks={byStatus[c.id]}
                isOver={activeId !== null && overColumn === c.id}
                onOpen={setSelectedId}
                onQuickAdd={(status, title) => addTask({ title, status, sourceDocId: taskDocFilter })}
              />
            ))}
          </div>
          <DragOverlay>{activeTask && <TaskCard task={activeTask} isOverlay />}</DragOverlay>
        </DndContext>
      )}

      {selectedId && <TaskDetail taskId={selectedId} onClose={() => setSelectedId(null)} />}
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
      {updateOpen && <StakeholderUpdateModal onClose={() => setUpdateOpen(false)} />}
      {planOpen && <SprintPlanModal onClose={() => setPlanOpen(false)} />}
    </div>
  )
}
