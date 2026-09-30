import { useEffect, useRef, useState } from 'react'
import { Check, Copy, LogOut } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { useWorkspaceStore } from '@/lib/store'
import MemberAvatar from '@/components/tasks/MemberAvatar'

/** Signed-in user, their workspace and invite code, and sign out. */
export default function AccountMenu() {
  const { user, workspace, logout } = useAuthStore()
  const { members } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!user || !workspace) return null
  const member = members.find((m) => m.id === user.memberId)

  const copyCode = async () => {
    await navigator.clipboard.writeText(workspace.joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full min-w-0 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/5"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MemberAvatar member={member ?? { id: '', name: user.name, color: '#6366f1', createdAt: '', userId: user.id }} size={26} />
        <span className="min-w-0">
          <span className="block text-[11px] font-medium truncate" style={{ color: '#ddd' }}>{user.name}</span>
          <span className="block text-[11px] truncate" style={{ color: '#9d9da6' }}>{workspace.name}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-64 rounded-lg shadow-2xl z-40 overflow-hidden"
          style={{ background: '#18181b', border: '1px solid #27272a' }}
        >
          <div className="px-3.5 py-3 border-b" style={{ borderColor: '#27272a' }}>
            <p className="text-xs font-medium truncate" style={{ color: '#f4f4f5' }}>{user.name}</p>
            <p className="text-[11px] truncate" style={{ color: '#9d9da6' }}>{user.email}</p>
          </div>
          <div className="px-3.5 py-3 border-b" style={{ borderColor: '#27272a' }}>
            <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9d9da6' }}>Invite teammates to {workspace.name}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="flex-1 px-2 py-1 rounded text-xs font-mono tracking-wider" style={{ background: '#0f0f11', color: '#e4e4e7' }}>
                {workspace.joinCode}
              </code>
              <button
                onClick={copyCode}
                className="p-1.5 rounded transition-colors hover:bg-white/10"
                style={{ color: copied ? '#4ade80' : '#a1a1aa' }}
                aria-label="Copy invite code"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#8a8a93' }}>They choose "Join a teammate" when creating an account.</p>
          </div>
          <button
            role="menuitem"
            onClick={logout}
            className="flex items-center gap-2 w-full px-3.5 py-2.5 text-xs transition-colors hover:bg-white/5"
            style={{ color: '#f87171' }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
