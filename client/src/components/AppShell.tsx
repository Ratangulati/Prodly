
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Menu, Sparkles } from 'lucide-react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useWorkspaceStore } from '@/lib/store'
import LeftSidebar from './sidebar/LeftSidebar'
import EditorPanel from './editor/EditorPanel'
import RightPanel from './sidebar/RightPanel'
import ToastContainer from './ui/Toast'
import AppSkeleton from './ui/AppSkeleton'
import CommandPalette from './modals/CommandPalette'
import KeyboardShortcuts from './modals/KeyboardShortcuts'
import WelcomeScreen from './onboarding/WelcomeScreen'
import TasksBoard from './tasks/TasksBoard'
import Dashboard from './dashboard/Dashboard'
import GenerateTasksModal from './tasks/GenerateTasksModal'

export default function AppShell() {
  const {
    documents, theme, setTheme,
    addDocument, setActiveDoc, setActiveSidebarTab,
    activeSidebarTab, loadWorkspace, isLoading,
    mainView, taskReviewDocId, activeDocId,
  } = useWorkspaceStore()

  // Below 1024px the three panels don't fit side by side; show one at a time with a tab bar
  const compact = useMediaQuery('(max-width: 1023px)')
  const [mobilePane, setMobilePane] = useState<'menu' | 'main' | 'ai'>('main')

  // Opening a document, the board or home shows the main pane; switching AI tools shows the AI pane.
  // Compared with the previous values so it only reacts to real changes.
  const prev = useRef({ mainView, activeDocId, activeSidebarTab })
  useEffect(() => {
    const p = prev.current
    if (p.activeSidebarTab !== activeSidebarTab) setMobilePane('ai')
    else if (p.mainView !== mainView || p.activeDocId !== activeDocId) setMobilePane('main')
    prev.current = { mainView, activeDocId, activeSidebarTab }
  }, [mainView, activeDocId, activeSidebarTab])

  useEffect(() => { loadWorkspace() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false)

  /* ── Apply theme class to <html> ─────────────────────────────── */
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
      html.classList.remove('light')
    } else {
      html.classList.remove('dark')
      html.classList.add('light')
    }
  }, [theme])

  /* ── Global keyboard shortcuts ───────────────────────────────── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName

      // CMD+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(true)
        return
      }
      // CMD+N → new general note
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        const id = addDocument({ title: 'Untitled Note', content: '', type: 'general', tags: [] })
        setActiveDoc(id)
        return
      }
      // CMD+/ → cycle AI sidebar tabs
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        const tabs = ['chat', 'roadmap', 'prioritize', 'research', 'data']
        const idx  = tabs.indexOf(activeSidebarTab)
        setActiveSidebarTab(tabs[(idx + 1) % tabs.length])
        return
      }
      // ? → keyboard shortcuts (not when in input/textarea/contenteditable)
      if (
        e.key === '?' &&
        tag !== 'INPUT' && tag !== 'TEXTAREA' &&
        !(e.target as HTMLElement).isContentEditable &&
        !e.metaKey && !e.ctrlKey
      ) {
        setShortcutsOpen(true)
        return
      }
      // Esc → close modals
      if (e.key === 'Escape') {
        setCmdPaletteOpen(false)
        setShortcutsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSidebarTab, addDocument, setActiveDoc, setActiveSidebarTab])

  const noDocuments = documents.length === 0

  if (isLoading) return <AppSkeleton />

  const leftSidebar = (
    <LeftSidebar
      onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      onOpenSearch={() => setCmdPaletteOpen(true)}
      theme={theme}
    />
  )
  const mainContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {mainView === 'tasks' ? <TasksBoard /> : mainView === 'home' ? <Dashboard /> : noDocuments ? <WelcomeScreen /> : <EditorPanel />}
    </div>
  )

  const overlays = (
    <>
      <CommandPalette    open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
      <KeyboardShortcuts open={shortcutsOpen}  onClose={() => setShortcutsOpen(false)} />
      {taskReviewDocId && <GenerateTasksModal key={taskReviewDocId} docId={taskReviewDocId} />}
      <ToastContainer />
    </>
  )

  if (compact) {
    const tabs = [
      { id: 'menu' as const, label: 'Menu', icon: <Menu size={18} /> },
      { id: 'main' as const, label: 'Workspace', icon: <LayoutDashboard size={18} /> },
      { id: 'ai' as const, label: 'AI & tools', icon: <Sparkles size={18} /> },
    ]
    return (
      <>
        <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: '#0f0f0f' }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobilePane === 'menu' ? leftSidebar : mobilePane === 'ai' ? <RightPanel /> : mainContent}
          </div>
          <nav className="flex border-t flex-shrink-0" style={{ background: '#161616', borderColor: '#2a2a2a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setMobilePane(t.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
                style={{ color: mobilePane === t.id ? '#a5b4fc' : '#71717a' }}
                aria-current={mobilePane === t.id ? 'page' : undefined}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        {overlays}
      </>
    )
  }

  return (
    <>
      <div className="h-screen overflow-hidden" style={{ background: '#0f0f0f' }}>
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left sidebar */}
          <Panel defaultSize={18} minSize={12} maxSize={30}>
            {leftSidebar}
          </Panel>

          <PanelResizeHandle className="group w-1 relative flex items-center justify-center" style={{ background: '#2a2a2a' }}>
            <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-indigo-500/30 group-data-[resize-handle-active]:bg-indigo-500/50 transition-colors" />
          </PanelResizeHandle>

          {/* Center editor */}
          <Panel minSize={30}>
            {mainContent}
          </Panel>

          <PanelResizeHandle className="group w-1 relative flex items-center justify-center" style={{ background: '#2a2a2a' }}>
            <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-indigo-500/30 group-data-[resize-handle-active]:bg-indigo-500/50 transition-colors" />
          </PanelResizeHandle>

          {/* Right panel */}
          <Panel defaultSize={28} minSize={20} maxSize={45}>
            <RightPanel />
          </Panel>
        </PanelGroup>
      </div>

      {overlays}
    </>
  )
}
