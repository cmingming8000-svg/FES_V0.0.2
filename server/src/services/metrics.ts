import type { TermStats } from '../../../src/types';
import { THRESHOLD } from '../../../src/constants';
import type { DbClient } from '../db/pool';

export interface ActiveRubric {
  criteria: Array<{ id: string; name: string; order: number }>;
  indicators: Array<{ id: string; criterionId: string; text: string; order: number }>;
}

export async function loadActiveRubric(client: DbClient): Promise<ActiveRubric> {
  const criteria = await client.query(
    `SELECT id, name, sort_order FROM criteria WHERE archived_at IS NULL ORDER BY sort_order, name`,
  );
  const indicators = await client.query(
    `SELECT i.id, i.criterion_id, i.text, i.sort_order
       FROM performance_indicators i
       JOIN criteria c ON c.id = i.criterion_id AND c.archived_at IS NULL
      WHERE i.archived_at IS NULL
      ORDER BY i.criterion_id, i.sort_order`,
  );
  return {
    criteria: criteria.rows.map(r => ({ id: r.id, name: r.name, order: r.sort_order })),
    indicators: indicators.rows.map(r => ({ id: r.id, criterionId: r.criterion_id, text: r.text, order: r.sort_order })),
  };
}

/** Criterion average = mean of its active indicators' averages (0 when an indicator has no ratings). */
export function criteriaAveragesFrom(rubric: ActiveRubric, indicatorAvg: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rubric.criteria) {
    const inds = rubric.indicators.filter(i => i.criterionId === c.id);
    out[c.id] = inds.length === 0 ? 0 : inds.reduce((s, i) => s + (indicatorAvg.get(i.id) ?? 0), 0) / inds.length;
  }
  return out;
}

/**
 * Aggregate statistics for the given terms. Must run in the SYSTEM context:
 * it reads institution-wide rows and returns only aggregates.
 */
export async function computeTermStats(client: DbClient, termIds: string[], facultyId?: string | null): Promise<Record<string, TermStats>> {
  if (termIds.length === 0) return {};
  const rubric = await loadActiveRubric(client);

  const [indicatorRows, facultyRows, facultyCounts] = await Promise.all([
    client.query(
      `SELECT e.term_id, d.name AS department, r.indicator_id, sum(r.rating)::int AS total, count(*)::int AS n
         FROM evaluations e
         JOIN faculty f ON f.id = e.faculty_id
         JOIN departments d ON d.id = f.department_id
         JOIN evaluation_ratings r ON r.evaluation_id = e.id
        WHERE e.term_id = ANY($1)
        GROUP BY 1, 2, 3`,
      [termIds],
    ),
    client.query(
      `WITH ev AS (
         SELECT e.term_id, e.faculty_id, avg(r.rating)::float8 AS avg
           FROM evaluations e
           JOIN evaluation_ratings r ON r.evaluation_id = e.id
          WHERE e.term_id = ANY($1)
          GROUP BY e.id, e.term_id, e.faculty_id
       )
       SELECT ev.term_id, ev.faculty_id, d.name AS department, count(*)::int AS submissions, avg(ev.avg)::float8 AS average
         FROM ev
         JOIN faculty f ON f.id = ev.faculty_id
         JOIN departments d ON d.id = f.department_id
        GROUP BY 1, 2, 3`,
      [termIds],
    ),
    client.query(
      `SELECT d.name AS department, count(f.id)::int AS n
         FROM departments d LEFT JOIN faculty f ON f.department_id = d.id
        GROUP BY d.name`,
    ),
  ]);

  const stats: Record<string, TermStats> = {};
  for (const termId of termIds) {
    const termIndicators = indicatorRows.rows.filter(r => r.term_id === termId);
    const termFaculty = facultyRows.rows.filter(r => r.term_id === termId);

    const departments: TermStats['departments'] = {};
    for (const { department, n } of facultyCounts.rows) {
      const rows = termIndicators.filter(r => r.department === department);
      const indicatorAvg = new Map<string, number>(rows.map(r => [r.indicator_id, r.n > 0 ? r.total / r.n : 0]));
      const sum = rows.reduce((s, r) => s + r.total, 0);
      const count = rows.reduce((s, r) => s + r.n, 0);
      departments[department] = {
        totalFaculty: n,
        totalSubmissions: termFaculty.filter(f => f.department === department).reduce((s, f) => s + f.submissions, 0),
        average: count > 0 ? sum / count : 0,
        criteriaAverages: criteriaAveragesFrom(rubric, indicatorAvg),
      };
    }

    const qualified = termFaculty.filter(f => f.submissions >= THRESHOLD);
    const termStats: TermStats = {
      institutionAverage: qualified.length > 0 ? qualified.reduce((s, f) => s + f.average, 0) / qualified.length : 0,
      departments,
    };

    if (facultyId) {
      const own = termFaculty.find(f => f.faculty_id === facultyId);
      if (own) {
        const peers = termFaculty.filter(f => f.department === own.department && f.submissions > 0).sort((a, b) => b.average - a.average);
        termStats.facultyRank = { rank: peers.findIndex(f => f.faculty_id === facultyId) + 1, of: peers.length };
      }
    }
    stats[termId] = termStats;
  }
  return stats;
}
