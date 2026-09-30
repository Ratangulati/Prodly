export type DocumentType = 'prd' | 'user-story' | 'research' | 'roadmap' | 'general'
export type FileNodeType = 'folder' | DocumentType

export interface FileNode {
  id: string
  name: string
  type: FileNodeType
  parentId: string | null
  children: string[] // ordered list of child IDs
  createdAt: string
}

export interface Document {
  id: string
  title: string
  content: string
  type: DocumentType
  createdAt: string
  updatedAt: string
  tags: string[]
}

export type FeatureStatus = 'Now' | 'Next' | 'Later' | 'Done'
export type FeaturePriority = 'P0' | 'P1' | 'P2' | 'P3'
export type MoscowType = 'Must' | 'Should' | 'Could' | 'Wont'

export interface Feature {
  id: string
  title: string
  description: string
  status: FeatureStatus
  priority: FeaturePriority
  reach: number
  impact: number
  confidence: number
  effort: number
  riceScore: number
  moscow: MoscowType
  assignee: string
  dueDate: string
  linkedDocId: string | null
}

export type AIWorkflow =
  | 'prd'
  | 'stories'
  | 'roadmap'
  | 'prioritization'
  | 'research'
  | 'data'
  | 'general'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  workflow: AIWorkflow
}

export interface ResearchInsight {
  id: string
  theme: string
  summary: string
  quotes: string[]
  frequency: number
  linkedFeatures: string[]
}

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done'
export type TaskEstimate = 'XS' | 'S' | 'M' | 'L' | 'XL' | ''

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: FeaturePriority
  assigneeId: string | null
  dueDate: string
  estimate: TaskEstimate
  sourceDocId: string | null
  order: number
  /** The sprint this task is committed to, if any. */
  sprintId: string | null
  /** Link to the GitHub issue this task was exported to. */
  externalUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface Sprint {
  id: string
  name: string
  goal: string
  /** YYYY-MM-DD */
  startDate: string
  endDate: string
  status: 'active' | 'completed'
  createdAt: string
}

export interface Member {
  id: string
  name: string
  color: string
  createdAt: string
  /** Set when this teammate has their own login. */
  userId: string | null
}

/** A task suggested by the AI from a PRD, before the PM approves it. */
export interface ProposedTask {
  title: string
  description: string
  priority: FeaturePriority
  estimate: Exclude<TaskEstimate, ''>
}

export type MainView = 'home' | 'editor' | 'tasks'

export type Theme = 'dark' | 'light'
export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface PendingAICommand {
  workflow: AIWorkflow
  prompt: string
}

export interface Workspace {
  documents: Document[]
  features: Feature[]
  messages: AIMessage[]
  insights: ResearchInsight[]
  fileNodes: FileNode[]
  tasks: Task[]
  members: Member[]
  sprints: Sprint[]
  /** Integrations configured on the server. */
  integrations: { github: { repo: string } | null }
  mainView: MainView
  /** When set, the task board shows only tasks generated from this document. */
  taskDocFilter: string | null
  /** When set, the "generate tasks" review dialog is open for this document. */
  taskReviewDocId: string | null
  /** When set, the task board opens this task's details (e.g. from a mention). */
  focusTaskId: string | null
  /** Comment counts keyed by "task:<id>" or "document:<id>". */
  commentCounts: Record<string, number>
  activeDocId: string | null
  activeFolderId: string | null
  activeSidebarTab: string
  theme: Theme
  saveStatus: SaveStatus
  pendingAICommand: PendingAICommand | null
  aiContentVersion: number
  isLoading: boolean
}
