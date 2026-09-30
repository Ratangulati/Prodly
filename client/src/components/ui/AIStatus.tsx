import { useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarClock, Clock, FileWarning, Gauge, Hourglass, RefreshCw, ServerCrash, Settings, WifiOff,
} from 'lucide-react'
import { AIError, toAIError, type AIErrorKind } from '@/lib/ai'

const KIND_ICON: Record<AIErrorKind, typeof AlertTriangle> = {
  quota: Gauge,
  busy: ServerCrash,
  timeout: Clock,
  config: Settings,
  limit: CalendarClock,
  network: WifiOff,
  input: FileWarning,
  failed: AlertTriangle,
}

interface AIErrorNoticeProps {
  error: unknown
  onRetry?: () => void
  /** Smaller layout for chat bubbles and narrow panels. */
  compact?: boolean
}

/** Explains why the AI couldn't answer, with a retry button when retrying can help. */
export function AIErrorNotice({ error, onRetry, compact }: AIErrorNoticeProps) {
  const err = error instanceof AIError ? error : toAIError(error)
  const Icon = KIND_ICON[err.kind]
  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-xl ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}
      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)' }}
    >
      <Icon size={compact ? 15 : 17} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold`} style={{ color: '#fde68a' }}>{err.title}</p>
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} mt-0.5 leading-relaxed`} style={{ color: '#d6d3d1' }}>{err.message}</p>
        {onRetry && err.retryable && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-amber-400/20"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#fde68a', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            <RefreshCw size={11} />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** True once `active` has been on for `afterMs`: used to explain long AI waits. */
export function useSlowAI(active: boolean, afterMs = 10_000): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!active) return
    const timer = setTimeout(() => setSlow(true), afterMs)
    return () => clearTimeout(timer)
  }, [active, afterMs])
  return slow
}

/** Shown while an AI request is taking longer than usual, so it doesn't look frozen. */
export function SlowAINotice({ compact }: { compact?: boolean }) {
  return (
    <div
      role="status"
      className={`flex gap-2.5 rounded-xl ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}
    >
      <Hourglass size={compact ? 13 : 15} className="flex-shrink-0 mt-0.5 animate-pulse" style={{ color: '#a5b4fc' }} aria-hidden />
      <p className={`${compact ? 'text-[11px]' : 'text-xs'} leading-relaxed`} style={{ color: '#c7d2fe' }}>
        Taking longer than usual. The AI models are busy, so Prodly is trying backup models. This can take up to a minute.
      </p>
    </div>
  )
}
