import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Trash2, Upload, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useWorkspaceStore } from '@/lib/store'
import type { FeaturePriority, TaskEstimate, TaskStatus } from '@/lib/types'
import { ESTIMATES, PRIORITIES, PRIORITY_META, TASK_COLUMNS } from './meta'
import CommentThread from '@/components/comments/CommentThread'

const fieldStyle = { background: '#18181b', border: '1px solid #2a2a2e', color: '#e4e4e7' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>{label}</span>
      {children}
    </label>
  )
}

/** Slide-over panel for viewing and editing every field of a task. */
export default function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { tasks, members, documents, sprints, integrations, updateTask, deleteTask, setActiveDoc, exportToGithub } = useWorkspaceStore()
  const [exporting, setExporting] = useState(false)
  const activeSprint = sprints.find((s) => s.status === 'active')
  const task = tasks.find((t) => t.id === taskId)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setConfirmDelete(false)
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!task) return null

  const sourceDoc = documents.find((d) => d.id === task.sourceDocId)

  const commitTitle = () => {
    const next = title.trim()
    if (next && next !== task.title) updateTask(task.id, { title: next })
    else setTitle(task.title)
  }

  const commitDescription = () => {
    if (description !== task.description) updateTask(task.id, { description })
  }

  return (
    <>
      <div className="absolute inset-0 z-20" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <aside
        className="absolute top-0 right-0 bottom-0 z-30 flex flex-col w-full border-l shadow-2xl"
        style={{ maxWidth: 420, background: '#141416', borderColor: '#27272a' }}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: '#27272a' }}>
          <span className="text-[11px] font-medium" style={{ color: '#9d9da6' }}>Task details</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10" style={{ color: '#9d9da6' }} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }}
            rows={2}
            className="w-full bg-transparent resize-none outline-none text-base font-semibold leading-snug"
            style={{ color: '#f4f4f5' }}
            placeholder="Task title"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={task.status}
                onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={fieldStyle}
              >
                {TASK_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>

            <Field label="Assignee">
              <select
                value={task.assigneeId ?? ''}
                onChange={(e) => updateTask(task.id, { assigneeId: e.target.value || null })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={fieldStyle}
              >
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={task.priority}
                onChange={(e) => updateTask(task.id, { priority: e.target.value as FeaturePriority })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={fieldStyle}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </select>
            </Field>

            <Field label="Estimate">
              <select
                value={task.estimate}
                onChange={(e) => updateTask(task.id, { estimate: e.target.value as TaskEstimate })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={fieldStyle}
              >
                <option value="">None</option>
                {ESTIMATES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>

            <Field label="Sprint">
              <select
                value={task.sprintId ?? ''}
                onChange={(e) => updateTask(task.id, { sprintId: e.target.value || null })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={fieldStyle}
              >
                <option value="">Backlog</option>
                {activeSprint && <option value={activeSprint.id}>{activeSprint.name}</option>}
                {/* Keep showing a finished sprint the task belonged to */}
                {task.sprintId && task.sprintId !== activeSprint?.id && (
                  <option value={task.sprintId} disabled>{sprints.find((s) => s.id === task.sprintId)?.name ?? 'Past sprint'} (completed)</option>
                )}
              </select>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={task.dueDate}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={{ ...fieldStyle, colorScheme: 'dark' }}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              rows={6}
              placeholder="What needs to be done, and how do we know it's finished?"
              className="w-full rounded-md px-3 py-2 text-xs leading-relaxed outline-none resize-y"
              style={fieldStyle}
            />
          </Field>

          {sourceDoc && (
            <Field label="From PRD">
              <button
                onClick={() => setActiveDoc(sourceDoc.id)}
                className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs text-left transition-colors hover:bg-white/5"
                style={fieldStyle}
              >
                <span className="truncate flex-1">{sourceDoc.title}</span>
                <ExternalLink size={12} style={{ color: '#9d9da6' }} />
              </button>
            </Field>
          )}

          {task.externalUrl ? (
            <Field label="GitHub issue">
              <a
                href={task.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs transition-colors hover:bg-white/5"
                style={fieldStyle}
              >
                <span className="truncate flex-1">{task.externalUrl.replace('https://github.com/', '')}</span>
                <ExternalLink size={12} style={{ color: '#9d9da6' }} />
              </a>
            </Field>
          ) : integrations.github && (
            <button
              onClick={async () => {
                setExporting(true)
                try {
                  const result = await exportToGithub([task.id])
                  if (result.error) toast.error(result.error)
                  else toast.success(`Created an issue in ${integrations.github!.repo}`)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Could not export to GitHub')
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
              style={{ border: '1px solid #2a2a2e', color: '#d4d4d8' }}
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Export to GitHub ({integrations.github.repo})
            </button>
          )}

          <div className="pt-2 border-t" style={{ borderColor: '#27272a' }}>
            <span className="block text-[11px] uppercase tracking-wider font-medium mb-2.5 mt-2" style={{ color: '#9d9da6' }}>Comments</span>
            <CommentThread targetType="task" targetId={task.id} />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: '#27272a' }}>
          {confirmDelete ? (
            <>
              <span className="text-xs" style={{ color: '#fca5a5' }}>Delete this task?</span>
              <button
                onClick={() => { deleteTask(task.id); onClose() }}
                className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ background: '#dc2626', color: '#fff' }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-md text-xs" style={{ color: '#a1a1aa' }}>
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-red-500/10"
              style={{ color: '#f87171' }}
            >
              <Trash2 size={12} />
              Delete task
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
