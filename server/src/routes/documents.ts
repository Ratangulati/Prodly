import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  const rows = await prisma.document.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(rows.map((d) => ({ ...d, tags: JSON.parse(d.tags) })))
})

router.post('/', async (req, res) => {
  const body = req.body
  const doc = await prisma.document.create({
    data: {
      id:        body.id,
      title:     body.title,
      content:   body.content,
      type:      body.type,
      tags:      JSON.stringify(body.tags ?? []),
      createdAt: body.createdAt ? new Date(body.createdAt) : undefined,
    },
  })
  res.json({ ...doc, tags: JSON.parse(doc.tags) })
})

router.patch('/:id', async (req, res) => {
  const body = req.body
  const doc = await prisma.document.update({
    where: { id: req.params.id },
    data: {
      ...(body.title   !== undefined && { title:   body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.type    !== undefined && { type:    body.type }),
      ...(body.tags    !== undefined && { tags:    JSON.stringify(body.tags) }),
    },
  })
  res.json({ ...doc, tags: JSON.parse(doc.tags) })
})

router.delete('/:id', async (req, res) => {
  await prisma.document.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
