import type { Task } from '@prisma/client'

export type HttpFetch = typeof fetch

export interface GithubConfig {
  token: string
  /** "owner/repo" */
  repo: string
}

/** GitHub export is configured with GITHUB_TOKEN and GITHUB_REPO in server/.env. */
export function githubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
  return { token, repo }
}

const PRIORITY_LABELS: Record<string, string> = { P0: 'priority: P0', P1: 'priority: P1', P2: 'priority: P2', P3: 'priority: P3' }

export function issueBody(task: Task, context: { assignee?: string | null; prdTitle?: string | null }) {
  return [
    task.description || '_No description._',
    '',
    '---',
    `**Priority:** ${task.priority}${task.estimate ? ` · **Estimate:** ${task.estimate}` : ''}${task.dueDate ? ` · **Due:** ${task.dueDate}` : ''}`,
    context.assignee ? `**Owner in Prodly:** ${context.assignee}` : null,
    context.prdTitle ? `**From PRD:** ${context.prdTitle}` : null,
    '',
    '_Exported from Prodly_',
  ].filter((line) => line !== null).join('\n')
}

/** Creates one GitHub issue and returns its URL. */
export async function createGithubIssue(
  httpFetch: HttpFetch,
  config: GithubConfig,
  task: Task,
  context: { assignee?: string | null; prdTitle?: string | null },
): Promise<string> {
  const res = await httpFetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Prodly',
    },
    body: JSON.stringify({
      title: task.title,
      body: issueBody(task, context),
      labels: [PRIORITY_LABELS[task.priority] ?? 'priority: P2'],
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const reason = res.status === 401 ? 'GitHub rejected the token (check GITHUB_TOKEN)'
      : res.status === 403 ? 'The token is not allowed to create issues in this repository'
      : res.status === 404 ? `Repository ${config.repo} was not found, or the token can't see it`
      : res.status === 410 ? `Issues are disabled for ${config.repo}`
      : detail?.message ?? `GitHub returned ${res.status}`
    throw new Error(reason)
  }
  const issue = await res.json() as { html_url: string }
  return issue.html_url
}
