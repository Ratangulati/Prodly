
import { useState } from 'react'
import {
  Sparkles, ChevronDown, ChevronRight,
  Circle, Sun, Moon, Keyboard, ListChecks, Search, LayoutDashboard,
} from 'lucide-react'
import type { Theme, FeatureStatus } from '@/lib/types'
import { useWorkspaceStore } from '@/lib/store'
import FileExplorer from './FileExplorer'
import AccountMenu from './AccountMenu'
import MentionsInbox from '@/components/comments/MentionsInbox'

const STATUS_COLORS: Record<FeatureStatus, string> = {
  Now:  '#22c55e',
  Next: '#6366f1',
  Later:'#f59e0b',
  Done: '#6b7280',
}

interface LeftSidebarProps {
  onToggleTheme: () => void
  onOpenSearch: () => void
  theme: Theme
}

export default function LeftSidebar({ onToggleTheme, onOpenSearch, theme }: LeftSidebarProps) {
  const { features, tasks, mainView, openTasks, setMainView } = useWorkspaceStore()
  const openTaskCount = tasks.filter((t) => t.status !== 'done').length
  const [featuresOpen, setFeaturesOpen] = useState(true)

  const counts = features.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] || 0) + 1
    return acc
  }, {})

  return (
    <aside
      className="flex flex-col h-full w-full border-r"
      style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-4 py-4 border-b flex-shrink-0"
        style={{ borderColor: '#2a2a2a' }}
      >
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 28, height: 28, background: '#6366f1' }}
        >
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight" style={{ color: '#f0f0f0' }}>
          Prodly
        </span>
      </div>

      {/* Search + Tasks board */}
      <div className="px-2 pt-2 flex-shrink-0 space-y-0.5">
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs transition-colors hover:bg-white/5"
          style={{ color: '#a1a1aa' }}
        >
          <Search size={14} style={{ color: '#9d9da6' }} />
          Search
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#262626', color: '#9d9da6' }}>⌘K</kbd>
        </button>
        <button
          onClick={() => setMainView('home')}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            background: mainView === 'home' ? 'rgba(99,102,241,0.14)' : 'transparent',
            color: mainView === 'home' ? '#c7d2fe' : '#a1a1aa',
          }}
        >
          <LayoutDashboard size={14} style={{ color: mainView === 'home' ? '#818cf8' : '#71717a' }} />
          Home
        </button>
        <button
          onClick={() => openTasks()}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            background: mainView === 'tasks' ? 'rgba(99,102,241,0.14)' : 'transparent',
            color: mainView === 'tasks' ? '#c7d2fe' : '#a1a1aa',
          }}
        >
          <ListChecks size={14} style={{ color: mainView === 'tasks' ? '#818cf8' : '#71717a' }} />
          Tasks
          {openTaskCount > 0 && (
            <span className="ml-auto px-1.5 rounded text-[11px] font-semibold tabular-nums" style={{ background: '#27272a', color: '#a1a1aa' }}>
              {openTaskCount}
            </span>
          )}
        </button>
      </div>

      {/* File Explorer */}
      <FileExplorer />

      {/* Features */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: '#2a2a2a' }}>
        <button
          onClick={() => setFeaturesOpen(v => !v)}
          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium transition-colors hover:bg-white/5"
          style={{ color: '#888' }}
        >
          {featuresOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span className="text-[11px] uppercase tracking-wider">Features</span>
        </button>

        {featuresOpen && (
          <div className="grid grid-cols-2 gap-1 px-2 pb-2.5">
            {(['Now', 'Next', 'Later', 'Done'] as FeatureStatus[]).map(s => (
              <div
                key={s}
                className="flex items-center justify-between px-2 py-1.5 rounded-md"
                style={{ background: '#222' }}
              >
                <div className="flex items-center gap-1.5">
                  <Circle size={5} fill={STATUS_COLORS[s]} stroke="none" />
                  <span className="text-[11px]" style={{ color: '#888' }}>{s}</span>
                </div>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: STATUS_COLORS[s] }}>
                  {counts[s] || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: '#2a2a2a' }}
      >
        <AccountMenu />
        <MentionsInbox />
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded transition-colors hover:bg-white/10 flex-shrink-0"
          style={{ color: '#8a8a93' }}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <span className="flex-shrink-0" style={{ color: '#8a8a93' }} title="Press ? for shortcuts">
          <Keyboard size={13} />
        </span>
      </div>
    </aside>
  )
}
