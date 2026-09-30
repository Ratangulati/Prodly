import { useState, useEffect, useRef, useMemo } from 'react'
import {
  FileText, BookOpen, FlaskConical, Map, LayoutDashboard,
  MessageSquare, BarChart3, TrendingUp, Sparkles, ArrowRight, Search, ListChecks, Lightbulb,
} from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { searchWorkspace, type SearchKind } from '@/lib/search'
import { toast } from '@/lib/toast'
import type { DocumentType, AIWorkflow } from '@/lib/types'

const WORKFLOW_DEFAULT_PROMPTS: Record<AIWorkflow, string> = {
  prd:            'Draft a PRD for [describe your feature or idea here]',
  stories:        'Generate user stories from my PRD document. Include acceptance criteria for each.',
  roadmap:        'Help me sequence these features into a 3-quarter roadmap: [list your features]',
  prioritization: 'Score these features using RICE and rank them: [list your features]',
  research:       'Synthesize these user interview notes into themes and insights:\n\n[paste your notes here]',
  data:           'Analyse this funnel data and identify the biggest drop-off points:\n\n[paste data here]',
  general:        'How do I [describe your PM challenge]?',
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

type CommandMode = 'search' | 'ai' | 'nav'

const MODES: { id: CommandMode; label: string; placeholder: string }[] = [
  { id: 'search', label: 'Search',         placeholder: 'Search documents, tasks, features and research…' },
  { id: 'ai',     label: '✦ AI Workflows', placeholder: 'Ask AI or choose a workflow…' },
  { id: 'nav',    label: '+ New Document', placeholder: 'Create a new document…' },
]

const WORKFLOWS: { id: AIWorkflow; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'prd',           label: 'Write PRD',         description: 'Generate a full Product Requirements Document', icon: <FileText size={14} /> },
  { id: 'stories',       label: 'Write User Stories', description: 'Create stories with Gherkin acceptance criteria', icon: <BookOpen size={14} /> },
  { id: 'prioritization',label: 'Prioritize Features',description: 'RICE scoring and MoSCoW classification',         icon: <BarChart3 size={14} /> },
  { id: 'roadmap',       label: 'Plan Roadmap',       description: 'Now / Next / Later planning and sequencing',     icon: <Map size={14} /> },
  { id: 'research',      label: 'Analyze Research',   description: 'Synthesize themes from user interviews',         icon: <FlaskConical size={14} /> },
  { id: 'data',          label: 'Analyze Data',       description: 'Interpret metrics and generate hypotheses',      icon: <TrendingUp size={14} /> },
  { id: 'general',       label: 'General Chat',       description: 'Ask anything about product management',         icon: <MessageSquare size={14} /> },
]

const NEW_DOC_OPTIONS: { type: DocumentType; label: string; icon: React.ReactNode }[] = [
  { type: 'prd',         label: 'New PRD',           icon: <FileText size={14} />       },
  { type: 'user-story',  label: 'New User Story',    icon: <BookOpen size={14} />       },
  { type: 'research',    label: 'New Research Note', icon: <FlaskConical size={14} />   },
  { type: 'roadmap',     label: 'New Roadmap Doc',   icon: <Map size={14} />            },
  { type: 'general',     label: 'New General Note',  icon: <LayoutDashboard size={14} />},
]

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  prd: 'PRD', 'user-story': 'User Story', research: 'Research', roadmap: 'Roadmap', general: 'Note',
}

const KIND_META: Record<SearchKind, { label: string; icon: React.ReactNode }> = {
  document: { label: 'Document',        icon: <FileText size={14} /> },
  task:     { label: 'Task',            icon: <ListChecks size={14} /> },
  feature:  { label: 'Roadmap feature', icon: <Map size={14} /> },
  insight:  { label: 'Research theme',  icon: <Lightbulb size={14} /> },
}

function autoTitle(type: DocumentType, folderName: string | null): string {
  const label = DOC_TYPE_LABELS[type]
  return folderName ? `${folderName} — ${label}` : `Untitled ${label}`
}

interface Item {
  key: string
  label: string
  description?: string
  badge?: string
  icon: React.ReactNode
  run: () => void
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const {
    addDocumentFile, setActiveDoc, setActiveSidebarTab, setPendingAICommand,
    activeFolderId, fileNodes, documents, tasks, features, insights, openTask,
  } = useWorkspaceStore()
  const [query, setQuery]       = useState('')
  const [mode, setMode]         = useState<CommandMode>('search')
  const [selected, setSelected] = useState(0)
  const inputRef                = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setMode('search')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const items: Item[] = useMemo(() => {
    const q = query.toLowerCase()
    if (mode === 'search') {
      return searchWorkspace(query, { documents, tasks, features, insights }).map((r) => ({
        key: `${r.kind}:${r.id}`,
        label: r.title,
        description: r.snippet || undefined,
        badge: KIND_META[r.kind].label,
        icon: KIND_META[r.kind].icon,
        run: () => {
          if (r.kind === 'document') setActiveDoc(r.id)
          else if (r.kind === 'task') openTask(r.id)
          else setActiveSidebarTab(r.kind === 'feature' ? 'roadmap' : 'research')
          onClose()
        },
      }))
    }
    if (mode === 'ai') {
      return WORKFLOWS
        .filter((w) => !q || w.label.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
        .map((w) => ({
          key: w.id,
          label: w.label,
          description: w.description,
          icon: w.icon,
          run: () => {
            setPendingAICommand(w.id, WORKFLOW_DEFAULT_PROMPTS[w.id])
            setActiveSidebarTab('chat')
            onClose()
          },
        }))
    }
    return NEW_DOC_OPTIONS
      .filter((d) => !q || d.label.toLowerCase().includes(q))
      .map((d) => ({
        key: d.type,
        label: d.label,
        icon: d.icon,
        run: () => {
          const folderName = activeFolderId ? (fileNodes.find((n) => n.id === activeFolderId)?.name ?? null) : null
          const id = addDocumentFile(d.type, autoTitle(d.type, folderName), activeFolderId)
          setActiveDoc(id)
          toast.success(`Created ${d.label}${folderName ? ` in "${folderName}"` : ''}`)
          onClose()
        },
      }))
  }, [mode, query, documents, tasks, features, insights, activeFolderId, fileNodes, addDocumentFile, setActiveDoc, setActiveSidebarTab, setPendingAICommand, openTask, onClose])

  useEffect(() => setSelected(0), [query, mode])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); items[selected]?.run() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = MODES.findIndex((m) => m.id === mode)
      setMode(MODES[(idx + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length].id)
    }
  }

  if (!open) return null

  const emptyText = mode === 'search'
    ? query.trim().length < 2 ? 'Type at least 2 characters to search' : `Nothing matches "${query.trim()}"`
    : 'No results'

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center pt-[15vh] px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-xl shadow-2xl overflow-hidden"
        style={{ maxWidth: 600, background: '#161616', border: '1px solid #2a2a2a' }}
        role="dialog"
        aria-label="Command palette"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          {mode === 'search'
            ? <Search size={15} style={{ color: '#6366f1', flexShrink: 0 }} />
            : <Sparkles size={15} style={{ color: '#6366f1', flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={MODES.find((m) => m.id === mode)?.placeholder}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#f0f0f0' }}
            aria-label="Search or run a command"
          />
          <kbd className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#2a2a2a', color: '#8a8a93' }}>ESC</kbd>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 px-3 pt-2.5 pb-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); inputRef.current?.focus() }}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                background: mode === m.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: mode === m.id ? '#818cf8' : '#555',
              }}
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] self-center" style={{ color: '#7a7a83' }}>Tab to switch</span>
        </div>

        {/* Results */}
        <div className="pb-2 max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center" style={{ color: '#8a8a93' }}>{emptyText}</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.key}
                onClick={item.run}
                onMouseEnter={() => setSelected(i)}
                className="flex items-center gap-3 w-full px-4 py-2.5 transition-colors text-left"
                style={{ background: selected === i ? 'rgba(99,102,241,0.1)' : 'transparent' }}
              >
                <span style={{ color: selected === i ? '#818cf8' : '#555' }}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: selected === i ? '#e0e0e0' : '#aaa' }}>{item.label}</p>
                  {item.description && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: '#8a8a93' }}>{item.description}</p>
                  )}
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#222', color: '#9d9da6' }}>{item.badge}</span>
                )}
                {selected === i && <ArrowRight size={12} style={{ color: '#6366f1', flexShrink: 0 }} />}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-4 px-4 py-2 border-t" style={{ borderColor: '#2a2a2a', background: '#111' }}>
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['Tab', 'Switch'], ['Esc', 'Close']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="text-[10px] px-1 py-0.5 rounded" style={{ background: '#222', color: '#8a8a93' }}>{key}</kbd>
              <span className="text-[11px]" style={{ color: '#7a7a83' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
