import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck, Wand2, XCircle } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { AIError, isAbort, reviewPrd, toAIError, type PrdReview } from '@/lib/ai'
import { AIErrorNotice, SlowAINotice, useSlowAI } from '@/components/ui/AIStatus'
import Modal from '@/components/tasks/Modal'

const STATUS_META = {
  pass: { icon: CheckCircle2, color: '#4ade80', label: 'Solid' },
  warn: { icon: CircleAlert, color: '#fbbf24', label: 'Needs work' },
  fail: { icon: XCircle, color: '#f87171', label: 'Missing' },
} as const

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#fbbf24'
  return '#f87171'
}

/** Scores the PRD against a checklist and offers to fix weak areas with the AI. */
export default function PrdReviewModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { documents, setPendingAICommand, setActiveSidebarTab } = useWorkspaceStore()
  const doc = documents.find((d) => d.id === docId)

  const [review, setReview] = useState<PrdReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AIError | null>(null)
  const slow = useSlowAI(loading)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async () => {
    if (!doc) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      setReview(await reviewPrd(doc.title, doc.content, controller.signal))
    } catch (err) {
      if (isAbort(err)) return
      setError(toAIError(err))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [doc?.id, doc?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run()
    return () => abortRef.current?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hands the fix to the PRD chat, where the user can review the AI's edit before applying it
  const fixWithAI = (area: string, feedback: string) => {
    setPendingAICommand('prd', `Improve the "${area}" part of this PRD. Reviewer feedback: ${feedback}`)
    setActiveSidebarTab('chat')
    onClose()
  }

  if (!doc) return null

  const counts = review
    ? { pass: review.checks.filter((c) => c.status === 'pass').length, total: review.checks.length }
    : null

  return (
    <Modal
      title={<span className="flex items-center gap-2"><ShieldCheck size={14} style={{ color: '#818cf8' }} />PRD quality check</span>}
      subtitle={doc.title}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: '#a1a1aa' }}
          >
            <RefreshCw size={12} />
            Check again
          </button>
          <button onClick={onClose} className="ml-auto px-3.5 py-1.5 rounded-md text-xs font-medium" style={{ background: '#27272a', color: '#e4e4e7' }}>
            Done
          </button>
        </>
      }
    >
      {loading ? (
        <div className="px-5 py-6 space-y-2.5">
          <p className="text-xs mb-4" style={{ color: '#a5b4fc' }}>Reviewing the PRD…</p>
          {slow && <SlowAINotice />}
          <div className="skeleton h-20 w-full" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-full" />)}
        </div>
      ) : error ? (
        <div className="px-5 py-8">
          <AIErrorNotice error={error} onRetry={run} />
        </div>
      ) : review && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-4 rounded-lg p-4" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <div
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 64, height: 64,
                background: `conic-gradient(${scoreColor(review.score)} ${review.score * 3.6}deg, #27272a 0deg)`,
              }}
            >
              <div className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: '#18181b' }}>
                <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(review.score) }}>{review.score}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: '#e4e4e7' }}>
                {counts && `${counts.pass} of ${counts.total} areas are solid`}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#a1a1aa' }}>{review.summary}</p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {review.checks.map((c) => {
              const meta = STATUS_META[c.status]
              const Icon = meta.icon
              return (
                <div key={c.area} className="flex gap-3 rounded-lg px-3 py-2.5" style={{ border: '1px solid #1f1f23' }}>
                  <Icon size={15} className="flex-shrink-0 mt-0.5" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold" style={{ color: '#e4e4e7' }}>{c.area}</p>
                      <span className="text-[11px]" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#a1a1aa' }}>{c.feedback}</p>
                  </div>
                  {c.status !== 'pass' && (
                    <button
                      onClick={() => fixWithAI(c.area, c.feedback)}
                      className="flex items-center gap-1 self-start px-2 py-1 rounded text-[11px] font-medium flex-shrink-0 transition-colors hover:bg-indigo-500/20"
                      style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc' }}
                      title="Draft a fix in the PRD chat"
                    >
                      <Wand2 size={10} />
                      Fix with AI
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
