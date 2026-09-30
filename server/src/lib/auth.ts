import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from './prisma.js'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export const SESSION_COOKIE = 'prodly_session'
const SESSION_DAYS = 30

export interface AuthContext {
  userId: string
  workspaceId: string
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

/** Every route mounted after `requireAuth` can rely on this being set. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw new Error('requireAuth middleware is missing')
  return req.auth
}

// ── Passwords (scrypt, salted) ───────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

// ── Sessions ─────────────────────────────────────────────────────────

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Creates a session and sets the cookie. Only the token's hash is stored in the database. */
export async function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } })
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  })
}

export async function endSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } })
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

async function sessionUser(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== 'string' || !token) return null
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  return session.user
}

/** Rejects requests without a valid session and records who is calling. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sessionUser(req)
    if (!user) {
      res.status(401).json({ error: 'Please sign in' })
      return
    }
    req.auth = { userId: user.id, workspaceId: user.workspaceId }
    next()
  } catch (err) {
    next(err)
  }
}

export { sessionUser }

/** Readable, shareable workspace invite code, e.g. "K7QD-M2XP". */
export function makeJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I lookalikes
  const bytes = randomBytes(8)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}
