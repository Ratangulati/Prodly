import type { Document, Feature, ResearchInsight, Task } from './types'

export type SearchKind = 'document' | 'task' | 'feature' | 'insight'

export interface SearchResult {
  kind: SearchKind
  id: string
  title: string
  /** Text around the first match, when the match isn't in the title. */
  snippet: string
  score: number
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + length + 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** Scores a title/body pair: title matches rank above body matches, earlier matches above later ones. */
function match(query: string, title: string, body: string): { score: number; snippet: string } | null {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  const titleIndex = t.indexOf(q)
  if (titleIndex !== -1) return { score: (t === q ? 300 : titleIndex === 0 ? 200 : 150) - titleIndex, snippet: '' }
  const bodyIndex = body.toLowerCase().indexOf(q)
  if (bodyIndex !== -1) return { score: 100 - Math.min(bodyIndex, 99) / 10, snippet: snippetAround(body, bodyIndex, q.length) }
  return null
}

interface Searchable {
  documents: Document[]
  tasks: Task[]
  features: Feature[]
  insights: ResearchInsight[]
}

/** Searches titles and text across the whole workspace. */
export function searchWorkspace(query: string, { documents, tasks, features, insights }: Searchable, limit = 30): SearchResult[] {
  const q = query.trim()
  if (q.length < 2) return []
  const results: SearchResult[] = []
  const add = (kind: SearchKind, id: string, title: string, body: string) => {
    const m = match(q, title, body)
    if (m) results.push({ kind, id, title, snippet: m.snippet, score: m.score })
  }
  documents.forEach((d) => add('document', d.id, d.title, stripHtml(d.content)))
  tasks.forEach((t) => add('task', t.id, t.title, t.description))
  features.forEach((f) => add('feature', f.id, f.title, f.description))
  insights.forEach((i) => add('insight', i.id, i.theme, `${i.summary} ${i.quotes.join(' ')}`))
  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
