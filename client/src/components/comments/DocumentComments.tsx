import { useEffect } from 'react'
import { X } from 'lucide-react'
import CommentThread from './CommentThread'

/** Slide-over panel with the discussion for the open document. */
export default function DocumentComments({ docId, onClose }: { docId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 z-30 flex flex-col w-full border-l shadow-2xl"
      style={{ maxWidth: 380, background: '#141416', borderColor: '#27272a' }}
      aria-label="Document comments"
    >
      <div className="flex items-center px-5 py-3 border-b" style={{ borderColor: '#27272a' }}>
        <span className="text-xs font-semibold" style={{ color: '#e4e4e7' }}>Comments</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10" style={{ color: '#9d9da6' }} aria-label="Close comments">
          <X size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <CommentThread targetType="document" targetId={docId} />
      </div>
    </aside>
  )
}
