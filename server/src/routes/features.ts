import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  res.json(await prisma.feature.findMany())
})

router.post('/', async (req, res) => {
  res.json(await prisma.feature.create({ data: req.body }))
})

router.patch('/:id', async (req, res) => {
  res.json(await prisma.feature.update({ where: { id: req.params.id }, data: req.body }))
})

router.delete('/:id', async (req, res) => {
  await prisma.feature.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
