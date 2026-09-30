import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { badRequest, notFound } from '../lib/http.js'

const router = Router()

async function findOwned(id: string, workspaceId: string) {
  const member = await prisma.member.findFirst({ where: { id, workspaceId } })
  if (!member) throw notFound()
  return member
}

router.get('/', async (req, res) => {
  res.json(await prisma.member.findMany({ where: { workspaceId: authOf(req).workspaceId }, orderBy: { createdAt: 'asc' } }))
})

router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const { id, name, color } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) throw badRequest('name is required')
  res.json(await prisma.member.create({ data: { ...(id && { id }), name: name.trim(), ...(color && { color }), workspaceId } }))
})

router.patch('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  await findOwned(req.params.id, workspaceId)
  const { name, color } = req.body ?? {}
  const member = await prisma.member.update({
    where: { id: req.params.id },
    data: {
      ...(typeof name === 'string' && name.trim() && { name: name.trim() }),
      ...(typeof color === 'string' && { color }),
    },
  })
  res.json(member)
})

/** Removing a member also unassigns their tasks. Teammates with a login can't be removed here. */
router.delete('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  const member = await findOwned(req.params.id, workspaceId)
  if (member.userId) throw badRequest('This teammate has an account and cannot be removed')
  await prisma.$transaction([
    prisma.task.updateMany({ where: { assigneeId: member.id, workspaceId }, data: { assigneeId: null } }),
    prisma.member.delete({ where: { id: member.id } }),
  ])
  res.json({ ok: true })
})

export default router
