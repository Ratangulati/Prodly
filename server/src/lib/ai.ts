import { ApiError, GoogleGenAI } from '@google/genai'

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

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'

let client: GoogleGenAI | undefined

// Gemini regularly returns 503 "high demand" or 429 under load; these usually clear within seconds
const RETRYABLE_STATUS = new Set([429, 500, 503])
const RETRY_DELAYS_MS = [1000, 2000, 4000]

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const retryable = err instanceof ApiError && RETRYABLE_STATUS.has(err.status)
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw err
      console.warn(`Gemini returned ${err.status}, retrying in ${RETRY_DELAYS_MS[attempt]}ms`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
}

export const geminiStreamChat: StreamChat = async (systemPrompt, history, userMessage) => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on the server')
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const chatConfig = {
    model: GEMINI_MODEL,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 4096 },
    // Gemini uses 'model' role instead of 'assistant'
    history: history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  }

  // A fresh chat per attempt, since a failed send can leave the chat history modified
  const stream = await withRetry(() =>
    client!.chats.create(chatConfig).sendMessageStream({ message: userMessage }),
  )

  return (async function* () {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text
    }
  })()
}
