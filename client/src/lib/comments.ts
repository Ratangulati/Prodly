export type CommentTargetType = 'task' | 'document'

export interface Comment {
  id: string
  targetType: CommentTargetType
  targetId: string
  body: string
  /** Mentioned teammate (Member) ids. */
  mentions: string[]
  createdAt: string
  updatedAt: string
  author: { userId: string; name: string; memberId: string | null; color: string }
}

export const commentKey = (targetType: CommentTargetType, targetId: string) => `${targetType}:${targetId}`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.')
  return data as T
}

export const commentsApi = {
  list: (targetType: CommentTargetType, targetId: string) =>
    request<Comment[]>(`/api/db/comments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`),
  mentions: () => request<Comment[]>('/api/db/comments/mentions'),
  create: (targetType: CommentTargetType, targetId: string, body: string, mentions: string[]) =>
    request<Comment>('/api/db/comments', { method: 'POST', body: JSON.stringify({ targetType, targetId, body, mentions }) }),
  update: (id: string, body: string, mentions: string[]) =>
    request<Comment>(`/api/db/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body, mentions }) }),
  remove: (id: string) => request<{ ok: true }>(`/api/db/comments/${id}`, { method: 'DELETE' }),
}
