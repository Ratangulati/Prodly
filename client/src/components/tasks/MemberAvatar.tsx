import type { Member } from '@/lib/types'

export default function MemberAvatar({ member, size = 22 }: { member?: Member | null; size?: number }) {
  if (!member) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: size, height: size, border: '1px dashed #3f3f46', color: '#8a8a93', fontSize: size * 0.45 }}
        title="Unassigned"
      >
        ?
      </span>
    )
  }
  const initials = member.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 font-semibold"
      style={{ width: size, height: size, background: member.color, color: '#fff', fontSize: size * 0.42 }}
      title={member.name}
    >
      {initials}
    </span>
  )
}
