import { Router } from 'express'
import { getSystemPrompt } from '../lib/prompts.js'
import type { AIWorkflow } from '../lib/types.js'
import type { ChatTurn, StreamChat } from '../lib/ai.js'

const WORKFLOWS: AIWorkflow[] = ['prd', 'stories', 'roadmap', 'prioritization', 'research', 'data', 'general']

interface RequestBody {
  workflow?: AIWorkflow
  userMessage?: string
  documentContext?: string
  conversationHistory?: ChatTurn[]
}

export function aiRouter(streamChat: StreamChat) {
  const router = Router()

  router.post('/', async (req, res) => {
    const { workflow = 'general', userMessage, documentContext, conversationHistory = [] } =
      (req.body ?? {}) as RequestBody

    if (!userMessage?.trim()) {
      res.status(400).send('userMessage is required')
      return
    }
    if (!WORKFLOWS.includes(workflow)) {
      res.status(400).send(`Unknown workflow: ${workflow}`)
      return
    }

    let chunks: AsyncIterable<string>
    try {
      chunks = await streamChat(getSystemPrompt(workflow, documentContext), conversationHistory, userMessage)
    } catch (err) {
      // Fails before anything is streamed, so the client still gets a proper error status
      console.error('AI request failed:', err instanceof Error ? err.message : err)
      res.status(502).send(err instanceof Error ? err.message : 'AI provider error')
      return
    }

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })

    try {
      for await (const text of chunks) res.write(text)
    } catch (err) {
      console.error('AI stream error:', err)
    } finally {
      res.end()
    }
  })

  return router
}
