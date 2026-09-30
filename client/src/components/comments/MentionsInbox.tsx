import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { AtSign, Bell } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import { commentsApi, type Comment } from '@/lib/comments'
import MemberAvatar from '@/components/tasks/MemberAvatar'
import { CommentBody } from './CommentThread'

const POLL_MS = 60_000

// "Seen" is a per-browser convenience; losing it only re-marks mentions as new
const seenKey = (userId: string) => `prodly:mentions-seen:${userId}`
function readSeen(userId: string): number {
  try { return Number(localStorage.getItem(seenKey(userId))) || 0 } catch { return 0 }
}
function writeSeen(userId: string, time: number) {
  try { localStorage.setItem(seenKey(userId), String(time)) } catch { /* storage unavailable */ }
}

/** Bell with comments that @mention the signed-in user. */
export default function MentionsInbox() {
  const { tasks, documents, members, openTask, setActiveDoc } = useWorkspaceStore()
  const userId = useAuthStore((s) => s.user?.id)
  const [mentions, setMentions] = useState<Comment[]>([])
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    commentsApi.mentions().then(setMentions).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    setSeenAt(readSeen(userId))
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [userId, load])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = mentions.filter((m) => new Date(m.createdAt).getTime() > seenAt).length

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      load()
      // Saved now, but applied on close so the "new" highlight stays visible while the panel is open
      if (userId) writeSeen(userId, Date.now())
    }
  }

  useEffect(() => {
    if (!open && userId) setSeenAt(readSeen(userId))
  }, [open, userId])

  const go = (m: Comment) => {
    if (m.targetType === 'task') openTask(m.targetId)
    else setActiveDoc(m.targetId)
    setOpen(false)
  }

  const targetTitle = (m: Comment) =>
    m.targetType === 'task'
      ? tasks.find((t) => t.id === m.targetId)?.title ?? 'Deleted task'
      : documents.find((d) => d.id === m.targetId)?.title ?? 'Deleted document'

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={toggle}
        className="relative p-1.5 rounded transition-colors hover:bg-white/10"
        style={{ color: open ? '#c7d2fe' : '#555' }}
        aria-label={unread ? `Mentions, ${unread} new` : 'Mentions'}
        title="Mentions"
      >
        <Bell size={13} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[10px] font-bold leading-[14px] text-center"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-80 rounded-lg shadow-2xl z-40 overflow-hidden"
          style={{ background: '#18181b', border: '1px solid #27272a' }}
        >
          <div className="px-3.5 py-2.5 border-b text-xs font-semibold" style={{ borderColor: '#27272a', color: '#e4e4e7' }}>
            Mentions
          </div>
          {mentions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <AtSign size={18} style={{ color: '#8a8a93' }} />
              <p className="text-xs" style={{ color: '#9d9da6' }}>When a teammate @mentions you in a comment, it shows up here.</p>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {mentions.map((m) => {
                const author = members.find((x) => x.id === m.author.memberId) ?? { id: '', name: m.author.name, color: m.author.color, createdAt: '', userId: null }
                const isNew = new Date(m.createdAt).getTime() > seenAt
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => go(m)}
                      className="flex gap-2.5 w-full px-3.5 py-3 text-left transition-colors hover:bg-white/5 border-b"
                      style={{ borderColor: '#1f1f23', background: isNew ? 'rgba(99,102,241,0.07)' : 'transparent' }}
                    >
                      <MemberAvatar member={author} size={22} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px]" style={{ color: '#a1a1aa' }}>
                          <strong style={{ color: '#e4e4e7' }}>{m.author.name}</strong> on <span style={{ color: '#d4d4d8' }}>{targetTitle(m)}</span>
                        </span>
                        <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: '#d4d4d8' }}>
                          <CommentBody body={m.body} mentions={m.mentions} members={members} />
                        </span>
                        <span className="block text-[11px] mt-1" style={{ color: '#8a8a93' }}>
                          {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
