import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { badRequest, HttpError, notFound } from '../lib/http.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

router.get('/', async (req, res) => {
  res.json(await prisma.sprint.findMany({ where: { workspaceId: authOf(req).workspaceId }, orderBy: { createdAt: 'desc' } }))
})

/**
 * Starts a sprint. `assignments` puts tasks into it and sets their assignee:
 * [{ taskId, assigneeId }]. Only one sprint can be active at a time.
 */
router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const { name, goal = '', startDate, endDate, assignments = [] } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) throw badRequest('Sprint name is required')
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) throw badRequest('Give a valid start and end date')
  if (!Array.isArray(assignments)) throw badRequest('assignments must be an array')
  if (await prisma.sprint.findFirst({ where: { workspaceId, status: 'active' } })) {
    throw new HttpError(409, 'Finish the current sprint before starting a new one')
  }

  const taskIds = assignments.map((a: { taskId?: unknown }) => a?.taskId).filter((id): id is string => typeof id === 'string')
  const assigneeIds = [...new Set(assignments.map((a: { assigneeId?: unknown }) => a?.assigneeId).filter((id): id is string => typeof id === 'string'))]
  const [taskCount, memberCount] = await Promise.all([
    prisma.task.count({ where: { id: { in: taskIds }, workspaceId } }),
    prisma.member.count({ where: { id: { in: assigneeIds }, workspaceId } }),
  ])
  if (taskCount !== new Set(taskIds).size || memberCount !== assigneeIds.length) throw badRequest('Unknown task or assignee')

  const sprint = await prisma.$transaction(async (tx) => {
    const created = await tx.sprint.create({
      data: { name: name.trim(), goal: String(goal).trim(), startDate, endDate, workspaceId },
    })
    for (const a of assignments as { taskId: string; assigneeId?: string | null }[]) {
      await tx.task.update({
        where: { id: a.taskId },
        data: { sprintId: created.id, ...(a.assigneeId !== undefined && { assigneeId: a.assigneeId }) },
      })
    }
    return created
  })

  const tasks = await prisma.task.findMany({ where: { sprintId: sprint.id } })
  res.status(201).json({ sprint, tasks })
})

router.patch('/:id', async (req, res) => {
  const { workspaceId } = authOf(req)
  if (!(await prisma.sprint.findFirst({ where: { id: req.params.id, workspaceId } }))) throw notFound()
  const { name, goal } = req.body ?? {}
  res.json(await prisma.sprint.update({
    where: { id: req.params.id },
    data: {
      ...(typeof name === 'string' && name.trim() && { name: name.trim() }),
      ...(typeof goal === 'string' && { goal: goal.trim() }),
    },
  }))
})

/** Ends the sprint; unfinished tasks go back to the backlog. */
router.post('/:id/complete', async (req, res) => {
  const { workspaceId } = authOf(req)
  const sprint = await prisma.sprint.findFirst({ where: { id: req.params.id, workspaceId } })
  if (!sprint) throw notFound()
  if (sprint.status !== 'active') throw badRequest('This sprint is already complete')
  const [, returned, updated] = await prisma.$transaction([
    prisma.task.count({ where: { sprintId: sprint.id, status: 'done' } }),
    prisma.task.updateMany({ where: { sprintId: sprint.id, status: { not: 'done' } }, data: { sprintId: null } }),
    prisma.sprint.update({ where: { id: sprint.id }, data: { status: 'completed' } }),
  ])
  res.json({ sprint: updated, returnedToBacklog: returned.count })
})

export default router
