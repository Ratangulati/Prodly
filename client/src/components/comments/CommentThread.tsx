import { Fragment, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import { commentKey, commentsApi, type Comment, type CommentTargetType } from '@/lib/comments'
import { toast } from '@/lib/toast'
import type { Member } from '@/lib/types'
import MemberAvatar from '@/components/tasks/MemberAvatar'
import MentionInput, { mentionedIds } from './MentionInput'

/** Renders comment text with @mentions of teammates highlighted. */
export function CommentBody({ body, mentions, members }: { body: string; mentions: string[]; members: Member[] }) {
  const names = members.filter((m) => mentions.includes(m.id)).map((m) => m.name)
  if (!names.length) return <>{body}</>
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'))
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1))
          ? <span key={i} className="px-0.5 rounded font-medium" style={{ background: 'rgba(99,102,241,0.18)', color: '#c7d2fe' }}>{part}</span>
          : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}

/** Discussion on a task or document: read, post, edit and delete comments, with @mentions. */
export default function CommentThread({ targetType, targetId }: { targetType: CommentTargetType; targetId: string }) {
  const { members, adjustCommentCount } = useWorkspaceStore()
  const userId = useAuthStore((s) => s.user?.id)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const key = commentKey(targetType, targetId)

  useEffect(() => {
    let cancelled = false
    setComments(null)
    setError(null)
    commentsApi.list(targetType, targetId)
      .then((list) => { if (!cancelled) setComments(list) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [targetType, targetId])

  const post = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const created = await commentsApi.create(targetType, targetId, body, mentionedIds(body, members))
      setComments((prev) => [...(prev ?? []), created])
      adjustCommentCount(key, 1)
      setDraft('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not post the comment')
    } finally {
      setPosting(false)
    }
  }

  const saveEdit = async (id: string) => {
    const body = editDraft.trim()
    if (!body) return
    try {
      const updated = await commentsApi.update(id, body, mentionedIds(body, members))
      setComments((prev) => prev?.map((c) => (c.id === id ? updated : c)) ?? null)
      setEditingId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the comment')
    }
  }

  const remove = async (id: string) => {
    try {
      await commentsApi.remove(id)
      setComments((prev) => prev?.filter((c) => c.id !== id) ?? null)
      adjustCommentCount(key, -1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the comment')
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>
      ) : comments === null ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : comments.length === 0 ? (
        <p className="text-xs" style={{ color: '#8a8a93' }}>No comments yet. Type @ to mention a teammate.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const author = members.find((m) => m.id === c.author.memberId) ?? { id: '', name: c.author.name, color: c.author.color, createdAt: '', userId: c.author.userId }
            const mine = c.author.userId === userId
            return (
              <li key={c.id} className="group flex gap-2.5">
                <MemberAvatar member={author} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: '#e4e4e7' }}>{c.author.name}</span>
                    <span className="text-[11px]" style={{ color: '#8a8a93' }} title={new Date(c.createdAt).toLocaleString()}>
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      {c.updatedAt !== c.createdAt && ' · edited'}
                    </span>
                    {mine && editingId !== c.id && (
                      <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(c.id); setEditDraft(c.body) }}
                          className="p-1 rounded hover:bg-white/10"
                          style={{ color: '#9d9da6' }}
                          aria-label="Edit comment"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          className="p-1 rounded hover:bg-red-500/10"
                          style={{ color: '#9d9da6' }}
                          aria-label="Delete comment"
                        >
                          <Trash2 size={11} />
                        </button>
                      </span>
                    )}
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-1 space-y-1.5">
                      <MentionInput value={editDraft} onChange={setEditDraft} members={members} onSubmit={() => saveEdit(c.id)} autoFocus />
                      <div className="flex gap-1.5">
                        <button onClick={() => saveEdit(c.id)} className="px-2.5 py-1 rounded text-[11px] font-medium" style={{ background: '#6366f1', color: '#fff' }}>Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2.5 py-1 rounded text-[11px]" style={{ color: '#a1a1aa' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs mt-0.5 leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#d4d4d8' }}>
                      <CommentBody body={c.body} mentions={c.mentions} members={members} />
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <MentionInput
            value={draft}
            onChange={setDraft}
            members={members}
            onSubmit={post}
            placeholder="Add a comment… (@ to mention)"
            disabled={posting}
          />
        </div>
        <button
          onClick={post}
          disabled={!draft.trim() || posting}
          className="p-2 rounded-lg mb-1.5 disabled:opacity-40"
          style={{ background: '#6366f1', color: '#fff' }}
          aria-label="Post comment"
        >
          {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  )
}
