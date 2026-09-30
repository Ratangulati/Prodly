import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { notFound } from '../lib/http.js'
import { snapshotBeforeChange } from '../lib/versions.js'

const router = Router()

async function findOwned(id: string, workspaceId: string) {
  const doc = await prisma.document.findFirst({ where: { id, workspaceId } })
  if (!doc) throw notFound()
  return doc
}

const serialize = <T extends { tags: string }>(d: T) => ({ ...d, tags: JSON.parse(d.tags) })

router.get('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const rows = await prisma.document.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } })
  res.json(rows.map((d) => ({ ...d, tags: JSON.parse(d.tags) })))
})

router.post('/', async (req, res) => {
  const { workspaceId } = authOf(req)
  const body = req.body
  const doc = await prisma.document.create({
    data: {
      id:        body.id,
      title:     body.title,
      content:   body.content,
      type:      body.type,
      tags:      JSON.stringify(body.tags ?? []),
      createdAt: body.createdAt ? new Date(body.createdAt) : undefined,
      workspaceId,
    },
  })
  res.json({ ...doc, tags: JSON.parse(doc.tags) })
})

/**
 * Send `versionReason: "ai"` when the change comes from the AI, so the
 * previous content is always kept in the version history.
 */
router.patch('/:id', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  const current = await findOwned(req.params.id, workspaceId)
  const body = req.body
  if (body.content !== undefined && body.content !== current.content) {
    await snapshotBeforeChange(current, body.versionReason === 'ai' ? 'ai' : 'edit', userId)
  }
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
  const { workspaceId } = authOf(req)
  await findOwned(req.params.id, workspaceId)
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { workspaceId, targetType: 'document', targetId: req.params.id } }),
    prisma.document.delete({ where: { id: req.params.id } }),
  ])
  res.json({ ok: true })
})

// ── Version history ──────────────────────────────────────────────────

router.get('/:id/versions', async (req, res) => {
  const { workspaceId } = authOf(req)
  await findOwned(req.params.id, workspaceId)
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  })
  res.json(versions.map(({ user, workspaceId: _ws, userId: _u, ...v }) => ({ ...v, authorName: user?.name ?? null })))
})

/** Replaces the document with an older version, keeping the current content as a version first. */
router.post('/:id/versions/:versionId/restore', async (req, res) => {
  const { workspaceId, userId } = authOf(req)
  const current = await findOwned(req.params.id, workspaceId)
  const version = await prisma.documentVersion.findFirst({ where: { id: req.params.versionId, documentId: current.id } })
  if (!version) throw notFound('Version not found')

  await snapshotBeforeChange(current, 'restore', userId)
  const doc = await prisma.document.update({ where: { id: current.id }, data: { content: version.content } })
  res.json(serialize(doc))
})

export default router
