import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, ExternalLink, FileText, MessageSquare } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import type { Task } from '@/lib/types'
import MemberAvatar from './MemberAvatar'
import { PRIORITY_META, formatDue, isOverdue } from './meta'

interface TaskCardProps {
  task: Task
  onOpen?: (id: string) => void
  isOverlay?: boolean
}

export default function TaskCard({ task, onOpen, isOverlay }: TaskCardProps) {
  const { members, documents, updateTask, commentCounts } = useWorkspaceStore()
  const comments = commentCounts[`task:${task.id}`] ?? 0
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(task.title)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isOverlay || renaming,
  })

  const assignee = members.find((m) => m.id === task.assigneeId)
  const sourceDoc = documents.find((d) => d.id === task.sourceDocId)
  const priority = PRIORITY_META[task.priority] ?? PRIORITY_META.P2
  const overdue = task.status !== 'done' && isOverdue(task.dueDate)

  const commitRename = () => {
    const next = title.trim()
    if (next && next !== task.title) updateTask(task.id, { title: next })
    else setTitle(task.title)
    setRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => { if (!renaming) onOpen?.(task.id) }}
      className="group rounded-lg p-3 cursor-grab active:cursor-grabbing select-none transition-colors"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        background: isOverlay ? '#232327' : '#1b1b1e',
        border: `1px solid ${isOverlay ? '#6366f1' : '#2a2a2e'}`,
        boxShadow: isOverlay ? '0 12px 32px rgba(0,0,0,0.5)' : undefined,
      }}
    >
      {/* Title — double-click to rename in place */}
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setTitle(task.title); setRenaming(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent text-[13px] font-medium outline-none border-b pb-0.5"
          style={{ color: '#f4f4f5', borderColor: '#6366f1' }}
        />
      ) : (
        <p
          className="text-[13px] font-medium leading-snug"
          style={{ color: task.status === 'done' ? '#71717a' : '#e4e4e7', textDecoration: task.status === 'done' ? 'line-through' : undefined }}
          onDoubleClick={(e) => { e.stopPropagation(); setTitle(task.title); setRenaming(true) }}
          title="Double-click to rename"
        >
          {task.title}
        </p>
      )}

      {task.description && (
        <p className="text-[11px] mt-1 leading-relaxed line-clamp-2" style={{ color: '#9d9da6' }}>
          {task.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
          style={{ background: priority.bg, color: priority.color }}
          title={priority.label}
        >
          {task.priority}
        </span>
        {task.estimate && (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: '#27272a', color: '#a1a1aa' }} title="Estimate">
            {task.estimate}
          </span>
        )}
        {task.dueDate && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
            style={{ background: overdue ? 'rgba(239,68,68,0.14)' : '#27272a', color: overdue ? '#fca5a5' : '#a1a1aa' }}
            title={overdue ? 'Overdue' : 'Due date'}
          >
            <CalendarDays size={10} />
            {formatDue(task.dueDate)}
          </span>
        )}
        {task.externalUrl && (
          <span className="flex items-center" style={{ color: '#9d9da6' }} title="Exported to GitHub">
            <ExternalLink size={10} />
          </span>
        )}
        {comments > 0 && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#9d9da6' }} title={`${comments} comment${comments === 1 ? '' : 's'}`}>
            <MessageSquare size={10} />
            {comments}
          </span>
        )}
        <span className="ml-auto">
          <MemberAvatar member={assignee} size={20} />
        </span>
      </div>

      {sourceDoc && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t text-[11px] truncate" style={{ borderColor: '#27272a', color: '#8a8a93' }}>
          <FileText size={10} className="flex-shrink-0" />
          <span className="truncate">{sourceDoc.title}</span>
        </div>
      )}
    </div>
  )
}
