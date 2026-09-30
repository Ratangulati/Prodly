import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { useAuthStore } from './auth'
import type {
  Workspace,
  Document,
  Feature,
  AIMessage,
  ResearchInsight,
  FileNode,
  FileNodeType,
  Task,
  TaskStatus,
  Sprint,
  Theme,
  Member,
  MainView,
  DocumentType,
  SaveStatus,
  AIWorkflow,
} from './types'

// ── DB sync helpers (fire-and-forget) ────────────────────────────────
// A 401 means the session ended (e.g. signed out in another tab); send the user back to sign in
function checkSession(res: Response) {
  if (res.status === 401) useAuthStore.getState().sessionExpired()
}
function dbPost(path: string, body: unknown) {
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(checkSession)
    .catch(console.error)
}
function dbPatch(path: string, body: unknown) {
  fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(checkSession)
    .catch(console.error)
}
function dbDelete(path: string, body?: unknown) {
  fetch(path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(checkSession)
    .catch(console.error)
}

// The theme is a per-browser preference; if storage is unavailable we fall back to dark
const THEME_KEY = 'prodly:theme'
function savedTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}
function saveTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* storage unavailable */ }
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

function nextOrder(tasks: Task[], status: TaskStatus): number {
  const orders = tasks.filter((t) => t.status === status).map((t) => t.order)
  return orders.length ? Math.max(...orders) + 1 : 0
}

function calcRice(reach: number, impact: number, confidence: number, effort: number): number {
  if (effort === 0) return 0
  return Math.round((reach * impact * (confidence / 100)) / effort)
}

interface WorkspaceActions {
  loadWorkspace: () => Promise<void>

  // Document actions
  addDocument: (doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateDocument: (id: string, updates: Partial<Document>) => void
  deleteDocument: (id: string) => void
  setActiveDoc: (id: string | null) => void

  // Feature actions
  addFeature: (feature: Omit<Feature, 'id' | 'riceScore'>) => string
  updateFeature: (id: string, updates: Partial<Omit<Feature, 'id'>>) => void
  deleteFeature: (id: string) => void

  // AI message actions
  addMessage: (msg: Omit<AIMessage, 'id' | 'timestamp'>) => string
  clearMessages: (workflow?: AIWorkflow) => void

  // Insight actions
  addInsight: (insight: Omit<ResearchInsight, 'id'>) => string
  updateInsight: (id: string, updates: Partial<ResearchInsight>) => void
  deleteInsight: (id: string) => void

  // File tree actions
  addFolder: (name: string, parentId: string | null) => string
  addDocumentFile: (type: DocumentType, title: string, parentId: string | null) => string
  renameFileNode: (id: string, name: string) => void
  deleteFileNode: (id: string) => void

  // Task actions
  addTask: (task: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string }) => string
  addTasks: (tasks: (Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string })[]) => void
  updateTask: (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
  moveTask: (id: string, status: TaskStatus, beforeTaskId: string | null) => void
  deleteTask: (id: string) => void

  // Sprint actions (these call the API directly and apply the server's result)
  startSprint: (input: { name: string; goal: string; startDate: string; endDate: string; assignments: { taskId: string; assigneeId: string | null }[] }) => Promise<Sprint>
  completeSprint: (id: string) => Promise<number>
  setTaskSprint: (taskId: string, sprintId: string | null) => void
  /** Returns how many issues were created and the first error, if any. */
  exportToGithub: (taskIds: string[]) => Promise<{ created: number; skipped: number; error: string | null }>

  // Team actions
  addMember: (name: string, color: string) => string
  updateMember: (id: string, updates: Partial<Pick<Member, 'name' | 'color'>>) => void
  deleteMember: (id: string) => void

  // Navigation
  setMainView: (view: MainView) => void
  openTasks: (docFilter?: string | null) => void
  setTaskDocFilter: (docId: string | null) => void
  openTaskReview: (docId: string) => void
  closeTaskReview: () => void
  openTask: (taskId: string) => void
  clearFocusTask: () => void

  // Comments
  adjustCommentCount: (key: string, delta: number) => void

  // UI actions
  setActiveSidebarTab: (tab: string) => void
  setActiveFolderId: (id: string | null) => void
  setTheme: (t: 'dark' | 'light') => void
  setSaveStatus: (s: SaveStatus) => void
  setPendingAICommand: (workflow: AIWorkflow, prompt: string) => void
  clearPendingAICommand: () => void
  applyAIContent: (id: string, html: string) => void
  replaceDocumentContent: (id: string, content: string) => void
}

export const useWorkspaceStore = create<Workspace & WorkspaceActions>()((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────
  documents:        [],
  features:         [],
  messages:         [],
  insights:         [],
  fileNodes:        [],
  tasks:            [],
  members:          [],
  sprints:          [],
  integrations:     { github: null },
  mainView:         'home',
  taskDocFilter:    null,
  taskReviewDocId:  null,
  focusTaskId:      null,
  commentCounts:    {},
  activeDocId:      null,
  activeFolderId:   null,
  activeSidebarTab: 'chat',
  theme:            savedTheme(),
  saveStatus:       'idle',
  pendingAICommand: null,
  aiContentVersion: 0,
  isLoading:        false,

  // ── Load everything from DB on mount ──────────────────────────────
  loadWorkspace: async () => {
    set({ isLoading: true })
    try {
      const [docsRes, featuresRes, messagesRes, insightsRes, fileNodesRes, tasksRes, membersRes, countsRes, sprintsRes] = await Promise.all([
        fetch('/api/db/documents'),
        fetch('/api/db/features'),
        fetch('/api/db/messages'),
        fetch('/api/db/insights'),
        fetch('/api/db/filenodes'),
        fetch('/api/db/tasks'),
        fetch('/api/db/members'),
        fetch('/api/db/comments/counts'),
        fetch('/api/db/sprints'),
      ])
      // Optional; the app works without any integrations
      const integrations = await fetch('/api/integrations').then((r) => (r.ok ? r.json() : { github: null })).catch(() => ({ github: null }))
      if (docsRes.status === 401) {
        useAuthStore.getState().sessionExpired()
        return
      }
      const [documents, features, messages, insights, fileNodes, tasks, members, counts, sprints] = await Promise.all([
        docsRes.json(),
        featuresRes.json(),
        messagesRes.json(),
        insightsRes.json(),
        fileNodesRes.ok ? fileNodesRes.json() : Promise.resolve([]),
        tasksRes.ok ? tasksRes.json() : Promise.resolve([]),
        membersRes.ok ? membersRes.json() : Promise.resolve([]),
        countsRes.ok ? countsRes.json() : Promise.resolve([]),
        sprintsRes.ok ? sprintsRes.json() : Promise.resolve([]),
      ])
      const commentCounts: Record<string, number> = {}
      for (const c of counts as { targetType: string; targetId: string; count: number }[]) {
        commentCounts[`${c.targetType}:${c.targetId}`] = c.count
      }
      set({
        documents,
        features,
        messages,
        insights,
        fileNodes,
        tasks,
        members,
        commentCounts,
        sprints,
        integrations,
        activeDocId: documents[0]?.id ?? null,
        isLoading: false,
      })
    } catch (err) {
      console.error('Failed to load workspace:', err)
      set({ isLoading: false })
    }
  },

  // ── Document actions ───────────────────────────────────────────────
  addDocument: (doc) => {
    const id      = uuidv4()
    const ts      = new Date().toISOString()
    const newDoc: Document  = { ...doc, id, createdAt: ts, updatedAt: ts }
    const newNode: FileNode = { id, name: doc.title, type: doc.type, parentId: null, children: [], createdAt: ts }
    set((state) => ({
      documents: [...state.documents, newDoc],
      fileNodes: [...state.fileNodes, newNode],
    }))
    dbPost('/api/db/documents', newDoc)
    dbPost('/api/db/filenodes', newNode)
    return id
  },

  updateDocument: (id, updates) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
      ),
    }))
    dbPatch(`/api/db/documents/${id}`, updates)
  },

  deleteDocument: (id) => {
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
      activeDocId: state.activeDocId === id ? (state.documents.find(d => d.id !== id)?.id ?? null) : state.activeDocId,
    }))
    dbDelete(`/api/db/documents/${id}`)
  },

  // Opening a document always switches the main area back to the editor
  setActiveDoc: (id) => set({ activeDocId: id, mainView: 'editor' }),

  // ── Feature actions ────────────────────────────────────────────────
  addFeature: (feature) => {
    const id        = uuidv4()
    const riceScore = calcRice(feature.reach, feature.impact, feature.confidence, feature.effort)
    const newFeature: Feature = { ...feature, id, riceScore }
    set((state) => ({ features: [...state.features, newFeature] }))
    dbPost('/api/db/features', newFeature)
    return id
  },

  updateFeature: (id, updates) => {
    let updated!: Feature
    set((state) => ({
      features: state.features.map((f) => {
        if (f.id !== id) return f
        updated = { ...f, ...updates }
        updated.riceScore = calcRice(updated.reach, updated.impact, updated.confidence, updated.effort)
        return updated
      }),
    }))
    dbPatch(`/api/db/features/${id}`, { ...updates, riceScore: updated?.riceScore })
  },

  deleteFeature: (id) => {
    set((state) => ({ features: state.features.filter((f) => f.id !== id) }))
    dbDelete(`/api/db/features/${id}`)
  },

  // ── AI message actions ─────────────────────────────────────────────
  addMessage: (msg) => {
    const id        = uuidv4()
    const timestamp = new Date().toISOString()
    const newMsg: AIMessage = { ...msg, id, timestamp }
    set((state) => ({ messages: [...state.messages, newMsg] }))
    dbPost('/api/db/messages', newMsg)
    return id
  },

  clearMessages: (workflow) => {
    set((state) => ({
      messages: workflow
        ? state.messages.filter((m) => m.workflow !== workflow)
        : [],
    }))
    dbDelete('/api/db/messages', workflow ? { workflow } : undefined)
  },

  // ── Insight actions ────────────────────────────────────────────────
  addInsight: (insight) => {
    const id = uuidv4()
    const newInsight: ResearchInsight = { ...insight, id }
    set((state) => ({ insights: [...state.insights, newInsight] }))
    dbPost('/api/db/insights', newInsight)
    return id
  },

  updateInsight: (id, updates) => {
    set((state) => ({
      insights: state.insights.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }))
    dbPatch(`/api/db/insights/${id}`, updates)
  },

  deleteInsight: (id) => {
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }))
    dbDelete(`/api/db/insights/${id}`)
  },

  // ── File tree actions ──────────────────────────────────────────────
  addFolder: (name, parentId) => {
    const id  = uuidv4()
    const ts  = new Date().toISOString()
    const newNode: FileNode = { id, name, type: 'folder', parentId, children: [], createdAt: ts }
    const parentChildren = parentId
      ? [...(get().fileNodes.find(n => n.id === parentId)?.children ?? []), id]
      : null
    set((state) => ({
      fileNodes: [
        ...state.fileNodes.map(n =>
          n.id === parentId ? { ...n, children: [...n.children, id] } : n
        ),
        newNode,
      ],
    }))
    dbPost('/api/db/filenodes', newNode)
    if (parentId && parentChildren) dbPatch(`/api/db/filenodes/${parentId}`, { children: parentChildren })
    return id
  },

  addDocumentFile: (type, title, parentId) => {
    const id  = uuidv4()
    const ts  = new Date().toISOString()
    const newDoc: Document  = { id, title, content: '', type, tags: [], createdAt: ts, updatedAt: ts }
    const newNode: FileNode = { id, name: title, type, parentId, children: [], createdAt: ts }
    const parentChildren = parentId
      ? [...(get().fileNodes.find(n => n.id === parentId)?.children ?? []), id]
      : null
    set((state) => ({
      documents: [...state.documents, newDoc],
      fileNodes: [
        ...state.fileNodes.map(n =>
          n.id === parentId ? { ...n, children: [...n.children, id] } : n
        ),
        newNode,
      ],
      activeDocId: id,
    }))
    dbPost('/api/db/documents', newDoc)
    dbPost('/api/db/filenodes', newNode)
    if (parentId && parentChildren) dbPatch(`/api/db/filenodes/${parentId}`, { children: parentChildren })
    return id
  },

  renameFileNode: (id, name) => {
    const node = get().fileNodes.find(n => n.id === id)
    const isDoc = node && node.type !== 'folder'
    set((state) => ({
      fileNodes: state.fileNodes.map(n => n.id === id ? { ...n, name } : n),
      documents: isDoc
        ? state.documents.map(d => d.id === id ? { ...d, title: name, updatedAt: new Date().toISOString() } : d)
        : state.documents,
    }))
    dbPatch(`/api/db/filenodes/${id}`, { name })
    if (isDoc) dbPatch(`/api/db/documents/${id}`, { title: name })
  },

  deleteFileNode: (id) => {
    const state = get()
    // Collect all descendant IDs recursively
    const toDelete = new Set<string>()
    const collect = (nodeId: string) => {
      const node = state.fileNodes.find(n => n.id === nodeId)
      if (!node) return
      toDelete.add(nodeId)
      node.children.forEach(collect)
    }
    collect(id)
    const docIds = Array.from(toDelete).filter(nId => {
      const n = state.fileNodes.find(f => f.id === nId)
      return n && n.type !== 'folder'
    })
    const deletedNode = state.fileNodes.find(n => n.id === id)
    set((s) => ({
      fileNodes: s.fileNodes
        .filter(n => !toDelete.has(n.id))
        .map(n => n.id === deletedNode?.parentId
          ? { ...n, children: n.children.filter(cId => !toDelete.has(cId)) }
          : n
        ),
      documents: s.documents.filter(d => !docIds.includes(d.id)),
      activeDocId: docIds.includes(s.activeDocId ?? '') ? null : s.activeDocId,
    }))
    // Update parent children in DB
    if (deletedNode?.parentId) {
      const updatedParent = get().fileNodes.find(n => n.id === deletedNode.parentId)
      if (updatedParent) dbPatch(`/api/db/filenodes/${deletedNode.parentId}`, { children: updatedParent.children })
    }
    toDelete.forEach(nId => dbDelete(`/api/db/filenodes/${nId}`))
    docIds.forEach(dId => dbDelete(`/api/db/documents/${dId}`))
  },

  // ── Task actions ───────────────────────────────────────────────────
  addTask: (task) => {
    const id  = uuidv4()
    const ts  = new Date().toISOString()
    const status = task.status ?? 'todo'
    const newTask: Task = {
      description: '', priority: 'P2', assigneeId: null, dueDate: '', estimate: '', sourceDocId: null, sprintId: null, externalUrl: null,
      ...task,
      status,
      id,
      order: task.order ?? nextOrder(get().tasks, status),
      createdAt: ts,
      updatedAt: ts,
    }
    set((state) => ({ tasks: [...state.tasks, newTask] }))
    dbPost('/api/db/tasks', newTask)
    return id
  },

  addTasks: (items) => {
    const ts = new Date().toISOString()
    let order = nextOrder(get().tasks, 'todo')
    const newTasks: Task[] = items.map((task) => ({
      description: '', priority: 'P2', assigneeId: null, dueDate: '', estimate: '', sourceDocId: null, sprintId: null, externalUrl: null,
      ...task,
      status: task.status ?? 'todo',
      id: uuidv4(),
      order: order++,
      createdAt: ts,
      updatedAt: ts,
    }))
    set((state) => ({ tasks: [...state.tasks, ...newTasks] }))
    dbPost('/api/db/tasks/bulk', { tasks: newTasks })
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)),
    }))
    dbPatch(`/api/db/tasks/${id}`, updates)
  },

  // Places the task in `status`, directly above `beforeTaskId` (or at the end when null)
  moveTask: (id, status, beforeTaskId) => {
    const column = sortTasks(get().tasks.filter((t) => t.status === status && t.id !== id))
    const index  = beforeTaskId ? column.findIndex((t) => t.id === beforeTaskId) : -1
    let order: number
    if (index === -1) {
      order = column.length ? column[column.length - 1].order + 1 : 0
    } else {
      const prev = column[index - 1]
      order = prev ? (prev.order + column[index].order) / 2 : column[index].order - 1
    }
    get().updateTask(id, { status, order })
  },

  deleteTask: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))
    dbDelete(`/api/db/tasks/${id}`)
  },

  // ── Sprint actions ─────────────────────────────────────────────────
  startSprint: async (input) => {
    const res = await fetch('/api/db/sprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'Could not start the sprint')
    const updated = new Map((data.tasks as Task[]).map((t) => [t.id, t]))
    set((state) => ({
      sprints: [data.sprint, ...state.sprints],
      tasks: state.tasks.map((t) => updated.get(t.id) ?? t),
    }))
    return data.sprint as Sprint
  },

  completeSprint: async (id) => {
    const res = await fetch(`/api/db/sprints/${id}/complete`, { method: 'POST' })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'Could not complete the sprint')
    set((state) => ({
      sprints: state.sprints.map((s) => (s.id === id ? data.sprint : s)),
      // Unfinished work goes back to the backlog
      tasks: state.tasks.map((t) => (t.sprintId === id && t.status !== 'done' ? { ...t, sprintId: null } : t)),
    }))
    return data.returnedToBacklog as number
  },

  setTaskSprint: (taskId, sprintId) => get().updateTask(taskId, { sprintId }),

  exportToGithub: async (taskIds) => {
    const res = await fetch('/api/integrations/github/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'Could not export to GitHub')
    const results = data.results as { taskId: string; url?: string; error?: string; skipped?: boolean }[]
    const urls = new Map(results.filter((r) => r.url).map((r) => [r.taskId, r.url!]))
    set((state) => ({ tasks: state.tasks.map((t) => (urls.has(t.id) ? { ...t, externalUrl: urls.get(t.id)! } : t)) }))
    return {
      created: results.filter((r) => r.url && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      error: results.find((r) => r.error)?.error ?? null,
    }
  },

  // ── Team actions ───────────────────────────────────────────────────
  addMember: (name, color) => {
    const id = uuidv4()
    const member: Member = { id, name: name.trim(), color, createdAt: new Date().toISOString(), userId: null }
    set((state) => ({ members: [...state.members, member] }))
    dbPost('/api/db/members', member)
    return id
  },

  updateMember: (id, updates) => {
    set((state) => ({ members: state.members.map((m) => (m.id === id ? { ...m, ...updates } : m)) }))
    dbPatch(`/api/db/members/${id}`, updates)
  },

  // The API also unassigns the member's tasks; mirror that locally
  deleteMember: (id) => {
    set((state) => ({
      members: state.members.filter((m) => m.id !== id),
      tasks: state.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: null } : t)),
    }))
    dbDelete(`/api/db/members/${id}`)
  },

  // ── Navigation ─────────────────────────────────────────────────────
  setMainView:      (mainView)       => set({ mainView }),
  openTasks:        (docFilter = null) => set({ mainView: 'tasks', taskDocFilter: docFilter }),
  setTaskDocFilter: (taskDocFilter)  => set({ taskDocFilter }),
  openTaskReview:   (docId)          => set({ taskReviewDocId: docId }),
  closeTaskReview:  ()               => set({ taskReviewDocId: null }),
  openTask:         (taskId)         => set({ mainView: 'tasks', taskDocFilter: null, focusTaskId: taskId }),
  clearFocusTask:   ()               => set({ focusTaskId: null }),

  adjustCommentCount: (key, delta) =>
    set((state) => ({ commentCounts: { ...state.commentCounts, [key]: Math.max(0, (state.commentCounts[key] ?? 0) + delta) } })),

  // ── UI actions ─────────────────────────────────────────────────────
  setActiveSidebarTab:    (tab)             => set({ activeSidebarTab: tab }),
  setActiveFolderId:      (id)              => set({ activeFolderId: id }),
  setTheme:               (theme)           => { saveTheme(theme); set({ theme }) },
  setSaveStatus:          (saveStatus)      => set({ saveStatus }),
  setPendingAICommand:    (workflow, prompt) => set({ pendingAICommand: { workflow, prompt } }),
  clearPendingAICommand:  ()                => set({ pendingAICommand: null }),

  applyAIContent: (id, html) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, content: html, updatedAt: new Date().toISOString() } : d
      ),
      aiContentVersion: state.aiContentVersion + 1,
    }))
    // Tells the server to keep the previous content in the version history
    dbPatch(`/api/db/documents/${id}`, { content: html, versionReason: 'ai' })
  },

  // Content already saved on the server (e.g. a restored version): update locally and reload the editor
  replaceDocumentContent: (id, content) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, content, updatedAt: new Date().toISOString() } : d
      ),
      aiContentVersion: state.aiContentVersion + 1,
    }))
  },
}))
