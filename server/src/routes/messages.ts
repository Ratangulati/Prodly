import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  const messages = await prisma.aIMessage.findMany({ orderBy: { timestamp: 'asc' } })
  res.json(messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })))
})

router.post('/', async (req, res) => {
  const body = req.body
  const msg = await prisma.aIMessage.create({
    data: {
      id:        body.id,
      role:      body.role,
      content:   body.content,
      workflow:  body.workflow,
      timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
    },
  })
  res.json({ ...msg, timestamp: msg.timestamp.toISOString() })
})

router.delete('/', async (req, res) => {
  const workflow = req.body?.workflow
  if (workflow) {
    await prisma.aIMessage.deleteMany({ where: { workflow } })
  } else {
    await prisma.aIMessage.deleteMany()
  }
  res.json({ ok: true })
})

export default router
