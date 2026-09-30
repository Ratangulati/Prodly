import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authOf } from '../lib/auth.js'
import { badRequest, HttpError } from '../lib/http.js'
import { createGithubIssue, githubConfig, type HttpFetch } from '../lib/github.js'

const MAX_EXPORT = 50

export function integrationsRouter({ httpFetch }: { httpFetch: HttpFetch }) {
  const router = Router()

  /** Which integrations are set up on this server. */
  router.get('/', (_req, res) => {
    const github = githubConfig()
    res.json({ github: github ? { repo: github.repo } : null })
  })

  /**
   * Exports tasks as GitHub issues. Tasks that were already exported are skipped.
   * Body: { taskIds: string[] }. Returns per-task results.
   */
  router.post('/github/issues', async (req, res) => {
    const { workspaceId } = authOf(req)
    const config = githubConfig()
    if (!config) throw new HttpError(400, 'GitHub export is not set up. Add GITHUB_TOKEN and GITHUB_REPO to server/.env.')

    const taskIds = req.body?.taskIds
    if (!Array.isArray(taskIds) || !taskIds.length || !taskIds.every((id) => typeof id === 'string')) {
      throw badRequest('taskIds must be a non-empty array')
    }
    if (taskIds.length > MAX_EXPORT) throw badRequest(`Export at most ${MAX_EXPORT} tasks at a time`)

    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds }, workspaceId } })
    const [members, docs] = await Promise.all([
      prisma.member.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
      prisma.document.findMany({ where: { workspaceId, id: { in: tasks.map((t) => t.sourceDocId).filter((id): id is string => !!id) } }, select: { id: true, title: true } }),
    ])

    const results: { taskId: string; url?: string; error?: string; skipped?: boolean }[] = []
    // One at a time keeps us well within GitHub's secondary rate limits
    for (const task of tasks) {
      if (task.externalUrl) {
        results.push({ taskId: task.id, url: task.externalUrl, skipped: true })
        continue
      }
      try {
        const url = await createGithubIssue(httpFetch, config, task, {
          assignee: members.find((m) => m.id === task.assigneeId)?.name ?? null,
          prdTitle: docs.find((d) => d.id === task.sourceDocId)?.title ?? null,
        })
        await prisma.task.update({ where: { id: task.id }, data: { externalUrl: url } })
        results.push({ taskId: task.id, url })
      } catch (err) {
        results.push({ taskId: task.id, error: err instanceof Error ? err.message : 'Export failed' })
        // A bad token or repo will fail every task the same way; stop early
        if (err instanceof Error && /token|not found|disabled|not allowed/.test(err.message)) break
      }
    }
    const missing = taskIds.filter((id) => !tasks.some((t) => t.id === id))
    for (const id of missing) results.push({ taskId: id, error: 'Task not found' })

    res.json({ results })
  })

  return router
}
