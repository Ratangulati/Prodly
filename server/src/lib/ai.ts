import { ApiError, GoogleGenAI, ThinkingLevel, type Schema } from '@google/genai'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Streams a model reply as text chunks. Swappable in tests. */
export type StreamChat = (
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
) => Promise<AsyncIterable<string>>

/** Asks the model for JSON matching `schema` and returns the parsed value. Swappable in tests. */
export type GenerateJson = (systemPrompt: string, userMessage: string, schema: Schema) => Promise<unknown>

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'

/**
 * Models tried in order when the main one is overloaded or unavailable.
 * GEMINI_FALLBACK_MODELS is a comma-separated list; an empty value turns fallback off.
 */
const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-lite-latest']
export function fallbackModels(): string[] {
  const configured = process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL
  const list = configured === undefined ? DEFAULT_FALLBACK_MODELS : configured.split(',')
  return list.map((m) => m.trim()).filter((m) => m && m !== GEMINI_MODEL)
}

let client: GoogleGenAI | undefined

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on the server')
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

// Gemini regularly returns 503 "high demand" or 429 under load; these usually clear within seconds.
// A 404 means that model isn't available to this key, so the next model is worth trying too.
const RETRYABLE_STATUS = new Set([429, 500, 503])
const status = (err: unknown) => (err instanceof ApiError ? err.status : undefined)

/** A model that hangs or drops the connection: don't wait on it again, move to the next one. */
function isTimeoutOrNetwork(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.name === 'TimeoutError' || /fetch failed|ECONNRESET|socket hang up|timed? ?out/i.test(err.message)
}

/** Per-attempt limit for JSON planning calls, so one stuck model can't stall a request. */
export const JSON_ATTEMPT_TIMEOUT_MS = Number(process.env.GEMINI_ATTEMPT_TIMEOUT_MS) || 30_000

/**
 * Runs `fn` on each model in turn: a couple of quick retries per model for temporary
 * errors, then the next model. Other errors (bad request, bad key) stop immediately.
 */
export async function runWithFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
  { retryDelaysMs = [1000], log = console.warn }: { retryDelaysMs?: number[]; log?: (msg: string) => void } = {},
): Promise<T> {
  let lastError: unknown
  for (const [i, model] of models.entries()) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn(model)
      } catch (err) {
        lastError = err
        const code = status(err)
        const temporary = code !== undefined && RETRYABLE_STATUS.has(code)
        const tryNextModel = temporary || code === 404 || isTimeoutOrNetwork(err)
        if (!tryNextModel) throw err
        if (temporary && attempt < retryDelaysMs.length) {
          log(`${model} returned ${code}, retrying in ${retryDelaysMs[attempt]}ms`)
          await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]))
          continue
        }
        if (i < models.length - 1) log(`${model} unavailable (${code ?? (err as Error).message}), trying ${models[i + 1]}`)
        break
      }
    }
  }
  throw lastError
}

const withModelFallback = <T>(fn: (model: string) => Promise<T>) =>
  runWithFallback([GEMINI_MODEL, ...fallbackModels()], fn)

/**
 * Why an AI request failed, in a form the UI can explain:
 * - quota: the Gemini key hit its rate limit or plan quota
 * - busy: every model was overloaded
 * - timeout: models didn't answer in time, or the connection dropped
 * - config: the server's AI setup is wrong (missing or rejected key, unknown model)
 * - failed: anything else
 * ("limit", the per-user daily allowance, is reported by the usage middleware.)
 */
export type AIErrorKind = 'quota' | 'busy' | 'timeout' | 'config' | 'failed'

export function aiErrorKind(err: unknown): AIErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'quota'
    if (err.status === 503 || err.status === 500) return 'busy'
    if (err.status === 404 || err.status === 400 || err.status === 401 || err.status === 403) return 'config'
  }
  if (isTimeoutOrNetwork(err)) return 'timeout'
  if (err instanceof Error && err.message.includes('GEMINI_API_KEY')) return 'config'
  return 'failed'
}

const MESSAGES: Record<AIErrorKind, string> = {
  quota: "The AI has hit its usage quota, so it can't answer right now. Wait a minute and try again. If this keeps happening, the Gemini plan needs a higher limit (enable billing on the API key).",
  busy: 'The AI models are overloaded right now (a temporary problem on Google\'s side). Please try again in a minute.',
  timeout: "The AI didn't respond in time because its models are overloaded. Please try again in a minute.",
  config: 'AI is not set up correctly on the server (the Gemini API key or model was rejected). Ask the workspace admin to check GEMINI_API_KEY.',
  failed: 'The AI request failed. Please try again.',
}

/** Turns provider errors into a message that can be shown to the user. */
export function aiErrorMessage(err: unknown): string {
  return MESSAGES[aiErrorKind(err)]
}

export const geminiStreamChat: StreamChat = async (systemPrompt, history, userMessage) => {
  const ai = getClient()

  const chatConfig = (model: string) => ({
    model,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 4096 },
    // Gemini uses 'model' role instead of 'assistant'
    history: history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  })

  // A fresh chat per attempt, since a failed send can leave the chat history modified
  const stream = await withModelFallback((model) =>
    ai.chats.create(chatConfig(model)).sendMessageStream({ message: userMessage }),
  )

  return (async function* () {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text
    }
  })()
}

export const geminiGenerateJson: GenerateJson = async (systemPrompt, userMessage, schema) => {
  const ai = getClient()
  const request = (model: string, lowThinking: boolean) =>
    ai.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: schema,
        maxOutputTokens: 8192,
        // Structured planning doesn't need long deliberation; low thinking is ~4x faster
        ...(lowThinking && { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
        // A busy model can hang instead of failing; give up and try the next one
        abortSignal: AbortSignal.timeout(JSON_ATTEMPT_TIMEOUT_MS),
      },
    })

  const response = await withModelFallback(async (model) => {
    try {
      return await request(model, true)
    } catch (err) {
      // Models without thinking support reject the setting; ask again without it
      if (err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message)) return request(model, false)
      throw err
    }
  })
  if (!response.text) throw new Error('The AI returned an empty response')
  return JSON.parse(response.text)
}
