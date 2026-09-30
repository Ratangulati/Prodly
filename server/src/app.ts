import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { Prisma } from '@prisma/client'
import { geminiGenerateJson, geminiStreamChat, type GenerateJson, type StreamChat } from './lib/ai.js'
import { requireAuth } from './lib/auth.js'
import { HttpError } from './lib/http.js'
import { enforceAiLimit } from './lib/usage.js'
import { aiRouter } from './routes/ai.js'
import authRouter from './routes/auth.js'
import documentsRouter from './routes/documents.js'
import featuresRouter from './routes/features.js'
import filenodesRouter from './routes/filenodes.js'
import insightsRouter from './routes/insights.js'
import membersRouter from './routes/members.js'
import messagesRouter from './routes/messages.js'
import tasksRouter from './routes/tasks.js'
import commentsRouter from './routes/comments.js'
import sprintsRouter from './routes/sprints.js'
import { integrationsRouter } from './routes/integrations.js'
import type { HttpFetch } from './lib/github.js'

interface AppDeps {
  streamChat?: StreamChat
  generateJson?: GenerateJson
  /** Used for calls to third-party APIs such as GitHub; swappable in tests. */
  httpFetch?: HttpFetch
  /** Built React app to serve (production). Omitted in development, where Vite serves it. */
  clientDir?: string
}

const isProduction = process.env.NODE_ENV === 'production'

export function createApp({
  streamChat = geminiStreamChat,
  generateJson = geminiGenerateJson,
  httpFetch = fetch,
  clientDir,
}: AppDeps = {}) {
  const app = express()

  // Behind a hosting proxy (Render, Fly, Railway…) so secure cookies and client IPs work
  if (isProduction) app.set('trust proxy', 1)

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true }))
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRouter)

  // Everything below needs a signed-in user and is scoped to their workspace
  app.use('/api/ai', requireAuth, enforceAiLimit, aiRouter({ streamChat, generateJson }))
  app.use('/api/db', requireAuth)
  app.use('/api/integrations', requireAuth, integrationsRouter({ httpFetch }))
  app.use('/api/db/documents', documentsRouter)
  app.use('/api/db/features', featuresRouter)
  app.use('/api/db/filenodes', filenodesRouter)
  app.use('/api/db/insights', insightsRouter)
  app.use('/api/db/messages', messagesRouter)
  app.use('/api/db/tasks', tasksRouter)
  app.use('/api/db/members', membersRouter)
  app.use('/api/db/comments', commentsRouter)
  app.use('/api/db/sprints', sprintsRouter)

  // Unknown API routes are 404s, not the React app
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Serve the built React app, falling back to index.html for client-side routes
  if (clientDir && existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }))
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'))
    })
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (res.headersSent) return res.end()
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message })
    }
    // Record not found (e.g. PATCH/DELETE of a missing id)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' })
    }
    // Unique constraint, e.g. creating a record with an id that already exists
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Already exists' })
    }
    // Malformed JSON body or invalid fields
    if (err?.type === 'entity.parse.failed' || err instanceof Prisma.PrismaClientValidationError) {
      return res.status(400).json({ error: 'Invalid request body' })
    }
    console.error(err)
    // Internal details stay in the server logs in production
    res.status(500).json({ error: isProduction || !(err instanceof Error) ? 'Internal server error' : err.message })
  }
  app.use(errorHandler)

  return app
}
