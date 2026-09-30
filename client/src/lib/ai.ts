import type { ProposedTask } from './types'

export interface PrdReview {
  score: number
  summary: string
  checks: { area: string; status: 'pass' | 'warn' | 'fail'; feedback: string }[]
}

/**
 * Why the AI couldn't answer. Matches the server's kinds, plus:
 * - limit: this user's daily AI allowance is used up
 * - network: the browser couldn't reach the server
 * - input: the request itself was invalid (e.g. an empty PRD)
 */
export type AIErrorKind = 'quota' | 'busy' | 'timeout' | 'config' | 'limit' | 'network' | 'input' | 'failed'

export const AI_ERROR_TITLES: Record<AIErrorKind, string> = {
  quota: 'AI usage quota reached',
  busy: 'AI models are overloaded',
  timeout: 'The AI took too long to respond',
  config: 'AI is not set up correctly',
  limit: 'Daily AI limit reached',
  network: "Can't reach the server",
  input: "The AI couldn't use this request",
  failed: 'The AI request failed',
}

const FALLBACK_MESSAGES: Partial<Record<AIErrorKind, string>> = {
  network: 'Check your internet connection and try again.',
}

/** An AI failure with a kind the UI can explain, and a plain-language message. */
export class AIError extends Error {
  constructor(public kind: AIErrorKind, message: string) {
    super(message || FALLBACK_MESSAGES[kind] || 'The AI request failed. Please try again.')
    this.name = 'AIError'
  }

  get title() {
    return AI_ERROR_TITLES[this.kind]
  }

  /** Whether trying again later might work (as opposed to needing a fix). */
  get retryable() {
    return this.kind !== 'config' && this.kind !== 'input'
  }
}

/** Normalises anything thrown by an AI call into an AIError (abort errors pass through). */
export function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err
  if (err instanceof TypeError) return new AIError('network', '')
  return new AIError('failed', err instanceof Error ? err.message : '')
}

export const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

const KNOWN_KINDS = new Set<AIErrorKind>(['quota', 'busy', 'timeout', 'config', 'limit', 'network', 'input', 'failed'])

/** Builds an AIError from a failed response (JSON or plain text, with the kind header). */
async function errorFromResponse(res: Response): Promise<AIError> {
  const text = (await res.text().catch(() => '')).trim()
  let data: { error?: string; kind?: string } | null = null
  try { data = JSON.parse(text) } catch { /* plain-text body */ }
  const headerKind = res.headers.get('x-ai-error-kind')
  const kind = (headerKind ?? data?.kind ?? '') as AIErrorKind
  const message = data?.error ?? (text.length < 400 ? text : '')
  if (KNOWN_KINDS.has(kind)) return new AIError(kind, message)
  if (res.status === 400) return new AIError('input', message)
  if (res.status === 429) return new AIError('limit', message)
  if (res.status === 401) return new AIError('failed', 'Your session has ended. Please sign in again.')
  return new AIError('failed', message)
}

// Sent by the server when a streamed reply fails part-way through
const STREAM_ERROR_MARKER = '\u0000PRODLY_AI_ERROR:'

interface StreamOptions {
  signal?: AbortSignal
  /** Called with the full text so far each time a chunk arrives. */
  onText?: (text: string) => void
}

/**
 * Streams a reply from /api/ai. Resolves with the full text, or throws an AIError
 * explaining why the AI couldn't answer (including failures part-way through).
 */
export async function streamAI(
  body: { workflow: string; userMessage: string; documentContext?: string; conversationHistory?: { role: string; content: string }[] },
  { signal, onText }: StreamOptions = {},
): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationHistory: [], ...body }),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new AIError('network', '')
  }
  if (!res.ok || !res.body) throw await errorFromResponse(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
    const markerAt = full.indexOf(STREAM_ERROR_MARKER)
    if (markerAt !== -1) {
      const rest = full.slice(markerAt + STREAM_ERROR_MARKER.length)
      const sep = rest.indexOf(':')
      const kind = rest.slice(0, sep) as AIErrorKind
      throw new AIError(KNOWN_KINDS.has(kind) ? kind : 'failed', rest.slice(sep + 1))
    }
    onText?.(full)
  }
  if (!full.trim()) throw new AIError('failed', 'The AI returned an empty answer. Please try again.')
  return full
}

/** POSTs to a JSON AI endpoint, throwing an AIError on failure. */
export async function postAI<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new AIError('network', '')
  }
  if (!res.ok) throw await errorFromResponse(res)
  return res.json() as Promise<T>
}

/** Asks the AI to break a PRD into implementation tasks. */
export async function generateTasksFromPrd(title: string, content: string, signal?: AbortSignal) {
  const { tasks } = await postAI<{ tasks: ProposedTask[] }>('/api/ai/tasks', { title, content }, signal)
  return tasks
}

/** Asks the AI to score a PRD against a quality checklist. */
export function reviewPrd(title: string, content: string, signal?: AbortSignal) {
  return postAI<PrdReview>('/api/ai/review', { title, content }, signal)
}
