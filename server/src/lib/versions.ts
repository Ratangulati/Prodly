import type { Document } from '@prisma/client'
import { prisma } from './prisma.js'

/** While someone is typing, keep at most one snapshot per this many minutes. */
const EDIT_SNAPSHOT_MINUTES = 10
/** Older snapshots beyond this count are deleted. */
const MAX_VERSIONS_PER_DOC = 50

export type VersionReason = 'edit' | 'ai' | 'restore'

/**
 * Saves the document as it is now, before it changes.
 * AI edits and restores always snapshot; ordinary edits snapshot at most every 10 minutes.
 */
export async function snapshotBeforeChange(doc: Document, reason: VersionReason, userId: string) {
  if (reason === 'edit') {
    const latest = await prisma.documentVersion.findFirst({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (latest && Date.now() - latest.createdAt.getTime() < EDIT_SNAPSHOT_MINUTES * 60_000) return
  }

  // Nothing worth keeping in an empty document
  if (!doc.content.replace(/<[^>]+>/g, '').trim()) return

  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      title: doc.title,
      content: doc.content,
      reason,
      userId,
      workspaceId: doc.workspaceId,
    },
  })

  const stale = await prisma.documentVersion.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: 'desc' },
    skip: MAX_VERSIONS_PER_DOC,
    select: { id: true },
  })
  if (stale.length) await prisma.documentVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } })
}
