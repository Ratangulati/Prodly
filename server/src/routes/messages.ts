import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'

const router = Router()

router.get('/', async (req, res) => {
  const messages = await prisma.aIMessage.findMany({
    where: { workspaceId: authOf(req).workspaceId },
    orderBy: { timestamp: 'asc' },
  })
  res.json(messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })))
})

router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const body = req.body
  const msg = await prisma.aIMessage.create({
    data: {
      id:        body.id,
      role:      body.role,
      content:   body.content,
      workflow:  body.workflow,
      timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
      workspaceId,
    },
  })
  res.json({ ...msg, timestamp: msg.timestamp.toISOString() })
})

router.delete('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const workflow = req.body?.workflow
  await prisma.aIMessage.deleteMany({ where: { workspaceId, ...(workflow && { workflow }) } })
  res.json({ ok: true })
})

export default router
