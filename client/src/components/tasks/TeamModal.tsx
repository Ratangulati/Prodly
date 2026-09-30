import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import Modal from './Modal'
import MemberAvatar from './MemberAvatar'
import { MEMBER_COLORS } from './meta'

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {MEMBER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="rounded-full transition-transform hover:scale-110"
          style={{ width: 14, height: 14, background: c, outline: value === c ? '2px solid #f4f4f5' : 'none', outlineOffset: 1 }}
          aria-label={`Colour ${c}`}
        />
      ))}
    </div>
  )
}

/** Add, rename, recolour and remove the people tasks can be assigned to. */
export default function TeamModal({ onClose }: { onClose: () => void }) {
  const { members, tasks, addMember, updateMember, deleteMember } = useWorkspaceStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[members.length % MEMBER_COLORS.length])
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const add = () => {
    if (!name.trim()) return
    addMember(name, color)
    setName('')
    setColor(MEMBER_COLORS[(members.length + 1) % MEMBER_COLORS.length])
  }

  return (
    <Modal
      title="Team"
      subtitle="People you can assign tasks to. Teammates with their own login join with your invite code from the account menu."
      onClose={onClose}
      width={480}
    >
      <div className="px-5 py-3 space-y-1">
        {members.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: '#9d9da6' }}>No team members yet. Add the first one below.</p>
        )}
        {members.map((m) => {
          const open = tasks.filter((t) => t.assigneeId === m.id && t.status !== 'done').length
          return (
            <div key={m.id} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: '#1f1f23' }}>
              <MemberAvatar member={m} size={28} />
              <div className="flex-1 min-w-0">
                <input
                  defaultValue={m.name}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== m.name) updateMember(m.id, { name: next })
                    else e.target.value = m.name
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-full bg-transparent text-sm outline-none rounded px-1 -mx-1 focus:bg-white/5"
                  style={{ color: '#e4e4e7' }}
                  aria-label="Member name"
                />
                <div className="flex items-center gap-2 mt-1">
                  <ColorPicker value={m.color} onChange={(c) => updateMember(m.id, { color: c })} />
                  <span className="text-[11px]" style={{ color: '#8a8a93' }}>{open} open task{open === 1 ? '' : 's'}</span>
                </div>
              </div>
              {m.userId ? (
                <span className="px-2 py-0.5 rounded text-[11px]" style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }} title="Has their own login">
                  Account
                </span>
              ) : confirmId === m.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { deleteMember(m.id); setConfirmId(null) }}
                    className="px-2 py-1 rounded text-[11px] font-medium"
                    style={{ background: '#dc2626', color: '#fff' }}
                    title={open ? `Their ${open} open task(s) become unassigned` : undefined}
                  >
                    Remove
                  </button>
                  <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded text-[11px]" style={{ color: '#a1a1aa' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(m.id)}
                  className="p-1.5 rounded transition-colors hover:bg-red-500/10"
                  style={{ color: '#9d9da6' }}
                  aria-label={`Remove ${m.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); add() }}
        className="flex items-center gap-2 px-5 py-4 border-t"
        style={{ borderColor: '#27272a' }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a teammate…"
          className="flex-1 rounded-md px-3 py-1.5 text-xs outline-none"
          style={{ background: '#18181b', border: '1px solid #2a2a2e', color: '#e4e4e7' }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          <Plus size={12} />
          Add
        </button>
      </form>
    </Modal>
  )
}
