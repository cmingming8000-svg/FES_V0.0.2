import { BENCHMARK } from '../constants';
import type { Criterion, FacultyMetrics, IndividualRecommendation, TNATemplate } from '../types';

/**
 * Individual-level Training Needs Analysis.
 *
 * Deterministic and rule-based by design: each criterion averaging below its
 * template threshold (default 3.0) maps to HR / QA pre-approved
 * micro-recommendation templates. No AI/NLP processing happens at the
 * individual level; macro (Department / Institution) analyses are generated
 * and cached server-side as TNA snapshots.
 */
export function buildIndividualRecommendations(metrics: FacultyMetrics, criteria: Criterion[], templates: TNATemplate[]): IndividualRecommendation[] {
  if (metrics.totalSubmissions === 0) return [];
  return criteria
    .map(c => {
      const average = metrics.criteriaAverages[c.id] ?? 0;
      const applicable = templates
        .filter(t => t.criterionId === c.id && average > 0 && average < t.threshold)
        .sort((a, b) => a.order - b.order);
      return { criterionId: c.id, criterionName: c.name, average, recommendations: applicable.map(t => t.recommendation) };
    })
    .filter(r => r.recommendations.length > 0)
    .sort((a, b) => a.average - b.average);
}

export function strengthsOf(metrics: FacultyMetrics, criteria: Criterion[], floor = 4.0): Criterion[] {
  return criteria.filter(c => (metrics.criteriaAverages[c.id] ?? 0) >= floor);
}

export { BENCHMARK };
