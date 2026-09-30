import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { AIError, generateTasksFromPrd, isAbort, toAIError } from '@/lib/ai'
import { AIErrorNotice, SlowAINotice, useSlowAI } from '@/components/ui/AIStatus'
import { toast } from '@/lib/toast'
import type { FeaturePriority, ProposedTask } from '@/lib/types'
import Modal from './Modal'
import { ESTIMATES, PRIORITIES } from './meta'

interface Draft extends ProposedTask {
  key: number
  selected: boolean
  assigneeId: string | null
  /** A task with the same title already exists for this PRD. */
  duplicate: boolean
}

const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const selectStyle = { background: '#18181b', border: '1px solid #2a2a2e', color: '#d4d4d8' }

/**
 * Asks the AI to break the PRD into tasks, then lets the PM choose and edit
 * which ones to add before anything lands on the board.
 */
export default function GenerateTasksModal({ docId }: { docId: string }) {
  const { documents, tasks, members, addTasks, closeTaskReview, openTasks } = useWorkspaceStore()
  const doc = documents.find((d) => d.id === docId)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AIError | null>(null)
  const slow = useSlowAI(loading)
  const abortRef = useRef<AbortController | null>(null)

  const existingTitles = useMemo(
    () => new Set(tasks.filter((t) => t.sourceDocId === docId).map((t) => normalize(t.title))),
    [tasks, docId],
  )

  const generate = useCallback(async () => {
    if (!doc) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const proposed = await generateTasksFromPrd(doc.title, doc.content, controller.signal)
      setDrafts(proposed.map((t, i) => {
        const duplicate = existingTitles.has(normalize(t.title))
        return { ...t, key: i, selected: !duplicate, assigneeId: null, duplicate }
      }))
    } catch (err) {
      if (isAbort(err)) return
      setError(toAIError(err))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [doc?.id, doc?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    generate()
    return () => abortRef.current?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: number, changes: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)))

  const selected = drafts.filter((d) => d.selected && d.title.trim())
  const allSelected = drafts.length > 0 && drafts.every((d) => d.selected)

  const addSelected = () => {
    addTasks(selected.map((d) => ({
      title: d.title.trim(),
      description: d.description,
      priority: d.priority,
      estimate: d.estimate,
      assigneeId: d.assigneeId,
      sourceDocId: docId,
    })))
    toast.success(`Added ${selected.length} task${selected.length === 1 ? '' : 's'} to the board`)
    closeTaskReview()
    openTasks(docId)
  }

  if (!doc) return null

  return (
    <Modal
      title={<span className="flex items-center gap-2"><Sparkles size={14} style={{ color: '#818cf8' }} />Generate tasks from PRD</span>}
      subtitle={doc.title}
      onClose={closeTaskReview}
      width={760}
      footer={
        <>
          {!loading && !error && drafts.length > 0 && (
            <>
              <button
                onClick={generate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5"
                style={{ color: '#a1a1aa' }}
              >
                <RefreshCw size={12} />
                Regenerate
              </button>
              <span className="ml-auto text-[11px]" style={{ color: '#9d9da6' }}>
                {selected.length} of {drafts.length} selected
              </span>
            </>
          )}
          <button
            onClick={closeTaskReview}
            className={`${loading || error || drafts.length === 0 ? 'ml-auto ' : ''}px-3 py-1.5 rounded-md text-xs`}
            style={{ color: '#a1a1aa' }}
          >
            Cancel
          </button>
          <button
            onClick={addSelected}
            disabled={loading || selected.length === 0}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            Add {selected.length || ''} task{selected.length === 1 ? '' : 's'} to board
          </button>
        </>
      }
    >
      {loading ? (
        <div className="px-5 py-6 space-y-2.5">
          <p className="text-xs mb-4 flex items-center gap-2" style={{ color: '#a5b4fc' }}>
            <span className="animate-spin inline-block"><Sparkles size={12} /></span>
            Reading the PRD and drafting tasks…
          </p>
          {slow && <SlowAINotice />}
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
        </div>
      ) : error ? (
        <div className="px-5 py-8">
          <AIErrorNotice error={error} onRetry={generate} />
        </div>
      ) : (
        <div className="px-5 py-3">
          <label className="flex items-center gap-2 py-2 text-[11px] cursor-pointer" style={{ color: '#a1a1aa' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setDrafts((prev) => prev.map((d) => ({ ...d, selected: e.target.checked })))}
              className="accent-indigo-500"
            />
            Select all
          </label>

          <div className="space-y-2">
            {drafts.map((d) => (
              <div
                key={d.key}
                className="flex gap-3 rounded-lg p-3 transition-colors"
                style={{
                  background: d.selected ? '#18181b' : 'transparent',
                  border: `1px solid ${d.selected ? '#2a2a2e' : '#1f1f23'}`,
                  opacity: d.selected ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={(e) => update(d.key, { selected: e.target.checked })}
                  className="mt-1 accent-indigo-500"
                  aria-label={`Include ${d.title}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={d.title}
                      onChange={(e) => update(d.key, { title: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none rounded px-1 -mx-1 focus:bg-white/5"
                      style={{ color: '#f4f4f5' }}
                    />
                    {d.duplicate && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] flex-shrink-0" style={{ background: 'rgba(245,158,11,0.14)', color: '#fcd34d' }}>
                        Already on board
                      </span>
                    )}
                  </div>
                  {d.description && (
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#9d9da6' }}>{d.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={d.priority}
                      onChange={(e) => update(d.key, { priority: e.target.value as FeaturePriority })}
                      className="rounded px-1.5 py-1 text-[11px] outline-none"
                      style={selectStyle}
                      aria-label="Priority"
                    >
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={d.estimate}
                      onChange={(e) => update(d.key, { estimate: e.target.value as Draft['estimate'] })}
                      className="rounded px-1.5 py-1 text-[11px] outline-none"
                      style={selectStyle}
                      aria-label="Estimate"
                    >
                      {ESTIMATES.map((est) => <option key={est} value={est}>{est}</option>)}
                    </select>
                    <select
                      value={d.assigneeId ?? ''}
                      onChange={(e) => update(d.key, { assigneeId: e.target.value || null })}
                      className="rounded px-1.5 py-1 text-[11px] outline-none"
                      style={selectStyle}
                      aria-label="Assignee"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
