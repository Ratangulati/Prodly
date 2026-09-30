import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { notFound } from '../lib/http.js'

const router = Router()

const EDITABLE = [
  'title', 'description', 'status', 'priority', 'reach', 'impact', 'confidence', 'effort',
  'riceScore', 'moscow', 'assignee', 'dueDate', 'linkedDocId',
] as const

function pickEditable(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const key of EDITABLE) if (body[key] !== undefined) data[key] = body[key]
  return data
}

async function assertOwned(id: string, workspaceId: string) {
  if (!(await prisma.feature.findFirst({ where: { id, workspaceId }, select: { id: true } }))) throw notFound()
}

router.get('/', async (req, res) => {
  res.json(await prisma.feature.findMany({ where: { workspaceId: authOf(req).workspaceId } }))
})

router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const body = req.body ?? {}
  const data = { ...(body.id && { id: body.id }), ...pickEditable(body), workspaceId } as Prisma.FeatureUncheckedCreateInput
  res.json(await prisma.feature.create({ data }))
})

router.patch('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  await assertOwned(req.params.id, workspaceId)
  res.json(await prisma.feature.update({ where: { id: req.params.id }, data: pickEditable(req.body ?? {}) }))
})

router.delete('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  await assertOwned(req.params.id, workspaceId)
  await prisma.feature.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
