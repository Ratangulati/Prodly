
import { useState, useRef, useEffect } from 'react'

import { format } from 'date-fns'
import { ChevronDown, Copy, Download, FileDown, Printer, History, ListChecks, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import Editor from './Editor'
import PrdReviewModal from './PrdReviewModal'
import VersionHistoryModal from './VersionHistoryModal'
import { printAsPdf, wordDocument } from '@/lib/exportDoc'
import DocumentComments from '@/components/comments/DocumentComments'
import type { DocumentType } from '@/lib/types'

/* ── Export helpers ─────────────────────────────────────────────── */
function htmlToMarkdown(html: string): string {
  if (typeof document === 'undefined') return html
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const inner = Array.from(el.childNodes).map(walk).join('')
    switch (tag) {
      case 'h1': return `# ${inner}\n\n`
      case 'h2': return `## ${inner}\n\n`
      case 'h3': return `### ${inner}\n\n`
      case 'h4': return `#### ${inner}\n\n`
      case 'h5': return `##### ${inner}\n\n`
      case 'h6': return `###### ${inner}\n\n`
      case 'p':  return `${inner}\n\n`
      case 'strong': case 'b': return `**${inner}**`
      case 'em': case 'i':     return `*${inner}*`
      case 'u':  return `__${inner}__`
      case 'code':
        return el.parentElement?.tagName.toLowerCase() === 'pre'
          ? inner
          : `\`${inner}\``
      case 'pre': return `\`\`\`\n${inner}\n\`\`\`\n\n`
      case 'blockquote':
        return inner.trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n'
      case 'ul': return inner + '\n'
      case 'ol': return inner + '\n'
      case 'li': return `- ${inner.trim()}\n`
      case 'br': return '\n'
      case 'hr': return '---\n\n'
      case 'a':  return `[${inner}](${el.getAttribute('href') ?? ''})`
      default:   return inner
    }
  }

  return walk(parsed.body).replace(/\n{3,}/g, '\n\n').trim()
}

function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent ?? div.innerHTML).trim()
}

function downloadBlob(content: string | Blob, filename: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const TYPE_LABELS: Record<DocumentType, string> = {
  prd: 'PRD',
  'user-story': 'User Story',
  research: 'Research',
  roadmap: 'Roadmap',
  general: 'Note',
}

const TYPE_COLORS: Record<DocumentType, { bg: string; text: string }> = {
  prd:          { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' },
  'user-story': { bg: 'rgba(34,197,94,0.12)',  text: '#86efac' },
  research:     { bg: 'rgba(245,158,11,0.12)', text: '#fcd34d' },
  roadmap:      { bg: 'rgba(59,130,246,0.12)', text: '#93c5fd' },
  general:      { bg: 'rgba(107,114,128,0.12)',text: '#9ca3af' },
}

export default function EditorPanel() {
  const { documents, activeDocId, updateDocument, saveStatus, tasks, openTasks, openTaskReview } = useWorkspaceStore()
  const doc = documents.find((d) => d.id === activeDocId)
  const docTasks  = tasks.filter((t) => t.sourceDocId === activeDocId)
  const tasksDone = docTasks.filter((t) => t.status === 'done').length
  const [reviewOpen, setReviewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const commentCount = useWorkspaceStore((s) => (activeDocId ? s.commentCounts[`document:${activeDocId}`] ?? 0 : 0))

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue,   setTitleValue]   = useState('')
  const [exportOpen,   setExportOpen]   = useState(false)
  const [copyDone,     setCopyDone]     = useState('')
  const titleRef  = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopyDone(label)
    setTimeout(() => setCopyDone(''), 1800)
    setExportOpen(false)
  }

  useEffect(() => {
    if (doc) setTitleValue(doc.title)
  }, [doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitTitle = () => {
    if (doc && titleValue.trim()) {
      updateDocument(doc.id, { title: titleValue.trim() })
    }
    setEditingTitle(false)
  }

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="text-center space-y-3">
          <p className="text-4xl">✦</p>
          <p className="text-sm font-medium" style={{ color: '#8a8a93' }}>Select or create a document</p>
          <p className="text-xs" style={{ color: '#7a7a83' }}>Use the sidebar to open a document</p>
        </div>
      </div>
    )
  }

  const typeStyle = TYPE_COLORS[doc.type]
  const savedAt   = format(new Date(doc.updatedAt), 'h:mm a')

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden" style={{ background: '#0f0f0f' }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-x-3 gap-y-2 flex-wrap px-4 lg:px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: '#1e1e1e', background: '#111' }}
      >
        {/* Title */}
        {editingTitle ? (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle() }}
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none border-b"
            style={{ color: '#f0f0f0', borderColor: '#6366f1' }}
          />
        ) : (
          <h1
            className="flex-1 min-w-[120px] text-sm font-semibold truncate cursor-text"
            style={{ color: '#f0f0f0' }}
            onClick={() => { setTitleValue(doc.title); setEditingTitle(true) }}
            title="Click to edit"
          >
            {doc.title}
          </h1>
        )}

        {/* Type badge */}
        <span
          className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider flex-shrink-0"
          style={{ background: typeStyle.bg, color: typeStyle.text }}
        >
          {TYPE_LABELS[doc.type]}
        </span>

        {/* Save indicator */}
        <div className="flex items-center gap-1 flex-shrink-0 min-w-[80px]">
          {saveStatus === 'saving' ? (
            <span className="text-[11px]" style={{ color: '#818cf8' }}>Saving…</span>
          ) : saveStatus === 'saved' ? (
            <span className="text-[11px]" style={{ color: '#4ade80' }}>Saved {savedAt}</span>
          ) : (
            <span className="text-[11px]" style={{ color: '#8a8a93' }}>Saved {savedAt}</span>
          )}
        </div>

        {/* PRD tools */}
        {doc.type === 'prd' && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {docTasks.length > 0 && (
              <button
                onClick={() => openTasks(doc.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-white/10"
                style={{ color: '#a1a1aa', border: '1px solid #2a2a2a' }}
                title="Open this PRD's tasks"
              >
                <ListChecks size={12} style={{ color: '#4ade80' }} />
                {tasksDone}/{docTasks.length} tasks
              </button>
            )}
            <button
              onClick={() => setReviewOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-white/10"
              style={{ color: '#a1a1aa', border: '1px solid #2a2a2a' }}
              title="Score this PRD and find gaps"
            >
              <ShieldCheck size={12} />
              Check quality
            </button>
            <button
              onClick={() => openTaskReview(doc.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }}
              title="Break this PRD into tasks for the board"
            >
              <Sparkles size={12} />
              Generate tasks
            </button>
          </div>
        )}

        {/* Comments */}
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1 px-1.5 py-1.5 rounded-md text-xs transition-colors hover:bg-white/10 flex-shrink-0"
          style={{ color: commentsOpen ? '#c7d2fe' : '#a1a1aa', border: `1px solid ${commentsOpen ? 'rgba(99,102,241,0.5)' : '#2a2a2a'}` }}
          title="Comments"
          aria-label="Comments"
        >
          <MessageSquare size={14} />
          {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
        </button>

        {/* Version history */}
        <button
          onClick={() => setHistoryOpen(true)}
          className="p-1.5 rounded-md transition-colors hover:bg-white/10 flex-shrink-0"
          style={{ color: '#a1a1aa', border: '1px solid #2a2a2a' }}
          title="Version history"
          aria-label="Version history"
        >
          <History size={14} />
        </button>

        {/* Export */}
        <div ref={exportRef} className="relative flex-shrink-0">
          <button
            onClick={() => setExportOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{ background: '#1e1e1e', color: copyDone ? '#4ade80' : '#aaa', border: '1px solid #2a2a2a' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1e1e1e' }}
          >
            {copyDone ? copyDone : 'Export'}
            <ChevronDown size={11} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </button>

          {exportOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-48 rounded-lg py-1 z-50"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              <p className="px-3 py-1.5 text-[11px] uppercase tracking-wider" style={{ color: '#7a7a83' }}>Copy</p>
              <button
                onClick={() => copyText(htmlToMarkdown(doc.content), 'Copied!')}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Copy size={12} style={{ color: '#9d9da6' }} />
                Copy as Markdown
              </button>
              <button
                onClick={() => copyText(htmlToText(doc.content), 'Copied!')}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Copy size={12} style={{ color: '#9d9da6' }} />
                Copy as Plain Text
              </button>

              <div className="my-1" style={{ borderTop: '1px solid #2a2a2a' }} />
              <p className="px-3 py-1.5 text-[11px] uppercase tracking-wider" style={{ color: '#7a7a83' }}>Download</p>
              <button
                onClick={() => {
                  downloadBlob(htmlToMarkdown(doc.content), `${doc.title}.md`, 'text/markdown')
                  setExportOpen(false)
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Download size={12} style={{ color: '#9d9da6' }} />
                Download .md
              </button>
              <button
                onClick={() => {
                  downloadBlob(htmlToText(doc.content), `${doc.title}.txt`, 'text/plain')
                  setExportOpen(false)
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Download size={12} style={{ color: '#9d9da6' }} />
                Download .txt
              </button>
              <button
                onClick={() => {
                  downloadBlob(wordDocument(doc.title, doc.content), `${doc.title}.doc`, 'application/msword')
                  setExportOpen(false)
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <FileDown size={12} style={{ color: '#9d9da6' }} />
                Word / Google Docs (.doc)
              </button>
              <button
                onClick={() => {
                  printAsPdf(doc.title, doc.content)
                  setExportOpen(false)
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#bbb' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Printer size={12} style={{ color: '#9d9da6' }} />
                Save as PDF…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Editor docId={doc.id} />
      </div>

      {reviewOpen && <PrdReviewModal docId={doc.id} onClose={() => setReviewOpen(false)} />}
      {historyOpen && <VersionHistoryModal docId={doc.id} onClose={() => setHistoryOpen(false)} />}
      {commentsOpen && <DocumentComments key={doc.id} docId={doc.id} onClose={() => setCommentsOpen(false)} />}
    </div>
  )
}
