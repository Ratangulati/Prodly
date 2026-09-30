import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { badRequest, notFound } from '../lib/http.js'

const router = Router()

const EDITABLE = ['title', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'estimate', 'sourceDocId', 'order', 'sprintId'] as const

function pickEditable(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const key of EDITABLE) if (body[key] !== undefined) data[key] = body[key]
  return data
}

/** Tasks can only be assigned to teammates in the same workspace. */
async function assertAssignable(assigneeIds: unknown[], workspaceId: string) {
  const ids = [...new Set(assigneeIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return
  const found = await prisma.member.count({ where: { id: { in: ids }, workspaceId } })
  if (found !== ids.length) throw badRequest('Unknown assignee')
}

/** Tasks can only join the workspace's active sprint. */
async function assertSprint(sprintIds: unknown[], workspaceId: string) {
  const ids = [...new Set(sprintIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return
  const found = await prisma.sprint.count({ where: { id: { in: ids }, workspaceId, status: 'active' } })
  if (found !== ids.length) throw badRequest('Tasks can only be added to the active sprint')
}

const hasTitle = (t: unknown) => typeof (t as { title?: unknown })?.title === 'string' && (t as { title: string }).title.trim() !== ''

router.get('/', async (req, res) => {
  res.json(await prisma.task.findMany({
    where: { workspaceId: authOf(req).workspaceId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  }))
})

router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const body = req.body ?? {}
  if (!hasTitle(body)) throw badRequest('title is required')
  await assertAssignable([body.assigneeId], workspaceId)
  await assertSprint([body.sprintId], workspaceId)
  const task = await prisma.task.create({
    data: { ...(body.id && { id: body.id }), ...pickEditable(body), title: body.title.trim(), workspaceId } as Prisma.TaskUncheckedCreateInput,
  })
  res.json(task)
})

/** Creates several tasks at once, e.g. the reviewed tasks generated from a PRD. */
router.post('/bulk', async (req, res) => {
  const { workspaceId } = authOf(req)
  const items = req.body?.tasks
  if (!Array.isArray(items) || !items.every(hasTitle)) throw badRequest('tasks must be an array of objects with a title')
  await assertAssignable(items.map((t) => t.assigneeId), workspaceId)
  await assertSprint(items.map((t) => t.sprintId), workspaceId)
  const created = await prisma.$transaction(
    items.map((t) => prisma.task.create({
      data: { ...(t.id && { id: t.id }), ...pickEditable(t), title: t.title.trim(), workspaceId } as Prisma.TaskUncheckedCreateInput,
    })),
  )
  res.json(created)
})

router.patch('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  if (!(await prisma.task.findFirst({ where: { id: req.params.id, workspaceId }, select: { id: true } }))) throw notFound()
  const data = pickEditable(req.body ?? {})
  await assertAssignable([data.assigneeId], workspaceId)
  await assertSprint([data.sprintId], workspaceId)
  res.json(await prisma.task.update({ where: { id: req.params.id }, data }))
})

router.delete('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  if (!(await prisma.task.findFirst({ where: { id: req.params.id, workspaceId }, select: { id: true } }))) throw notFound()
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { workspaceId, targetType: 'task', targetId: req.params.id } }),
    prisma.task.delete({ where: { id: req.params.id } }),
  ])
  res.json({ ok: true })
})

export default router
