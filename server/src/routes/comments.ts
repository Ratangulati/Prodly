import { Router } from 'express'
import type { Comment, User, Member } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { badRequest, HttpError, notFound } from '../lib/http.js'

const router = Router()

const TARGET_TYPES = ['task', 'document'] as const
type TargetType = (typeof TARGET_TYPES)[number]

const MAX_BODY = 5000

type CommentWithAuthor = Comment & { user: User & { member: Member | null } }

const include = { user: { include: { member: true } } } as const

function serialize(c: CommentWithAuthor) {
  return {
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    body: c.body,
    mentions: JSON.parse(c.mentions) as string[],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: {
      userId: c.userId,
      name: c.user.name,
      memberId: c.user.member?.id ?? null,
      color: c.user.member?.color ?? '#6366f1',
    },
  }
}

async function assertTarget(targetType: unknown, targetId: unknown, workspaceId: string): Promise<[TargetType, string]> {
  if (!TARGET_TYPES.includes(targetType as TargetType) || typeof targetId !== 'string') {
    throw badRequest('targetType must be "task" or "document", with a targetId')
  }
  const exists = targetType === 'task'
    ? await prisma.task.findFirst({ where: { id: targetId, workspaceId }, select: { id: true } })
    : await prisma.document.findFirst({ where: { id: targetId, workspaceId }, select: { id: true } })
  if (!exists) throw notFound()
  return [targetType as TargetType, targetId]
}

/** Keeps only mentions of teammates in this workspace. */
async function validMentions(mentions: unknown, workspaceId: string): Promise<string[]> {
  if (!Array.isArray(mentions)) return []
  const ids = [...new Set(mentions.filter((m): m is string => typeof m === 'string'))]
  if (!ids.length) return []
  const found = await prisma.member.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true } })
  return found.map((m) => m.id)
}

function cleanBody(body: unknown): string {
  if (typeof body !== 'string' || !body.trim()) throw badRequest('Comment cannot be empty')
  if (body.length > MAX_BODY) throw badRequest(`Comments are limited to ${MAX_BODY} characters`)
  return body.trim()
}

async function findOwn(id: string, userId: string, workspaceId: string) {
  const comment = await prisma.comment.findFirst({ where: { id, workspaceId } })
  if (!comment) throw notFound()
  if (comment.userId !== userId) throw new HttpError(403, 'You can only change your own comments')
  return comment
}

/** Comments on one task or document, oldest first. */
router.get('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const [targetType, targetId] = await assertTarget(req.query.targetType, req.query.targetId, workspaceId)
  const comments = await prisma.comment.findMany({
    where: { workspaceId, targetType, targetId },
    orderBy: { createdAt: 'asc' },
    include,
  })
  res.json(comments.map(serialize))
})

/** Number of comments per task and document, for badges. */
router.get('/counts', async (req, res) => {
  const { workspaceId } = authOf(req)
  const groups = await prisma.comment.groupBy({
    by: ['targetType', 'targetId'],
    where: { workspaceId },
    _count: { _all: true },
  })
  res.json(groups.map((g) => ({ targetType: g.targetType, targetId: g.targetId, count: g._count._all })))
})

/** Recent comments that mention the signed-in user, newest first. */
router.get('/mentions', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  const member = await prisma.member.findUnique({ where: { userId }, select: { id: true } })
  if (!member) return void res.json([])
  const comments = await prisma.comment.findMany({
    // Mentions are stored as a JSON array of ids, so match the quoted id
    where: { workspaceId, mentions: { contains: `"${member.id}"` }, NOT: { userId } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include,
  })
  res.json(comments.map(serialize))
})

router.post('/', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  const [targetType, targetId] = await assertTarget(req.body?.targetType, req.body?.targetId, workspaceId)
  const comment = await prisma.comment.create({
    data: {
      targetType,
      targetId,
      body: cleanBody(req.body?.body),
      mentions: JSON.stringify(await validMentions(req.body?.mentions, workspaceId)),
      userId,
      workspaceId,
    },
    include,
  })
  res.status(201).json(serialize(comment))
})

router.patch('/:id', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  await findOwn(req.params.id, userId, workspaceId)
  const comment = await prisma.comment.update({
    where: { id: req.params.id },
    data: {
      body: cleanBody(req.body?.body),
      mentions: JSON.stringify(await validMentions(req.body?.mentions, workspaceId)),
    },
    include,
  })
  res.json(serialize(comment))
})

router.delete('/:id', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  await findOwn(req.params.id, userId, workspaceId)
  await prisma.comment.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
