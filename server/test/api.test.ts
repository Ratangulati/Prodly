import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { ApiError } from '@google/genai'
import type { ChatTurn, GenerateJson, StreamChat } from '../src/lib/ai.js'

// ── Isolated test database ───────────────────────────────────────────
// An in-memory Postgres (PGlite) served over a local socket: real Postgres behaviour,
// no Docker or network, and nothing touches development or production data.
const pg = await PGlite.create()
const pgPort = await freePort()
const pgServer = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: pgPort, maxConnections: 4 })
await pgServer.start()
// PGlite is a single database session, so Prisma must use one connection to keep transactions isolated
const TEST_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable&connection_limit=1`
process.env.POSTGRES_PRISMA_URL = TEST_DB_URL
process.env.DATABASE_URL_UNPOOLED = TEST_DB_URL
// Async on purpose: PGlite answers from this same process, so a blocking exec would deadlock
await promisify(exec)('npx prisma migrate deploy', { env: { ...process.env } })

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

// Imported after DATABASE_URL is set so Prisma connects to the test database
const { createApp } = await import('../src/app.js')
const { prisma } = await import('../src/lib/prisma.js')
const { seedDemo } = await import('../prisma/seed.js')

// ── Fake AI provider ─────────────────────────────────────────────────
let aiCalls: { systemPrompt: string; history: ChatTurn[]; userMessage: string }[] = []
let aiReply: string[] | Error = []
const fakeStreamChat: StreamChat = async (systemPrompt, history, userMessage) => {
  aiCalls.push({ systemPrompt, history, userMessage })
  if (aiReply instanceof Error) throw aiReply
  const chunks = aiReply
  return (async function* () { yield* chunks })()
}

let jsonCalls: { systemPrompt: string; userMessage: string }[] = []
let jsonReply: unknown = {}
const fakeGenerateJson: GenerateJson = async (systemPrompt, userMessage) => {
  jsonCalls.push({ systemPrompt, userMessage })
  if (jsonReply instanceof Error) throw jsonReply
  return jsonReply
}

// ── Fake GitHub API ──────────────────────────────────────────────────
let githubCalls: { url: string; headers: Record<string, string>; body: any }[] = []
let githubStatus = 201
let issueNumber = 0
const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  githubCalls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) })
  if (githubStatus !== 201) return new Response(JSON.stringify({ message: 'nope' }), { status: githubStatus })
  issueNumber++
  return new Response(JSON.stringify({ html_url: `https://github.com/acme/app/issues/${issueNumber}` }), { status: 201 })
}) as typeof fetch

let server: Server
let base: string

// Session cookie of the seeded demo user; every request uses it unless told otherwise
let demoCookie = ''

before(async () => {
  server = createApp({ streamChat: fakeStreamChat, generateJson: fakeGenerateJson, httpFetch: fakeFetch }).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await seedDemo(prisma)
  demoCookie = await login('demo@prodly.dev', 'prodly-demo')
})

after(async () => {
  server.close()
  await prisma.$disconnect()
  await pgServer.stop()
  await pg.close()
})

// Every test starts from the freshly seeded demo workspace
beforeEach(async () => {
  await prisma.$transaction([
    prisma.document.deleteMany(),
    prisma.feature.deleteMany(),
    prisma.researchInsight.deleteMany(),
    prisma.fileNode.deleteMany(),
    prisma.aIMessage.deleteMany(),
    prisma.task.deleteMany(),
    prisma.sprint.deleteMany(),
    // Accounts created by tests (not the demo user) and their workspaces. Runs before the
    // member cleanup so their teammate records (unlinked on delete) are removed too.
    prisma.user.deleteMany({ where: { email: { not: 'demo@prodly.dev' } } }),
    prisma.workspace.deleteMany({ where: { id: { not: 'ws-demo' } } }),
    // Keep the demo user's own teammate record; seeded teammates are recreated
    prisma.member.deleteMany({ where: { userId: null } }),
    prisma.aiUsage.deleteMany(),
    prisma.documentVersion.deleteMany(),
    prisma.comment.deleteMany(),
  ])
  await seedDemo(prisma)
  aiCalls = []
  aiReply = []
  jsonCalls = []
  jsonReply = {}
  githubCalls = []
  githubStatus = 201
})

async function api(method: string, url: string, body?: unknown, cookie: string | null = demoCookie) {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const res = await fetch(base + url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, text, json, headers: res.headers }
}

/** Returns the session cookie from a login or register response. */
function sessionCookie(res: { headers: Headers }) {
  const header = res.headers.get('set-cookie') ?? ''
  const match = header.match(/prodly_session=[^;]+/)
  assert.ok(match, 'expected a session cookie')
  return match[0]
}

async function login(email: string, password: string) {
  const res = await api('POST', '/api/auth/login', { email, password }, null)
  assert.equal(res.status, 200, res.text)
  return sessionCookie(res)
}

async function register(body: Record<string, unknown>) {
  const res = await api('POST', '/api/auth/register', body, null)
  return { ...res, cookie: res.status === 201 ? sessionCookie(res) : '' }
}

// ── Tests ────────────────────────────────────────────────────────────
test('health check', async () => {
  const res = await api('GET', '/api/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { ok: true })
})

test('seeded demo workspace is served', async () => {
  const docs = await api('GET', '/api/db/documents')
  assert.equal(docs.json.length, 4)
  assert.ok(Array.isArray(docs.json[0].tags))
  assert.equal((await api('GET', '/api/db/features')).json.length, 8)
  const insights = await api('GET', '/api/db/insights')
  assert.equal(insights.json.length, 3)
  assert.ok(Array.isArray(insights.json[0].quotes))
  const nodes = await api('GET', '/api/db/filenodes')
  assert.equal(nodes.json.length, 6)
  assert.ok(Array.isArray(nodes.json[0].children))
  assert.equal((await api('GET', '/api/db/messages')).json.length, 0)
  // Five seeded teammates plus the demo user
  assert.equal((await api('GET', '/api/db/members')).json.length, 6)
  const tasks = await api('GET', '/api/db/tasks')
  assert.equal(tasks.json.length, 5)
  assert.ok(tasks.json.every((t: any) => t.sourceDocId === 'doc-1'))
})

describe('documents', () => {
  test('create, update, delete', async () => {
    const created = await api('POST', '/api/db/documents', {
      id: 'd1', title: 'Spec', content: '<p>hi</p>', type: 'prd', tags: ['a', 'b'],
    })
    assert.equal(created.status, 200)
    assert.deepEqual(created.json.tags, ['a', 'b'])

    const updated = await api('PATCH', '/api/db/documents/d1', { content: '<p>new</p>', tags: ['c'] })
    assert.equal(updated.json.title, 'Spec')
    assert.equal(updated.json.content, '<p>new</p>')
    assert.deepEqual(updated.json.tags, ['c'])

    assert.deepEqual((await api('DELETE', '/api/db/documents/d1')).json, { ok: true })
    assert.equal((await api('GET', '/api/db/documents')).json.length, 4)
  })

  test('missing document returns 404', async () => {
    assert.equal((await api('PATCH', '/api/db/documents/nope', { title: 'x' })).status, 404)
    assert.equal((await api('DELETE', '/api/db/documents/nope')).status, 404)
  })

  test('malformed JSON returns 400', async () => {
    const res = await fetch(base + '/api/db/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json',
    })
    assert.equal(res.status, 400)
  })
})

describe('features', () => {
  test('create, update, delete', async () => {
    const created = await api('POST', '/api/db/features', {
      id: 'f1', title: 'Dark mode', description: 'd', status: 'Now', priority: 'P1',
      reach: 100, impact: 2, confidence: 80, effort: 4, riceScore: 40, moscow: 'Must',
      assignee: '', dueDate: '', linkedDocId: 'doc-1',
    })
    assert.equal(created.status, 200)

    const updated = await api('PATCH', '/api/db/features/f1', { status: 'Done', reach: 200, linkedDocId: null })
    assert.equal(updated.json.status, 'Done')
    assert.equal(updated.json.reach, 200)
    assert.equal(updated.json.title, 'Dark mode')
    assert.equal(updated.json.linkedDocId, null)

    assert.equal((await api('DELETE', '/api/db/features/f1')).status, 200)
    assert.equal((await api('GET', '/api/db/features')).json.length, 8)
  })

  test('unknown and protected fields are ignored', async () => {
    const res = await api('PATCH', '/api/db/features/feat-1', { bogus: 1, workspaceId: 'elsewhere', title: 'Renamed' })
    assert.equal(res.status, 200)
    assert.equal(res.json.title, 'Renamed')
    assert.equal(res.json.workspaceId, 'ws-demo')
  })
})

describe('insights', () => {
  test('create, update, delete', async () => {
    await api('POST', '/api/db/insights', {
      id: 'i1', theme: 'Speed', summary: 's', quotes: ['q1'], frequency: 3, linkedFeatures: [],
    })
    const updated = await api('PATCH', '/api/db/insights/i1', { frequency: 5, linkedFeatures: ['feat-1'] })
    assert.equal(updated.json.frequency, 5)
    assert.deepEqual(updated.json.linkedFeatures, ['feat-1'])
    assert.deepEqual(updated.json.quotes, ['q1'])

    assert.equal((await api('DELETE', '/api/db/insights/i1')).status, 200)
    assert.equal((await api('DELETE', '/api/db/insights/i1')).status, 404)
  })
})

describe('file nodes', () => {
  test('folder tree operations', async () => {
    await api('POST', '/api/db/filenodes', { id: 'fold', name: 'Specs', type: 'folder', parentId: null, children: [] })
    await api('POST', '/api/db/filenodes', { id: 'child', name: 'Doc', type: 'prd', parentId: 'fold' })

    const updated = await api('PATCH', '/api/db/filenodes/fold', { children: ['child'], name: 'Renamed' })
    assert.deepEqual(updated.json.children, ['child'])
    assert.equal(updated.json.name, 'Renamed')

    assert.equal((await api('GET', '/api/db/filenodes')).json.length, 8)
    assert.equal((await api('DELETE', '/api/db/filenodes/child')).status, 200)
    assert.equal((await api('DELETE', '/api/db/filenodes/fold')).status, 200)
  })
})

describe('messages', () => {
  test('create and clear by workflow', async () => {
    const m1 = await api('POST', '/api/db/messages', {
      id: 'm1', role: 'user', content: 'hi', workflow: 'prd', timestamp: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(m1.json.timestamp, '2026-01-01T00:00:00.000Z')
    await api('POST', '/api/db/messages', { id: 'm2', role: 'assistant', content: 'yo', workflow: 'general' })

    assert.equal((await api('DELETE', '/api/db/messages', { workflow: 'prd' })).status, 200)
    const left = await api('GET', '/api/db/messages')
    assert.deepEqual(left.json.map((m: any) => m.id), ['m2'])

    await api('DELETE', '/api/db/messages')
    assert.equal((await api('GET', '/api/db/messages')).json.length, 0)
  })
})

describe('AI', () => {
  test('streams the reply as plain text', async () => {
    aiReply = ['Hello', ', ', 'world']
    const res = await api('POST', '/api/ai', {
      workflow: 'prd',
      userMessage: 'Write a PRD',
      documentContext: 'DOC-CONTEXT',
      conversationHistory: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
    })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/plain/)
    assert.equal(res.text, 'Hello, world')

    const call = aiCalls[0]
    assert.equal(call.userMessage, 'Write a PRD')
    assert.deepEqual(call.history, [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])
    assert.match(call.systemPrompt, /Principal Product Manager/)
    assert.match(call.systemPrompt, /## Active Document Context/)
    assert.ok(call.systemPrompt.endsWith('DOC-CONTEXT'))
  })

  test('defaults to the general workflow', async () => {
    aiReply = ['ok']
    const res = await api('POST', '/api/ai', { userMessage: 'hi' })
    assert.equal(res.text, 'ok')
    assert.match(aiCalls[0].systemPrompt, /co-pilot/)
    assert.doesNotMatch(aiCalls[0].systemPrompt, /Active Document Context/)
  })

  for (const workflow of ['prd', 'stories', 'roadmap', 'prioritization', 'research', 'data', 'general', 'update']) {
    test(`has a system prompt for "${workflow}"`, async () => {
      aiReply = ['ok']
      assert.equal((await api('POST', '/api/ai', { workflow, userMessage: 'hi' })).status, 200)
      assert.ok(aiCalls[0].systemPrompt.length > 500)
    })
  }

  test('rejects a missing or blank message', async () => {
    const res = await api('POST', '/api/ai', {})
    assert.equal(res.status, 400)
    assert.equal(res.text, 'userMessage is required')
    assert.equal((await api('POST', '/api/ai', { userMessage: '   ' })).status, 400)
    assert.equal(aiCalls.length, 0)
  })

  test('rejects an unknown workflow', async () => {
    assert.equal((await api('POST', '/api/ai', { userMessage: 'hi', workflow: 'poetry' })).status, 400)
  })

  test('provider failure returns 502 with a readable message and kind', async () => {
    aiReply = new Error('something odd')
    const res = await api('POST', '/api/ai', { userMessage: 'hi' })
    assert.equal(res.status, 502)
    assert.equal(res.text, 'The AI request failed. Please try again.')
    assert.equal(res.headers.get('x-ai-error-kind'), 'failed')
  })

  test('each kind of AI failure is explained', async () => {
    const cases: [Error, string, RegExp][] = [
      [new ApiError({ message: 'quota', status: 429 }), 'quota', /usage quota/],
      [new ApiError({ message: 'busy', status: 503 }), 'busy', /overloaded/],
      [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), 'timeout', /didn't respond in time/],
      [new TypeError('fetch failed'), 'timeout', /didn't respond in time/],
      [new ApiError({ message: 'bad key', status: 403 }), 'config', /GEMINI_API_KEY/],
      [new Error('GEMINI_API_KEY is not set on the server'), 'config', /GEMINI_API_KEY/],
    ]
    for (const [error, kind, message] of cases) {
      aiReply = error
      const res = await api('POST', '/api/ai', { userMessage: 'hi' })
      assert.equal(res.headers.get('x-ai-error-kind'), kind, `kind for ${error.message}`)
      assert.match(res.text, message)
    }
  })

  test('a failure mid-stream is marked instead of silently cutting off', async () => {
    const failingStream: StreamChat = async () => (async function* () {
      yield 'Partial answer'
      throw new ApiError({ message: 'busy', status: 503 })
    })()
    const app = createApp({ streamChat: failingStream, generateJson: fakeGenerateJson }).listen(0)
    try {
      const res = await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: demoCookie },
        body: JSON.stringify({ userMessage: 'hi' }),
      })
      const text = await res.text()
      assert.equal(res.status, 200)
      assert.ok(text.startsWith('Partial answer'))
      assert.match(text, /\u0000PRODLY_AI_ERROR:busy:.*overloaded/)
    } finally {
      app.close()
    }
  })
})

describe('members', () => {
  test('create, rename and delete', async () => {
    const created = await api('POST', '/api/db/members', { name: '  Frank  ', color: '#ff0000' })
    assert.equal(created.json.name, 'Frank')
    assert.equal(created.json.color, '#ff0000')

    const renamed = await api('PATCH', `/api/db/members/${created.json.id}`, { name: 'Francis' })
    assert.equal(renamed.json.name, 'Francis')

    assert.equal((await api('DELETE', `/api/db/members/${created.json.id}`)).status, 200)
    assert.equal((await api('GET', '/api/db/members')).json.length, 6)
  })

  test('name is required', async () => {
    assert.equal((await api('POST', '/api/db/members', { name: ' ' })).status, 400)
  })

  test('deleting a member unassigns their tasks', async () => {
    await api('DELETE', '/api/db/members/member-alice')
    const tasks = (await api('GET', '/api/db/tasks')).json
    assert.equal(tasks.find((t: any) => t.id === 'task-2').assigneeId, null)
  })
})

describe('tasks', () => {
  test('create with defaults, update, delete', async () => {
    const created = await api('POST', '/api/db/tasks', { title: '  Write copy  ' })
    assert.equal(created.status, 200)
    assert.equal(created.json.title, 'Write copy')
    assert.equal(created.json.status, 'todo')
    assert.equal(created.json.priority, 'P2')
    assert.equal(created.json.assigneeId, null)

    const updated = await api('PATCH', `/api/db/tasks/${created.json.id}`, {
      status: 'in-progress', assigneeId: 'member-bob', order: 3, bogus: 'ignored',
    })
    assert.equal(updated.json.status, 'in-progress')
    assert.equal(updated.json.assigneeId, 'member-bob')
    assert.equal(updated.json.order, 3)
    assert.equal(updated.json.title, 'Write copy')

    assert.equal((await api('DELETE', `/api/db/tasks/${created.json.id}`)).status, 200)
    assert.equal((await api('DELETE', `/api/db/tasks/${created.json.id}`)).status, 404)
  })

  test('title is required', async () => {
    assert.equal((await api('POST', '/api/db/tasks', { title: '' })).status, 400)
  })

  test('bulk create', async () => {
    const res = await api('POST', '/api/db/tasks/bulk', {
      tasks: [
        { id: 'b1', title: 'One', sourceDocId: 'doc-1', priority: 'P0' },
        { id: 'b2', title: 'Two', sourceDocId: 'doc-1', estimate: 'L' },
      ],
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.map((t: any) => t.id), ['b1', 'b2'])
    assert.equal((await api('GET', '/api/db/tasks')).json.length, 7)
  })

  test('bulk create rejects invalid items', async () => {
    assert.equal((await api('POST', '/api/db/tasks/bulk', { tasks: [{ title: 'ok' }, { title: '' }] })).status, 400)
    assert.equal((await api('POST', '/api/db/tasks/bulk', {})).status, 400)
    assert.equal((await api('GET', '/api/db/tasks')).json.length, 5)
  })
})

describe('AI planning', () => {
  const prd = { title: 'Checklist PRD', content: '<h1>Checklist</h1><p>Users need a role-based onboarding checklist.</p>' }

  test('generates tasks from a PRD', async () => {
    jsonReply = {
      tasks: [
        { title: ' Build role picker ', description: 'Add it to sign-up.', priority: 'P0', estimate: 'S' },
        { title: 'Odd values', description: 7, priority: 'urgent', estimate: 'huge' },
        { title: '' },
        'garbage',
      ],
    }
    const res = await api('POST', '/api/ai/tasks', prd)
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.tasks, [
      { title: 'Build role picker', description: 'Add it to sign-up.', priority: 'P0', estimate: 'S' },
      { title: 'Odd values', description: '', priority: 'P2', estimate: 'M' },
    ])
    // The model receives plain text, not HTML
    assert.match(jsonCalls[0].userMessage, /PRD title: Checklist PRD/)
    assert.doesNotMatch(jsonCalls[0].userMessage, /<h1>/)
    assert.match(jsonCalls[0].systemPrompt, /task list/)
  })

  test('empty PRD is rejected without calling the AI', async () => {
    const res = await api('POST', '/api/ai/tasks', { title: 'x', content: '<p></p>' })
    assert.equal(res.status, 400)
    assert.equal(jsonCalls.length, 0)
  })

  test('no usable tasks returns 502', async () => {
    jsonReply = { tasks: [] }
    assert.equal((await api('POST', '/api/ai/tasks', prd)).status, 502)
  })

  test('AI failure while generating tasks returns 502 with a readable message', async () => {
    jsonReply = new ApiError({ message: 'quota', status: 429 })
    const res = await api('POST', '/api/ai/tasks', prd)
    assert.equal(res.status, 502)
    assert.match(res.json.error, /usage quota/)
    assert.equal(res.json.kind, 'quota')
  })

  test('reviews PRD quality', async () => {
    jsonReply = {
      score: 140,
      summary: ' Solid start. ',
      checks: [
        { area: 'Problem statement', status: 'pass', feedback: 'Clear.' },
        { area: 'Metrics', status: 'maybe', feedback: 'Add baselines.' },
        { status: 'fail' },
      ],
    }
    const res = await api('POST', '/api/ai/review', prd)
    assert.equal(res.status, 200)
    assert.deepEqual(res.json, {
      score: 100,
      summary: 'Solid start.',
      checks: [
        { area: 'Problem statement', status: 'pass', feedback: 'Clear.' },
        { area: 'Metrics', status: 'warn', feedback: 'Add baselines.' },
      ],
    })
    assert.match(jsonCalls[0].systemPrompt, /Score the PRD/)
  })

  test('empty PRD review is rejected', async () => {
    assert.equal((await api('POST', '/api/ai/review', { content: '' })).status, 400)
  })
})

describe('accounts', () => {
  test('data routes require a session', async () => {
    assert.equal((await api('GET', '/api/db/documents', undefined, null)).status, 401)
    assert.equal((await api('POST', '/api/ai', { userMessage: 'hi' }, null)).status, 401)
    assert.equal((await api('GET', '/api/db/documents', undefined, 'prodly_session=forged')).status, 401)
  })

  test('me returns the user, their teammate record and workspace', async () => {
    const me = await api('GET', '/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.json.user.email, 'demo@prodly.dev')
    assert.ok(me.json.user.memberId)
    assert.equal(me.json.workspace.name, 'Demo workspace')
    assert.equal(me.json.workspace.joinCode, 'DEMO-PRODLY')
    assert.equal(me.json.user.passwordHash, undefined)
  })

  test('wrong password is rejected with a generic message', async () => {
    const res = await api('POST', '/api/auth/login', { email: 'demo@prodly.dev', password: 'nope-nope' }, null)
    assert.equal(res.status, 401)
    assert.equal(res.json.error, 'Incorrect email or password')
    const unknown = await api('POST', '/api/auth/login', { email: 'ghost@prodly.dev', password: 'whatever1' }, null)
    assert.equal(unknown.json.error, 'Incorrect email or password')
  })

  test('register validates input', async () => {
    assert.equal((await register({ name: '', email: 'a@b.co', password: 'longenough' })).status, 400)
    assert.equal((await register({ name: 'A', email: 'not-an-email', password: 'longenough' })).status, 400)
    assert.equal((await register({ name: 'A', email: 'a@b.co', password: 'short' })).status, 400)
    assert.equal((await register({ name: 'A', email: 'DEMO@prodly.dev', password: 'longenough' })).status, 409)
    assert.equal((await register({ name: 'A', email: 'a@b.co', password: 'longenough', joinCode: 'NOPE-NOPE' })).status, 400)
  })

  test('a new workspace is private to its members', async () => {
    const zoe = await register({ name: 'Zoe', email: 'Zoe@Example.com', password: 'zoe-password', workspaceName: 'Zoe Co' })
    assert.equal(zoe.status, 201)
    assert.equal(zoe.json.user.email, 'zoe@example.com')
    assert.equal(zoe.json.workspace.name, 'Zoe Co')
    assert.match(zoe.json.workspace.joinCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

    // Starts empty apart from Zoe herself
    assert.equal((await api('GET', '/api/db/documents', undefined, zoe.cookie)).json.length, 0)
    const members = (await api('GET', '/api/db/members', undefined, zoe.cookie)).json
    assert.deepEqual(members.map((m: any) => m.name), ['Zoe'])

    // Cannot see or change the demo workspace's data
    assert.equal((await api('PATCH', '/api/db/documents/doc-1', { title: 'hacked' }, zoe.cookie)).status, 404)
    assert.equal((await api('DELETE', '/api/db/tasks/task-1', undefined, zoe.cookie)).status, 404)
    assert.equal((await api('DELETE', '/api/db/members/member-alice', undefined, zoe.cookie)).status, 404)
    assert.equal((await api('POST', '/api/db/tasks', { title: 'x', assigneeId: 'member-alice' }, zoe.cookie)).status, 400)
    assert.equal((await api('GET', '/api/db/documents')).json.find((d: any) => d.id === 'doc-1').title, 'AI-Powered Onboarding Flow — PRD')

    // And her data stays out of the demo workspace
    await api('POST', '/api/db/documents', { id: 'zoe-doc', title: 'Zoe doc', content: '', type: 'general' }, zoe.cookie)
    assert.equal((await api('GET', '/api/db/documents')).json.some((d: any) => d.id === 'zoe-doc'), false)
  })

  test('joining with an invite code shares the workspace', async () => {
    const sam = await register({ name: 'Sam', email: 'sam@example.com', password: 'sam-password', joinCode: 'demo-prodly' })
    assert.equal(sam.status, 201)
    assert.equal(sam.json.workspace.id, 'ws-demo')
    assert.equal((await api('GET', '/api/db/documents', undefined, sam.cookie)).json.length, 4)
    const members = (await api('GET', '/api/db/members')).json
    assert.ok(members.some((m: any) => m.name === 'Sam' && m.userId))
  })

  test('teammates with an account cannot be removed', async () => {
    const me = await api('GET', '/api/auth/me')
    assert.equal((await api('DELETE', `/api/db/members/${me.json.user.memberId}`)).status, 400)
  })

  test('logout ends the session', async () => {
    const cookie = await login('demo@prodly.dev', 'prodly-demo')
    assert.equal((await api('POST', '/api/auth/logout', undefined, cookie)).status, 200)
    assert.equal((await api('GET', '/api/auth/me', undefined, cookie)).status, 401)
    // Other sessions stay signed in
    assert.equal((await api('GET', '/api/auth/me')).status, 200)
  })

  test('AI requests are limited per user per day', async () => {
    process.env.AI_DAILY_LIMIT = '2'
    try {
      aiReply = ['ok']
      assert.equal((await api('POST', '/api/ai', { userMessage: 'one' })).status, 200)
      aiReply = ['ok']
      assert.equal((await api('POST', '/api/ai', { userMessage: 'two' })).status, 200)
      const third = await api('POST', '/api/ai', { userMessage: 'three' })
      assert.equal(third.status, 429)
      assert.match(third.text, /all 2 of your AI requests/)
      assert.equal(third.headers.get('x-ai-error-kind'), 'limit')
      assert.equal(aiCalls.length, 2)
    } finally {
      delete process.env.AI_DAILY_LIMIT
    }
  })
})

describe('version history', () => {
  const versions = async (docId = 'doc-1') => (await api('GET', `/api/db/documents/${docId}/versions`)).json

  test('typing keeps at most one snapshot per 10 minutes', async () => {
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>first edit</p>' })
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>second edit</p>' })
    const list = await versions()
    assert.equal(list.length, 1)
    assert.match(list[0].content, /AI-Powered Onboarding Flow/) // the original content
    assert.equal(list[0].reason, 'edit')
    assert.equal(list[0].authorName, 'Demo PM')
  })

  test('AI changes always keep the previous content', async () => {
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>edit</p>' })
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>ai one</p>', versionReason: 'ai' })
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>ai two</p>', versionReason: 'ai' })
    const list = await versions()
    assert.deepEqual(list.map((v: any) => v.reason), ['ai', 'ai', 'edit'])
    assert.equal(list[0].content, '<p>ai one</p>')
  })

  test('title-only changes and unchanged content do not create versions', async () => {
    await api('PATCH', '/api/db/documents/doc-1', { title: 'Renamed' })
    const doc = (await api('GET', '/api/db/documents')).json.find((d: any) => d.id === 'doc-1')
    await api('PATCH', '/api/db/documents/doc-1', { content: doc.content })
    assert.equal((await versions()).length, 0)
  })

  test('restoring brings back old content and keeps the current content as a version', async () => {
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>replaced by AI</p>', versionReason: 'ai' })
    const [original] = await versions()
    const restored = await api('POST', `/api/db/documents/doc-1/versions/${original.id}/restore`)
    assert.equal(restored.status, 200)
    assert.match(restored.json.content, /AI-Powered Onboarding Flow/)
    assert.ok(Array.isArray(restored.json.tags))
    const list = await versions()
    assert.equal(list[0].reason, 'restore')
    assert.equal(list[0].content, '<p>replaced by AI</p>')
  })

  test('versions are private to the workspace', async () => {
    await api('PATCH', '/api/db/documents/doc-1', { content: '<p>x</p>', versionReason: 'ai' })
    const [v] = await versions()
    const zoe = await register({ name: 'Zoe', email: 'zoe@example.com', password: 'zoe-password' })
    assert.equal((await api('GET', '/api/db/documents/doc-1/versions', undefined, zoe.cookie)).status, 404)
    assert.equal((await api('POST', `/api/db/documents/doc-1/versions/${v.id}/restore`, undefined, zoe.cookie)).status, 404)
    assert.equal((await api('POST', `/api/db/documents/doc-2/versions/${v.id}/restore`)).status, 404)
  })
})

describe('comments', () => {
  test('post, list, edit and delete on a task', async () => {
    const posted = await api('POST', '/api/db/comments', {
      targetType: 'task', targetId: 'task-2', body: '  @Alice can you take this?  ', mentions: ['member-alice', 'member-alice', 'bogus'],
    })
    assert.equal(posted.status, 201)
    assert.equal(posted.json.body, '@Alice can you take this?')
    assert.deepEqual(posted.json.mentions, ['member-alice'])
    assert.equal(posted.json.author.name, 'Demo PM')

    const list = await api('GET', '/api/db/comments?targetType=task&targetId=task-2')
    assert.equal(list.json.length, 1)

    const edited = await api('PATCH', `/api/db/comments/${posted.json.id}`, { body: 'Updated', mentions: [] })
    assert.equal(edited.json.body, 'Updated')
    assert.deepEqual(edited.json.mentions, [])

    assert.equal((await api('DELETE', `/api/db/comments/${posted.json.id}`)).status, 200)
    assert.equal((await api('GET', '/api/db/comments?targetType=task&targetId=task-2')).json.length, 0)
  })

  test('validates the target and body', async () => {
    assert.equal((await api('POST', '/api/db/comments', { targetType: 'feature', targetId: 'feat-1', body: 'x' })).status, 400)
    assert.equal((await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'missing', body: 'x' })).status, 404)
    assert.equal((await api('POST', '/api/db/comments', { targetType: 'document', targetId: 'doc-1', body: '   ' })).status, 400)
    assert.equal((await api('POST', '/api/db/comments', { targetType: 'document', targetId: 'doc-1', body: 'x'.repeat(5001) })).status, 400)
  })

  test('only the author can change a comment', async () => {
    const posted = await api('POST', '/api/db/comments', { targetType: 'document', targetId: 'doc-1', body: 'mine' })
    const sam = await register({ name: 'Sam', email: 'sam@example.com', password: 'sam-password', joinCode: 'DEMO-PRODLY' })
    assert.equal((await api('PATCH', `/api/db/comments/${posted.json.id}`, { body: 'hijack' }, sam.cookie)).status, 403)
    assert.equal((await api('DELETE', `/api/db/comments/${posted.json.id}`, undefined, sam.cookie)).status, 403)
    // But teammates can read it
    assert.equal((await api('GET', '/api/db/comments?targetType=document&targetId=doc-1', undefined, sam.cookie)).json.length, 1)
  })

  test('mentions inbox shows comments that mention me, from others', async () => {
    const me = (await api('GET', '/api/auth/me')).json.user
    const sam = await register({ name: 'Sam', email: 'sam@example.com', password: 'sam-password', joinCode: 'DEMO-PRODLY' })
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-1', body: '@Demo PM please review', mentions: [me.memberId] }, sam.cookie)
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-1', body: 'no mention' }, sam.cookie)
    // Mentioning yourself doesn't notify you
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-1', body: '@Demo PM note to self', mentions: [me.memberId] })

    const inbox = (await api('GET', '/api/db/comments/mentions')).json
    assert.equal(inbox.length, 1)
    assert.equal(inbox[0].author.name, 'Sam')
    assert.equal(inbox[0].targetId, 'task-1')
  })

  test('counts per target, and cleanup when the target is deleted', async () => {
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-5', body: 'one' })
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-5', body: 'two' })
    const counts = (await api('GET', '/api/db/comments/counts')).json
    assert.deepEqual(counts, [{ targetType: 'task', targetId: 'task-5', count: 2 }])

    await api('DELETE', '/api/db/tasks/task-5')
    assert.deepEqual((await api('GET', '/api/db/comments/counts')).json, [])
  })

  test('comments are private to the workspace', async () => {
    await api('POST', '/api/db/comments', { targetType: 'task', targetId: 'task-1', body: 'secret' })
    const zoe = await register({ name: 'Zoe', email: 'zoe@example.com', password: 'zoe-password' })
    assert.equal((await api('GET', '/api/db/comments?targetType=task&targetId=task-1', undefined, zoe.cookie)).status, 404)
    assert.deepEqual((await api('GET', '/api/db/comments/counts', undefined, zoe.cookie)).json, [])
  })
})

describe('sprints', () => {
  const today = new Date().toISOString().slice(0, 10)

  test('AI plan is checked against capacity and real tasks', async () => {
    // Open tasks: task-2 (M=3), task-3 (M=3), task-4 (S=2), task-5 (S=2); task-1 is done
    jsonReply = {
      goal: ' Ship the personalised checklist ',
      committed: [
        { taskId: 'task-2', assigneeId: 'member-alice', reason: 'In progress' },
        { taskId: 'task-3', assigneeId: 'member-alice', reason: 'Too much for Alice' },
        { taskId: 'task-4', assigneeId: 'member-carol', reason: 'In review' },
        { taskId: 'task-1', assigneeId: 'member-bob', reason: 'Already done' },
        { taskId: 'made-up', assigneeId: 'member-bob', reason: 'Invented' },
        { taskId: 'task-5', assigneeId: 'member-nobody', reason: 'Unknown person' },
      ],
      deferred: [],
    }
    const res = await api('POST', '/api/ai/sprint', { capacity: { 'member-alice': 4, 'member-carol': 2, 'not-a-member': 50 } })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json.goal, 'Ship the personalised checklist')
    assert.deepEqual(res.json.committed.map((c: any) => [c.taskId, c.assigneeId, c.points]), [
      ['task-2', 'member-alice', 3],
      ['task-4', 'member-carol', 2],
    ])
    assert.deepEqual(res.json.deferred.map((d: any) => d.taskId).sort(), ['task-3', 'task-5'])
    // The model only sees open tasks and the people with capacity
    assert.doesNotMatch(jsonCalls[0].userMessage, /task-1/)
    assert.doesNotMatch(jsonCalls[0].userMessage, /not-a-member/)
  })

  test('planning needs capacity and open tasks', async () => {
    assert.equal((await api('POST', '/api/ai/sprint', { capacity: {} })).status, 400)
    await prisma.task.updateMany({ data: { status: 'done' } })
    assert.equal((await api('POST', '/api/ai/sprint', { capacity: { 'member-alice': 5 } })).status, 400)
    assert.equal(jsonCalls.length, 0)
  })

  test('start a sprint, then complete it', async () => {
    const started = await api('POST', '/api/db/sprints', {
      name: 'Sprint 1', goal: 'Checklist live', startDate: today, endDate: today,
      assignments: [{ taskId: 'task-2', assigneeId: 'member-bob' }, { taskId: 'task-5' }],
    })
    assert.equal(started.status, 201, started.text)
    assert.equal(started.json.sprint.status, 'active')
    assert.equal(started.json.tasks.length, 2)
    assert.equal(started.json.tasks.find((t: any) => t.id === 'task-2').assigneeId, 'member-bob')
    assert.equal(started.json.tasks.find((t: any) => t.id === 'task-5').assigneeId, 'member-eve')

    // Only one active sprint at a time
    const second = await api('POST', '/api/db/sprints', { name: 'Sprint 2', startDate: today, endDate: today })
    assert.equal(second.status, 409)

    await api('PATCH', '/api/db/tasks/task-5', { status: 'done' })
    const done = await api('POST', `/api/db/sprints/${started.json.sprint.id}/complete`)
    assert.equal(done.status, 200)
    assert.equal(done.json.sprint.status, 'completed')
    assert.equal(done.json.returnedToBacklog, 1)

    const tasks = (await api('GET', '/api/db/tasks')).json
    assert.equal(tasks.find((t: any) => t.id === 'task-2').sprintId, null)
    assert.equal(tasks.find((t: any) => t.id === 'task-5').sprintId, started.json.sprint.id)
    assert.equal((await api('POST', `/api/db/sprints/${started.json.sprint.id}/complete`)).status, 400)
  })

  test('validates sprint input and task membership', async () => {
    assert.equal((await api('POST', '/api/db/sprints', { name: '', startDate: today, endDate: today })).status, 400)
    assert.equal((await api('POST', '/api/db/sprints', { name: 'S', startDate: '2026-10-10', endDate: '2026-10-01' })).status, 400)
    assert.equal((await api('POST', '/api/db/sprints', { name: 'S', startDate: today, endDate: today, assignments: [{ taskId: 'nope' }] })).status, 400)

    const { json } = await api('POST', '/api/db/sprints', { name: 'S', startDate: today, endDate: today })
    await api('POST', `/api/db/sprints/${json.sprint.id}/complete`)
    // Completed sprints can't take new tasks
    assert.equal((await api('PATCH', '/api/db/tasks/task-3', { sprintId: json.sprint.id })).status, 400)
  })

  test('sprints are private to the workspace', async () => {
    const { json } = await api('POST', '/api/db/sprints', { name: 'Private', startDate: today, endDate: today })
    const zoe = await register({ name: 'Zoe', email: 'zoe@example.com', password: 'zoe-password' })
    assert.deepEqual((await api('GET', '/api/db/sprints', undefined, zoe.cookie)).json, [])
    assert.equal((await api('POST', `/api/db/sprints/${json.sprint.id}/complete`, undefined, zoe.cookie)).status, 404)
    const zoeTask = (await api('POST', '/api/db/tasks', { title: 'Zoe task' }, zoe.cookie)).json
    assert.equal((await api('PATCH', `/api/db/tasks/${zoeTask.id}`, { sprintId: json.sprint.id }, zoe.cookie)).status, 400)
  })
})

describe('GitHub export', () => {
  const withGithub = async (fn: () => Promise<void>) => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPO = 'acme/app'
    try { await fn() } finally {
      delete process.env.GITHUB_TOKEN
      delete process.env.GITHUB_REPO
    }
  }

  test('reports whether GitHub is configured', async () => {
    assert.deepEqual((await api('GET', '/api/integrations')).json, { github: null })
    await withGithub(async () => {
      assert.deepEqual((await api('GET', '/api/integrations')).json, { github: { repo: 'acme/app' } })
    })
    assert.equal((await api('POST', '/api/integrations/github/issues', { taskIds: ['task-2'] })).status, 400)
  })

  test('creates issues, saves their links and skips tasks already exported', () => withGithub(async () => {
    const res = await api('POST', '/api/integrations/github/issues', { taskIds: ['task-2', 'missing'] })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.results, [
      { taskId: 'task-2', url: 'https://github.com/acme/app/issues/1' },
      { taskId: 'missing', error: 'Task not found' },
    ])
    const call = githubCalls[0]
    assert.equal(call.url, 'https://api.github.com/repos/acme/app/issues')
    assert.equal(call.headers.Authorization, 'Bearer ghp_test')
    assert.equal(call.body.title, 'Generate checklist from role and goals')
    assert.deepEqual(call.body.labels, ['priority: P0'])
    assert.match(call.body.body, /Owner in Prodly:\*\* Alice/)
    assert.match(call.body.body, /From PRD:\*\* AI-Powered Onboarding Flow/)

    const task = (await api('GET', '/api/db/tasks')).json.find((t: any) => t.id === 'task-2')
    assert.equal(task.externalUrl, 'https://github.com/acme/app/issues/1')

    const again = await api('POST', '/api/integrations/github/issues', { taskIds: ['task-2'] })
    assert.deepEqual(again.json.results, [{ taskId: 'task-2', url: 'https://github.com/acme/app/issues/1', skipped: true }])
    assert.equal(githubCalls.length, 1)
  }))

  test('explains GitHub errors and stops on a bad token', () => withGithub(async () => {
    githubStatus = 401
    const res = await api('POST', '/api/integrations/github/issues', { taskIds: ['task-2', 'task-3'] })
    assert.equal(res.json.results.length, 1)
    assert.match(res.json.results[0].error, /GITHUB_TOKEN/)
    assert.equal(githubCalls.length, 1)
  }))

  test('cannot export another workspace\'s tasks', () => withGithub(async () => {
    const zoe = await register({ name: 'Zoe', email: 'zoe@example.com', password: 'zoe-password' })
    const res = await api('POST', '/api/integrations/github/issues', { taskIds: ['task-2'] }, zoe.cookie)
    assert.deepEqual(res.json.results, [{ taskId: 'task-2', error: 'Task not found' }])
    assert.equal(githubCalls.length, 0)
  }))

  test('validates the request', () => withGithub(async () => {
    assert.equal((await api('POST', '/api/integrations/github/issues', { taskIds: [] })).status, 400)
    assert.equal((await api('POST', '/api/integrations/github/issues', {})).status, 400)
  }))
})

describe('production serving', () => {
  test('unknown API routes are JSON 404s', async () => {
    const res = await api('GET', '/api/nope')
    assert.equal(res.status, 404)
    assert.deepEqual(res.json, { error: 'Not found' })
  })

  test('sign-in config advertises the demo login outside production', async () => {
    const res = await api('GET', '/api/auth/config', undefined, null)
    assert.deepEqual(res.json, { demoLogin: { email: 'demo@prodly.dev', password: 'prodly-demo' } })
  })

  test('serves the built client with a fallback for app routes', async () => {
    const { writeFileSync, mkdtempSync: mkd } = await import('node:fs')
    const clientDir = mkd(path.join(tmpdir(), 'prodly-client-'))
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>Prodly</title>')
    writeFileSync(path.join(clientDir, 'app.js'), 'console.log(1)')
    const app = createApp({ streamChat: fakeStreamChat, generateJson: fakeGenerateJson, clientDir }).listen(0)
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
    try {
      assert.match(await (await fetch(`${url}/`)).text(), /<title>Prodly/)
      assert.match(await (await fetch(`${url}/tasks/anything`)).text(), /<title>Prodly/)
      assert.equal(await (await fetch(`${url}/app.js`)).text(), 'console.log(1)')
      assert.equal((await fetch(`${url}/api/nope`)).status, 404)
      assert.equal((await fetch(`${url}/api/health`)).status, 200)
    } finally {
      app.close()
      rmSync(clientDir, { recursive: true, force: true })
    }
  })
})
