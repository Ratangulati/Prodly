import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '@google/genai'
import { fallbackModels, runWithFallback } from '../src/lib/ai.js'

const apiError = (status: number) => new ApiError({ message: `status ${status}`, status })
const quiet = { retryDelaysMs: [0], log: () => {} }

describe('model fallback', () => {
  test('uses the first model when it works', async () => {
    const calls: string[] = []
    const result = await runWithFallback(['a', 'b'], async (m) => { calls.push(m); return `from ${m}` }, quiet)
    assert.equal(result, 'from a')
    assert.deepEqual(calls, ['a'])
  })

  test('retries a busy model, then moves to the next one', async () => {
    const calls: string[] = []
    const result = await runWithFallback(['a', 'b'], async (m) => {
      calls.push(m)
      if (m === 'a') throw apiError(503)
      return `from ${m}`
    }, quiet)
    assert.equal(result, 'from b')
    assert.deepEqual(calls, ['a', 'a', 'b'])
  })

  test('skips a model that is not available to the key without retrying it', async () => {
    const calls: string[] = []
    await runWithFallback(['a', 'b'], async (m) => {
      calls.push(m)
      if (m === 'a') throw apiError(404)
      return 'ok'
    }, quiet)
    assert.deepEqual(calls, ['a', 'b'])
  })

  test('moves on without retrying when a model times out or drops the connection', async () => {
    const calls: string[] = []
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const result = await runWithFallback(['a', 'b', 'c'], async (m) => {
      calls.push(m)
      if (m === 'a') throw timeout
      if (m === 'b') throw new TypeError('fetch failed')
      return `from ${m}`
    }, quiet)
    assert.equal(result, 'from c')
    assert.deepEqual(calls, ['a', 'b', 'c'])
  })

  test('stops immediately on errors a different model would not fix', async () => {
    const calls: string[] = []
    await assert.rejects(
      runWithFallback(['a', 'b'], async (m) => { calls.push(m); throw apiError(400) }, quiet),
      (err: unknown) => err instanceof ApiError && err.status === 400,
    )
    assert.deepEqual(calls, ['a'])
  })

  test('throws the last error when every model fails', async () => {
    await assert.rejects(
      runWithFallback(['a', 'b'], async (m) => { throw apiError(m === 'a' ? 503 : 429) }, quiet),
      (err: unknown) => err instanceof ApiError && err.status === 429,
    )
  })

  test('fallback list comes from the environment, and can be turned off', () => {
    const saved = process.env.GEMINI_FALLBACK_MODELS
    try {
      delete process.env.GEMINI_FALLBACK_MODELS
      assert.ok(fallbackModels().length > 0)
      process.env.GEMINI_FALLBACK_MODELS = ' x , y ,'
      assert.deepEqual(fallbackModels(), ['x', 'y'])
      process.env.GEMINI_FALLBACK_MODELS = ''
      assert.deepEqual(fallbackModels(), [])
    } finally {
      if (saved === undefined) delete process.env.GEMINI_FALLBACK_MODELS
      else process.env.GEMINI_FALLBACK_MODELS = saved
    }
  })
})
