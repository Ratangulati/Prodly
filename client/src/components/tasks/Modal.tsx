import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

/** Centered dialog with a dimmed backdrop. Closes on Escape or backdrop click. */
export default function Modal({ title, subtitle, onClose, children, footer, width = 560 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex flex-col rounded-xl overflow-hidden shadow-2xl w-full"
        style={{ maxWidth: width, maxHeight: 'calc(100vh - 64px)', background: '#141416', border: '1px solid #27272a' }}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b" style={{ borderColor: '#27272a' }}>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>{title}</h2>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: '#9d9da6' }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:bg-white/10"
            style={{ color: '#9d9da6' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: '#27272a', background: '#111113' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
