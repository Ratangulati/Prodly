import type { NextFunction, Request, Response } from 'express'
import { prisma } from './prisma.js'
import { authOf } from './auth.js'

const DEFAULT_DAILY_LIMIT = 100

export function dailyAiLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT
}

/** Counts each AI request against the user's daily allowance (UTC day). */
export async function enforceAiLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = authOf(req)
    const day = new Date().toISOString().slice(0, 10)
    const limit = dailyAiLimit()
    const usage = await prisma.aiUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
    })
    if (usage.count > limit) {
      res.status(429).set('X-AI-Error-Kind', 'limit').type('text/plain')
        .send(`You've used all ${limit} of your AI requests for today. The limit resets at midnight UTC.`)
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
