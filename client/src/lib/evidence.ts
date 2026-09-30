import type { ResearchInsight } from './types'

/** Research insights linked to a feature, and how many users mentioned them in total. */
export function featureEvidence(featureId: string, insights: ResearchInsight[]) {
  const linked = insights.filter((i) => i.linkedFeatures.includes(featureId))
  return { insights: linked, mentions: linked.reduce((sum, i) => sum + i.frequency, 0) }
}
