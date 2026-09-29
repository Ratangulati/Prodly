import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { ChatTurn, StreamChat } from '../src/lib/ai.js'

// ── Isolated test database ───────────────────────────────────────────
const dir = mkdtempSync(path.join(tmpdir(), 'prodly-test-'))
const env = { ...process.env, DATABASE_URL: `file:${path.join(dir, 'test.db')}` }
process.env.DATABASE_URL = env.DATABASE_URL

const run = (cmd: string) => execSync(cmd, { env, stdio: 'pipe' })
run('npx prisma migrate deploy')

// Imported after DATABASE_URL is set so Prisma connects to the test database
const { createApp } = await import('../src/app.js')
const { prisma } = await import('../src/lib/prisma.js')

// ── Fake AI provider ─────────────────────────────────────────────────
let aiCalls: { systemPrompt: string; history: ChatTurn[]; userMessage: string }[] = []
let aiReply: string[] | Error = []
const fakeStreamChat: StreamChat = async (systemPrompt, history, userMessage) => {
  aiCalls.push({ systemPrompt, history, userMessage })
  if (aiReply instanceof Error) throw aiReply
  const chunks = aiReply
  return (async function* () { yield* chunks })()
}

let server: Server
let base: string

before(async () => {
  server = createApp({ streamChat: fakeStreamChat }).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  server.close()
  await prisma.$disconnect()
  rmSync(dir, { recursive: true, force: true })
})

// Every test starts from the freshly seeded demo workspace
beforeEach(async () => {
  await prisma.$transaction([
    prisma.document.deleteMany(),
    prisma.feature.deleteMany(),
    prisma.researchInsight.deleteMany(),
    prisma.fileNode.deleteMany(),
    prisma.aIMessage.deleteMany(),
  ])
  run('npx tsx prisma/seed.ts')
  aiCalls = []
  aiReply = []
})

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, text, json, headers: res.headers }
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

  test('unknown field returns 400', async () => {
    assert.equal((await api('PATCH', '/api/db/features/feat-1', { bogus: 1 })).status, 400)
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

  for (const workflow of ['prd', 'stories', 'roadmap', 'prioritization', 'research', 'data', 'general']) {
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

  test('provider failure returns 502', async () => {
    aiReply = new Error('model overloaded')
    const res = await api('POST', '/api/ai', { userMessage: 'hi' })
    assert.equal(res.status, 502)
    assert.equal(res.text, 'model overloaded')
  })
})
