import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  const rows = await prisma.fileNode.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(rows.map((n) => ({ ...n, children: JSON.parse(n.children) })))
})

router.post('/', async (req, res) => {
  const body = req.body
  const node = await prisma.fileNode.create({
    data: {
      id:        body.id,
      name:      body.name,
      type:      body.type,
      parentId:  body.parentId ?? null,
      children:  JSON.stringify(body.children ?? []),
      createdAt: body.createdAt ? new Date(body.createdAt) : undefined,
    },
  })
  res.json({ ...node, children: JSON.parse(node.children) })
})

router.patch('/:id', async (req, res) => {
  const body = req.body
  const data: Record<string, unknown> = {}
  if (body.name     !== undefined) data.name     = body.name
  if (body.parentId !== undefined) data.parentId = body.parentId
  if (body.children !== undefined) data.children = JSON.stringify(body.children)

  const updated = await prisma.fileNode.update({ where: { id: req.params.id }, data })
  res.json({ ...updated, children: JSON.parse(updated.children) })
})

router.delete('/:id', async (req, res) => {
  await prisma.fileNode.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
