import { useState } from 'react'
import { useWorkspaceStore } from '@/lib/store'
import type { Feature, FeaturePriority, FeatureStatus, MoscowType } from '@/lib/types'
import Modal from '@/components/tasks/Modal'
import { featureEvidence } from '@/lib/evidence'

const fieldStyle = { background: '#18181b', border: '1px solid #2a2a2e', color: '#e4e4e7' }
const inputClass = 'w-full rounded-md px-2.5 py-1.5 text-xs outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>{label}</span>
      {children}
    </label>
  )
}

/** Edits every field of a roadmap feature. Changes are saved when the user clicks Save. */
export default function FeatureEditModal({ featureId, onClose }: { featureId: string; onClose: () => void }) {
  const { features, members, documents, insights, updateFeature } = useWorkspaceStore()
  const feature = features.find((f) => f.id === featureId)
  const [draft, setDraft] = useState<Feature | undefined>(feature)

  if (!feature || !draft) return null

  const set = <K extends keyof Feature>(key: K, value: Feature[K]) => setDraft({ ...draft, [key]: value })
  const num = (v: string) => (v === '' ? 0 : Number(v))

  // Assignees are stored by name on features; keep an existing name even if it isn't a team member
  const assigneeNames = Array.from(new Set([...members.map((m) => m.name), ...(draft.assignee ? [draft.assignee] : [])]))

  const save = () => {
    const { id, riceScore, ...updates } = draft // eslint-disable-line @typescript-eslint/no-unused-vars
    updateFeature(feature.id, { ...updates, title: updates.title.trim() || feature.title })
    onClose()
  }

  return (
    <Modal
      title="Edit feature"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-md text-xs" style={{ color: '#a1a1aa' }}>Cancel</button>
          <button onClick={save} className="px-3.5 py-1.5 rounded-md text-xs font-medium" style={{ background: '#6366f1', color: '#fff' }}>
            Save
          </button>
        </>
      }
    >
      <form
        className="px-5 py-4 space-y-3.5"
        onSubmit={(e) => { e.preventDefault(); save() }}
      >
        <Field label="Title">
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} className={inputClass} style={fieldStyle} autoFocus />
        </Field>

        <Field label="Description">
          <textarea
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={`${inputClass} resize-y leading-relaxed`}
            style={fieldStyle}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Status">
            <select value={draft.status} onChange={(e) => set('status', e.target.value as FeatureStatus)} className={inputClass} style={fieldStyle}>
              {(['Now', 'Next', 'Later', 'Done'] as FeatureStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={draft.priority} onChange={(e) => set('priority', e.target.value as FeaturePriority)} className={inputClass} style={fieldStyle}>
              {(['P0', 'P1', 'P2', 'P3'] as FeaturePriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="MoSCoW">
            <select value={draft.moscow} onChange={(e) => set('moscow', e.target.value as MoscowType)} className={inputClass} style={fieldStyle}>
              {(['Must', 'Should', 'Could', 'Wont'] as MoscowType[]).map((m) => <option key={m} value={m}>{m === 'Wont' ? "Won't" : m}</option>)}
            </select>
          </Field>
          <Field label="Assignee">
            <select value={draft.assignee} onChange={(e) => set('assignee', e.target.value)} className={inputClass} style={fieldStyle}>
              <option value="">Unassigned</option>
              {assigneeNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              className={inputClass}
              style={{ ...fieldStyle, colorScheme: 'dark' }}
            />
          </Field>
          <Field label="Linked doc">
            <select value={draft.linkedDocId ?? ''} onChange={(e) => set('linkedDocId', e.target.value || null)} className={inputClass} style={fieldStyle}>
              <option value="">None</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>RICE</span>
          <div className="grid grid-cols-4 gap-2">
            {([['reach', 'Reach'], ['impact', 'Impact'], ['confidence', 'Confidence %'], ['effort', 'Effort']] as const).map(([key, label]) => (
              <label key={key} className="block">
                <span className="block text-[11px] mb-1" style={{ color: '#8a8a93' }}>{label}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft[key]}
                  onChange={(e) => set(key, num(e.target.value))}
                  className={inputClass}
                  style={fieldStyle}
                />
              </label>
            ))}
          </div>
        </div>
        {(() => {
          const evidence = featureEvidence(feature.id, insights)
          if (!evidence.insights.length) return null
          return (
            <div>
              <span className="block text-[11px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#9d9da6' }}>
                Research evidence · {evidence.mentions} user mentions
              </span>
              <ul className="space-y-1.5">
                {evidence.insights.map((i) => (
                  <li key={i.id} className="rounded-md px-3 py-2" style={{ background: '#18181b', border: '1px solid #2a2a2e' }}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium" style={{ color: '#e4e4e7' }}>{i.theme}</span>
                      <span className="text-[11px]" style={{ color: '#fcd34d' }}>{i.frequency} users</span>
                    </span>
                    {i.quotes[0] && <span className="block text-[11px] italic mt-1" style={{ color: '#9d9da6' }}>&ldquo;{i.quotes[0]}&rdquo;</span>}
                  </li>
                ))}
              </ul>
            </div>
          )
        })()}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
