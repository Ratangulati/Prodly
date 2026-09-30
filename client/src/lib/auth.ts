import { create } from 'zustand'

export interface AuthUser {
  id: string
  name: string
  email: string
  /** This user's teammate record, used for "My tasks". */
  memberId: string | null
}

export interface AuthWorkspace {
  id: string
  name: string
  joinCode: string
}

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in'
  user: AuthUser | null
  workspace: AuthWorkspace | null
  check: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (input: { name: string; email: string; password: string; workspaceName?: string; joinCode?: string }) => Promise<void>
  logout: () => Promise<void>
  /** Called when any API request comes back 401. */
  sessionExpired: () => void
}

async function authRequest(path: string, body?: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: body === undefined && path === 'me' ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.')
  return data as { user: AuthUser; workspace: AuthWorkspace }
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  workspace: null,

  check: async () => {
    try {
      const { user, workspace } = await authRequest('me')
      set({ status: 'signed-in', user, workspace })
    } catch {
      set({ status: 'signed-out', user: null, workspace: null })
    }
  },

  login: async (email, password) => {
    const { user, workspace } = await authRequest('login', { email, password })
    set({ status: 'signed-in', user, workspace })
  },

  register: async (input) => {
    const { user, workspace } = await authRequest('register', input)
    set({ status: 'signed-in', user, workspace })
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    // A full reload clears every in-memory store from the previous session
    window.location.reload()
  },

  sessionExpired: () => set({ status: 'signed-out', user: null, workspace: null }),
}))
