import type { FeaturePriority, TaskEstimate, TaskStatus } from '@/lib/types'

export const TASK_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo',        label: 'To Do',       color: '#71717a' },
  { id: 'in-progress', label: 'In Progress', color: '#6366f1' },
  { id: 'review',      label: 'Review',      color: '#f59e0b' },
  { id: 'done',        label: 'Done',        color: '#22c55e' },
]

export const PRIORITY_META: Record<FeaturePriority, { label: string; color: string; bg: string }> = {
  P0: { label: 'P0 · Blocker', color: '#fca5a5', bg: 'rgba(239,68,68,0.14)' },
  P1: { label: 'P1 · High',    color: '#fdba74', bg: 'rgba(249,115,22,0.14)' },
  P2: { label: 'P2 · Medium',  color: '#a5b4fc', bg: 'rgba(99,102,241,0.14)' },
  P3: { label: 'P3 · Low',     color: '#a1a1aa', bg: 'rgba(113,113,122,0.16)' },
}

export const PRIORITIES: FeaturePriority[] = ['P0', 'P1', 'P2', 'P3']

export const ESTIMATES: Exclude<TaskEstimate, ''>[] = ['XS', 'S', 'M', 'L', 'XL']

export const MEMBER_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6', '#14b8a6']

/** True when a due date (YYYY-MM-DD) is before today. */
export function isOverdue(dueDate: string): boolean {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${dueDate}T00:00:00`) < today
}

export function formatDue(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
