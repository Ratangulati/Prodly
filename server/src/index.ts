import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 4000

// In production the server also serves the built React app from client/dist
const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = process.env.CLIENT_DIST ?? path.resolve(here, '../../client/dist')

createApp({ clientDir: process.env.NODE_ENV === 'production' ? clientDir : undefined }).listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
