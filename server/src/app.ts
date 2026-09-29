import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { Prisma } from '@prisma/client'
import { geminiStreamChat, type StreamChat } from './lib/ai.js'
import { aiRouter } from './routes/ai.js'
import documentsRouter from './routes/documents.js'
import featuresRouter from './routes/features.js'
import filenodesRouter from './routes/filenodes.js'
import insightsRouter from './routes/insights.js'
import messagesRouter from './routes/messages.js'

export function createApp({ streamChat = geminiStreamChat }: { streamChat?: StreamChat } = {}) {
  const app = express()

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
  app.use(express.json({ limit: '5mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/ai', aiRouter(streamChat))
  app.use('/api/db/documents', documentsRouter)
  app.use('/api/db/features', featuresRouter)
  app.use('/api/db/filenodes', filenodesRouter)
  app.use('/api/db/insights', insightsRouter)
  app.use('/api/db/messages', messagesRouter)

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (res.headersSent) return res.end()
    // Record not found (e.g. PATCH/DELETE of a missing id)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' })
    }
    // Malformed JSON body or invalid fields
    if (err?.type === 'entity.parse.failed' || err instanceof Prisma.PrismaClientValidationError) {
      return res.status(400).json({ error: 'Invalid request body' })
    }
    console.error(err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
  app.use(errorHandler)

  return app
}
