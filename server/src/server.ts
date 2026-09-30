import 'dotenv/config'
import { createApp } from './app.js'

/**
 * Entry point for Vercel: exports the Express app for Vercel Functions to run.
 * The React app is served by the separate frontend service, so no clientDir here.
 */
export default createApp()
