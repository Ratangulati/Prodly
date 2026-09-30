import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { endSession, hashPassword, makeJoinCode, sessionUser, startSession, verifyPassword } from '../lib/auth.js'
import { MEMBER_COLORS } from '../lib/colors.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

async function profile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workspace: true, member: true },
  })
  if (!user) return null
  return {
    user: { id: user.id, name: user.name, email: user.email, memberId: user.member?.id ?? null },
    workspace: { id: user.workspace.id, name: user.workspace.name, joinCode: user.workspace.joinCode },
  }
}

/**
 * Creates an account. Send `workspaceName` to start a new workspace,
 * or `joinCode` to join a teammate's.
 */
router.post('/register', async (req, res) => {
  const { name, email, password, workspaceName, joinCode } = req.body ?? {}
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const cleanName = typeof name === 'string' ? name.trim() : ''

  if (!cleanName) return void res.status(400).json({ error: 'Name is required' })
  if (!EMAIL_RE.test(cleanEmail)) return void res.status(400).json({ error: 'Enter a valid email address' })
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return void res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` })
  }
  if (await prisma.user.findUnique({ where: { email: cleanEmail } })) {
    return void res.status(409).json({ error: 'An account with this email already exists' })
  }

  let workspaceId: string
  if (typeof joinCode === 'string' && joinCode.trim()) {
    const workspace = await prisma.workspace.findUnique({ where: { joinCode: joinCode.trim().toUpperCase() } })
    if (!workspace) return void res.status(400).json({ error: 'That invite code is not valid' })
    workspaceId = workspace.id
  } else {
    const wsName = typeof workspaceName === 'string' && workspaceName.trim() ? workspaceName.trim() : `${cleanName}'s workspace`
    workspaceId = (await prisma.workspace.create({ data: { name: wsName, joinCode: makeJoinCode() } })).id
  }

  const memberCount = await prisma.member.count({ where: { workspaceId } })
  const user = await prisma.user.create({
    data: {
      email: cleanEmail,
      name: cleanName,
      passwordHash: await hashPassword(password),
      workspaceId,
      // Every user is also a teammate who can be assigned tasks
      member: { create: { name: cleanName, color: MEMBER_COLORS[memberCount % MEMBER_COLORS.length], workspaceId } },
    },
  })

  await startSession(res, user.id)
  res.status(201).json(await profile(user.id))
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  const user = typeof email === 'string'
    ? await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    : null
  // Same message whether the email or the password is wrong
  if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
    return void res.status(401).json({ error: 'Incorrect email or password' })
  }
  await startSession(res, user.id)
  res.json(await profile(user.id))
})

router.post('/logout', async (req, res) => {
  await endSession(req, res)
  res.json({ ok: true })
})

router.get('/me', async (req, res) => {
  const user = await sessionUser(req)
  if (!user) return void res.status(401).json({ error: 'Please sign in' })
  res.json(await profile(user.id))
})

/**
 * Public settings for the sign-in screen. The demo login is advertised in development,
 * and in production only when SHOW_DEMO_LOGIN=true (and the demo user was seeded).
 */
router.get('/config', async (_req, res) => {
  const allowed = process.env.NODE_ENV !== 'production' || process.env.SHOW_DEMO_LOGIN === 'true'
  const demoExists = allowed && !!(await prisma.user.findUnique({ where: { email: 'demo@prodly.dev' }, select: { id: true } }))
  res.json({ demoLogin: demoExists ? { email: 'demo@prodly.dev', password: 'prodly-demo' } : null })
})

export default router
