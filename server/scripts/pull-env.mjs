// Pulls the database settings from the linked Vercel project into server/.env,
// pointed at a separate "dev" schema so local work never touches production data.
// Usage (from the repo root, after `vercel link`): npm run env:pull
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(serverDir)
const envFile = path.join(serverDir, '.env')
const DB_KEYS = ['POSTGRES_PRISMA_URL', 'DATABASE_URL_UNPOOLED']

const parse = (text) =>
  Object.fromEntries(
    text.split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]
      }),
  )

const tmp = mkdtempSync(path.join(tmpdir(), 'prodly-env-'))
try {
  const pulled = path.join(tmp, 'vercel.env')
  execFileSync('vercel', ['env', 'pull', pulled, '--yes', '--environment=development'], { cwd: repoRoot, stdio: 'inherit' })
  const vars = parse(readFileSync(pulled, 'utf8'))
  const missing = DB_KEYS.filter((k) => !vars[k])
  if (missing.length) throw new Error(`Missing from Vercel: ${missing.join(', ')}. Is the Neon database connected to the project?`)

  const devSchema = (url) => {
    const u = new URL(url)
    u.searchParams.set('schema', 'dev')
    return u.toString()
  }

  // Keep everything else already in server/.env (e.g. GEMINI_API_KEY)
  const kept = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').split('\n').filter((l) => !DB_KEYS.some((k) => l.startsWith(`${k}=`)) && !l.startsWith('# Neon Postgres'))
    : ['GEMINI_API_KEY=']
  const lines = [
    ...kept.filter((l, i, a) => !(l.trim() === '' && (a[i - 1] ?? '').trim() === '')),
    '# Neon Postgres. Local development uses the "dev" schema so it never touches production data.',
    ...DB_KEYS.map((k) => `${k}="${devSchema(vars[k])}"`),
  ]
  writeFileSync(envFile, lines.join('\n').replace(/^\n+/, '').trim() + '\n')
  console.log(`✓ Wrote database settings to server/.env (schema "dev")`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
