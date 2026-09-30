import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Link2, Plus, Quote, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import type { ResearchInsight } from '@/lib/types'

function LinkMenu({ insight }: { insight: ResearchInsight }) {
  const { features, updateInsight } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  if (!features.length) return null

  const toggle = (featureId: string) => {
    const linked = insight.linkedFeatures.includes(featureId)
    updateInsight(insight.id, {
      linkedFeatures: linked ? insight.linkedFeatures.filter((id) => id !== featureId) : [...insight.linkedFeatures, featureId],
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
        style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
      >
        <Link2 size={10} />
        Link feature
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border overflow-hidden shadow-2xl" style={{ background: '#18181b', borderColor: '#2e2e32' }}>
          <div className="max-h-48 overflow-y-auto">
            {features.map((f) => {
              const linked = insight.linkedFeatures.includes(f.id)
              return (
                <button
                  key={f.id}
                  onMouseDown={(e) => { e.preventDefault(); toggle(f.id) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/5"
                  style={{ color: linked ? '#818cf8' : '#a1a1aa' }}
                >
                  {linked ? <Check size={11} className="flex-shrink-0" /> : <Plus size={11} className="flex-shrink-0" style={{ color: '#8a8a93' }} />}
                  <span className="truncate">{f.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight }: { insight: ResearchInsight }) {
  const { features, addFeature, updateInsight, setActiveSidebarTab } = useWorkspaceStore()
  const [showQuotes, setShowQuotes] = useState(false)
  const linked = features.filter((f) => insight.linkedFeatures.includes(f.id))

  // Starts in "Later" with evidence-based confidence; the PM refines RICE on the roadmap
  const createFeature = () => {
    const id = addFeature({
      title: insight.theme,
      description: insight.summary,
      status: 'Later',
      priority: 'P2',
      reach: Math.max(100, insight.frequency * 100),
      impact: 2,
      confidence: 80,
      effort: 3,
      moscow: 'Should',
      assignee: '',
      dueDate: '',
      linkedDocId: null,
    })
    updateInsight(insight.id, { linkedFeatures: [...insight.linkedFeatures, id] })
    toast.success(`Added "${insight.theme}" to the roadmap`)
    setActiveSidebarTab('roadmap')
  }

  return (
    <div className="rounded-xl border mb-2.5 p-3" style={{ background: '#111113', borderColor: '#1e1e22' }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold leading-snug" style={{ color: '#e4e4e7' }}>{insight.theme}</h3>
        <span className="text-[11px] flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: '#1e1e22', color: '#a1a1aa' }} title="Users who mentioned this">
          {insight.frequency} users
        </span>
      </div>
      <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: '#a1a1aa' }}>{insight.summary}</p>

      {insight.quotes.length > 0 && (
        <>
          <button onClick={() => setShowQuotes((v) => !v)} className="flex items-center gap-1 text-[11px] mt-2" style={{ color: showQuotes ? '#818cf8' : '#52525b' }}>
            <Quote size={10} />
            {insight.quotes.length} quote{insight.quotes.length === 1 ? '' : 's'}
            {showQuotes ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {showQuotes && (
            <div className="mt-1.5 space-y-1.5">
              {insight.quotes.map((q, i) => (
                <p key={i} className="text-[11px] italic rounded-lg px-2.5 py-1.5" style={{ background: '#0d0d0f', color: '#9d9da6' }}>&ldquo;{q}&rdquo;</p>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
        {linked.map((f) => (
          <span key={f.id} className="text-[11px] px-1.5 py-0.5 rounded truncate max-w-[140px]" style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac' }} title={`Linked to ${f.title}`}>
            → {f.title}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <LinkMenu insight={insight} />
          <button
            onClick={createFeature}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
            style={{ background: '#1e1e22', color: '#d4d4d8', border: '1px solid #2a2a2e' }}
            title="Create a roadmap feature from this insight"
          >
            <Sparkles size={10} />
            Create feature
          </button>
        </div>
      </div>
    </div>
  )
}

/** Saved research insights, with links to roadmap features. */
export default function InsightLibrary() {
  const { insights } = useWorkspaceStore()
  const sorted = [...insights].sort((a, b) => b.frequency - a.frequency)
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
      <p className="text-[11px] uppercase tracking-wider font-medium mb-2 px-0.5" style={{ color: '#8a8a93' }}>
        Saved insights · {insights.length}
      </p>
      {sorted.map((i) => <InsightCard key={i.id} insight={i} />)}
    </div>
  )
}
