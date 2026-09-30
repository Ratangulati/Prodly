import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Member } from '@/lib/types'
import MemberAvatar from '@/components/tasks/MemberAvatar'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  members: Member[]
  onSubmit: () => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
}

/** Finds the "@partial" word right before the cursor, if the user is typing a mention. */
function activeMention(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(^|\s)@([\w .'-]{0,30})$/)
  if (!match) return null
  const query = match[2]
  // Stop suggesting once the user has clearly moved on from the name
  if (query.includes('  ')) return null
  return { start: cursor - query.length - 1, query }
}

/**
 * Textarea with @mention autocomplete for teammates.
 * Enter sends, Shift+Enter adds a new line.
 */
export default function MentionInput({ value, onChange, members, onSubmit, placeholder, autoFocus, disabled }: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [highlight, setHighlight] = useState(0)

  const suggestions = useMemo(() => {
    if (!mention) return []
    const q = mention.query.trim().toLowerCase()
    return members.filter((m) => m.name.toLowerCase().startsWith(q) || m.name.toLowerCase().includes(` ${q}`)).slice(0, 6)
  }, [mention, members])

  const refreshMention = (text: string, cursor: number) => {
    setMention(activeMention(text, cursor))
    setHighlight(0)
  }

  const pick = (member: Member) => {
    if (!mention || !ref.current) return
    const cursor = ref.current.selectionStart
    const next = `${value.slice(0, mention.start)}@${member.name} ${value.slice(cursor)}`
    onChange(next)
    setMention(null)
    const pos = mention.start + member.name.length + 2
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[highlight]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); refreshMention(e.target.value, e.target.selectionStart) }}
        onKeyDown={onKeyDown}
        onClick={(e) => refreshMention(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={2}
        className="w-full rounded-lg px-3 py-2 text-xs leading-relaxed outline-none resize-none disabled:opacity-50"
        style={{ background: '#18181b', border: '1px solid #2a2a2e', color: '#e4e4e7' }}
      />
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 bottom-full mb-1 w-56 rounded-lg py-1 shadow-2xl z-50"
          style={{ background: '#1c1c20', border: '1px solid #2e2e33' }}
        >
          {suggestions.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left"
                style={{ background: i === highlight ? 'rgba(99,102,241,0.18)' : 'transparent', color: '#e4e4e7' }}
              >
                <MemberAvatar member={m} size={18} />
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Member ids whose "@Name" still appears in the text. */
export function mentionedIds(text: string, members: Member[]): string[] {
  return members.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id)
}
