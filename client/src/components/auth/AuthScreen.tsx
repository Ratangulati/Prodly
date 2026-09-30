import { useEffect, useState, type FormEvent } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'

type Mode = 'sign-in' | 'sign-up'
type WorkspaceChoice = 'new' | 'join'

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500'
const inputStyle = { background: '#18181b', border: '1px solid #2a2a2e', color: '#f4f4f5' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: '#a1a1aa' }}>{label}</span>
      {children}
    </label>
  )
}

/** Sign in, or create an account that starts or joins a workspace. */
export default function AuthScreen() {
  const { login, register } = useAuthStore()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [choice, setChoice] = useState<WorkspaceChoice>('new')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(null)

  // The server says whether a demo account is available to advertise
  useEffect(() => {
    fetch('/api/auth/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => setDemo(config?.demoLogin ?? null))
      .catch(() => {})
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await login(email, password)
      } else {
        await register({
          name, email, password,
          ...(choice === 'new' ? { workspaceName } : { joinCode }),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#0f0f0f' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <div className="flex items-center justify-center rounded-xl mb-3" style={{ width: 44, height: 44, background: '#6366f1' }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: '#f4f4f5' }}>Prodly</h1>
          <p className="text-sm mt-1" style={{ color: '#9d9da6' }}>AI-powered workspace for product managers</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: '#141416', border: '1px solid #27272a' }}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg mb-5" style={{ background: '#0f0f11' }}>
            {(['sign-in', 'sign-up'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{ background: mode === m ? '#27272a' : 'transparent', color: mode === m ? '#f4f4f5' : '#71717a' }}
              >
                {m === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'sign-up' && (
              <Field label="Your name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} autoComplete="name" required autoFocus />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                style={inputStyle}
                autoComplete="email"
                required
                autoFocus={mode === 'sign-in'}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                style={inputStyle}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={mode === 'sign-up' ? 8 : undefined}
                required
              />
              {mode === 'sign-up' && <span className="block text-[11px] mt-1" style={{ color: '#8a8a93' }}>At least 8 characters</span>}
            </Field>

            {mode === 'sign-up' && (
              <div className="pt-1">
                <div className="flex gap-4 mb-2.5">
                  {(['new', 'join'] as WorkspaceChoice[]).map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: choice === c ? '#e4e4e7' : '#71717a' }}>
                      <input type="radio" name="workspace" checked={choice === c} onChange={() => setChoice(c)} className="accent-indigo-500" />
                      {c === 'new' ? 'Start a new workspace' : 'Join a teammate'}
                    </label>
                  ))}
                </div>
                {choice === 'new' ? (
                  <Field label="Workspace name">
                    <input
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder={name ? `${name}'s workspace` : 'Acme Product Team'}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Field>
                ) : (
                  <Field label="Invite code">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABCD-EFGH"
                      className={`${inputClass} font-mono tracking-wider`}
                      style={inputStyle}
                      required
                    />
                    <span className="block text-[11px] mt-1" style={{ color: '#8a8a93' }}>Ask a teammate for the code in their account menu</span>
                  </Field>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ background: '#6366f1', color: '#fff' }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        {mode === 'sign-in' && demo && (
          <p className="text-center text-xs mt-4" style={{ color: '#8a8a93' }}>
            Trying it out? Sign in with <span style={{ color: '#a1a1aa' }}>{demo.email}</span> / <span style={{ color: '#a1a1aa' }}>{demo.password}</span>
          </p>
        )}
      </div>
    </div>
  )
}
