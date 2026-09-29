import { Router } from 'express'
import type { ResearchInsight } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const router = Router()

const serialize = (r: ResearchInsight) => ({
  ...r,
  quotes:         JSON.parse(r.quotes),
  linkedFeatures: JSON.parse(r.linkedFeatures),
})

router.get('/', async (_req, res) => {
  const rows = await prisma.researchInsight.findMany()
  res.json(rows.map(serialize))
})

router.post('/', async (req, res) => {
  const body = req.body
  const insight = await prisma.researchInsight.create({
    data: {
      id:             body.id,
      theme:          body.theme,
      summary:        body.summary,
      quotes:         JSON.stringify(body.quotes ?? []),
      frequency:      body.frequency,
      linkedFeatures: JSON.stringify(body.linkedFeatures ?? []),
    },
  })
  res.json(serialize(insight))
})

router.patch('/:id', async (req, res) => {
  const body = req.body
  const insight = await prisma.researchInsight.update({
    where: { id: req.params.id },
    data: {
      ...(body.theme          !== undefined && { theme:          body.theme }),
      ...(body.summary        !== undefined && { summary:        body.summary }),
      ...(body.quotes         !== undefined && { quotes:         JSON.stringify(body.quotes) }),
      ...(body.frequency      !== undefined && { frequency:      body.frequency }),
      ...(body.linkedFeatures !== undefined && { linkedFeatures: JSON.stringify(body.linkedFeatures) }),
    },
  })
  res.json(serialize(insight))
})

router.delete('/:id', async (req, res) => {
  await prisma.researchInsight.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
