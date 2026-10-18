import type { DepartmentTNA, InstitutionalTNA, TNADeficit, TNASnapshotResponse } from '../../../src/types';
import { BENCHMARK } from '../../../src/constants';
import type { DbClient } from '../db/pool';
import { canonicalJson, sha256Hex } from '../lib/crypto';
import { criteriaAveragesFrom, loadActiveRubric, type ActiveRubric } from './metrics';

/**
 * Macro-level (Department / Institution) Training Needs Analysis.
 *
 * Results are persisted as snapshots keyed by Academic Term and an input
 * fingerprint, so repeated views reuse the stored analysis until evaluations or
 * the rubric change. Individual faculty insights are NOT produced here; they
 * use deterministic templates on the client (see src/utils/tnaEngine.ts).
 * Student comments are only classified, never rewritten (RA 10173 / FES policy).
 */
const ENGINE_VERSION = 'fes-tna-2026.1';

const POSITIVE_KEYWORDS = ['excellent', 'great', 'good', 'engaging', 'clear', 'helpful', 'passionate', 'organized', 'approachable', 'fair'];
const NEGATIVE_KEYWORDS = ['poor', 'bad', 'confusing', 'unclear', 'unfair', 'disorganized', 'boring', 'overwhelming', 'too fast', 'late'];

interface Department {
  id: string;
  name: string;
}

interface DepartmentInputs {
  submissions: number;
  lastSubmittedAt: string | null;
  indicatorAvg: Map<string, number>;
  ratingSum: number;
  ratingCount: number;
  feedback: string[];
}

async function loadDepartmentInputs(client: DbClient, termId: string, departmentId: string): Promise<DepartmentInputs> {
  const [meta, indicators, feedback] = await Promise.all([
    client.query(
      `SELECT count(*)::int AS n, max(e.submitted_at) AS last
         FROM evaluations e JOIN faculty f ON f.id = e.faculty_id
        WHERE e.term_id = $1 AND f.department_id = $2`,
      [termId, departmentId],
    ),
    client.query(
      `SELECT r.indicator_id, sum(r.rating)::int AS total, count(*)::int AS n
         FROM evaluations e
         JOIN faculty f ON f.id = e.faculty_id
         JOIN evaluation_ratings r ON r.evaluation_id = e.id
        WHERE e.term_id = $1 AND f.department_id = $2
        GROUP BY r.indicator_id`,
      [termId, departmentId],
    ),
    client.query(
      `SELECT e.feedback
         FROM evaluations e JOIN faculty f ON f.id = e.faculty_id
        WHERE e.term_id = $1 AND f.department_id = $2 AND e.feedback <> ''
        ORDER BY e.submitted_at`,
      [termId, departmentId],
    ),
  ]);
  return {
    submissions: meta.rows[0].n,
    lastSubmittedAt: meta.rows[0].last ? new Date(meta.rows[0].last).toISOString() : null,
    indicatorAvg: new Map(indicators.rows.map(r => [r.indicator_id, r.total / r.n])),
    ratingSum: indicators.rows.reduce((s, r) => s + r.total, 0),
    ratingCount: indicators.rows.reduce((s, r) => s + r.n, 0),
    feedback: feedback.rows.map(r => r.feedback as string),
  };
}

function fingerprintOf(parts: unknown): string {
  return sha256Hex(canonicalJson({ engine: ENGINE_VERSION, benchmark: BENCHMARK, ...(parts as object) }));
}

function buildDepartmentTNA(department: string, termId: string, rubric: ActiveRubric, inputs: DepartmentInputs): DepartmentTNA {
  const criteriaAverages = criteriaAveragesFrom(rubric, inputs.indicatorAvg);

  const deficits: TNADeficit[] = inputs.submissions === 0 ? [] : rubric.criteria
    .map(criterion => {
      const average = criteriaAverages[criterion.id] ?? 0;
      const deficit = BENCHMARK - average;
      const severity: TNADeficit['severity'] = deficit >= 1.5 ? 'critical' : deficit >= 0.8 ? 'high' : 'medium';
      const subQuestionDeficits = rubric.indicators
        .filter(i => i.criterionId === criterion.id)
        .map(i => {
          const avg = inputs.indicatorAvg.get(i.id) ?? 0;
          return { subQuestionId: i.id, subQuestionText: i.text, average: avg, deficit: BENCHMARK - avg };
        })
        .filter(i => i.average > 0 && i.deficit > 0);
      return { criterionId: criterion.id, criterionName: criterion.name, average, deficit, severity, subQuestionDeficits };
    })
    .filter(d => d.average > 0 && d.deficit > 0);

  const lower = inputs.feedback.map(f => f.toLowerCase());
  const positive = inputs.feedback.filter((_, i) => POSITIVE_KEYWORDS.some(k => lower[i].includes(k)));
  const negative = inputs.feedback.filter((_, i) => NEGATIVE_KEYWORDS.some(k => lower[i].includes(k)));
  const sentimentRatio = inputs.feedback.length > 0 ? (positive.length / inputs.feedback.length) * 100 : 0;

  const immediate: string[] = [];
  const shortTerm: string[] = [];
  const longTerm: string[] = [];
  for (const d of deficits) {
    if (d.severity === 'critical') immediate.push(`Critical: Department-wide training on ${d.criterionName} (avg ${d.average.toFixed(2)})`);
    else if (d.severity === 'high') shortTerm.push(`High priority: Faculty development workshop on ${d.criterionName} (avg ${d.average.toFixed(2)})`);
    else longTerm.push(`Monitor: ${d.criterionName} (avg ${d.average.toFixed(2)}) through peer observation`);
  }
  if (inputs.feedback.length >= 5 && sentimentRatio < 50) immediate.push('Low student sentiment detected — schedule a department-wide feedback review');
  if (immediate.length === 0) immediate.push('No immediate actions required');
  if (shortTerm.length === 0) shortTerm.push('Continue current practices');
  if (longTerm.length === 0) longTerm.push('Maintain quality standards');

  const priorityScore = deficits.reduce((s, d) => s + d.deficit * (d.severity === 'critical' ? 3 : d.severity === 'high' ? 2 : 1), 0);

  return {
    department,
    cycleId: termId,
    generatedAt: new Date().toISOString(),
    overallAverage: inputs.ratingCount > 0 ? inputs.ratingSum / inputs.ratingCount : 0,
    totalSubmissions: inputs.submissions,
    deficits,
    feedbackThemes: { positive: positive.slice(0, 5), negative: negative.slice(0, 5), sentimentRatio },
    recommendations: { immediate, shortTerm, longTerm },
    priorityScore,
  };
}

interface SnapshotRow {
  input_fingerprint: string;
  payload: unknown;
  generated_at: Date;
}

async function readSnapshot(client: DbClient, scope: 'department' | 'institution', termId: string, departmentId: string | null): Promise<SnapshotRow | null> {
  const { rows } = await client.query<SnapshotRow>(
    `SELECT input_fingerprint, payload, generated_at FROM tna_snapshots
      WHERE scope = $1 AND term_id = $2 AND COALESCE(department_id, '') = COALESCE($3, '')`,
    [scope, termId, departmentId],
  );
  return rows[0] ?? null;
}

async function writeSnapshot(
  client: DbClient,
  scope: 'department' | 'institution',
  termId: string,
  departmentId: string | null,
  fingerprint: string,
  payload: unknown,
  userId: string | null,
): Promise<Date> {
  const { rows } = await client.query<{ generated_at: Date }>(
    `INSERT INTO tna_snapshots (scope, term_id, department_id, input_fingerprint, payload, generated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (scope, term_id, (COALESCE(department_id, '')))
     DO UPDATE SET input_fingerprint = EXCLUDED.input_fingerprint, payload = EXCLUDED.payload,
                   generated_at = now(), generated_by = EXCLUDED.generated_by
     RETURNING generated_at`,
    [scope, termId, departmentId, fingerprint, JSON.stringify(payload), userId],
  );
  return rows[0].generated_at;
}

export async function getDepartmentTNA(
  client: DbClient,
  termId: string,
  department: Department,
  userId: string | null,
  force = false,
): Promise<TNASnapshotResponse<DepartmentTNA>> {
  const rubric = await loadActiveRubric(client);
  const inputs = await loadDepartmentInputs(client, termId, department.id);
  const fingerprint = fingerprintOf({
    termId,
    department: department.id,
    submissions: inputs.submissions,
    lastSubmittedAt: inputs.lastSubmittedAt,
    rubric,
  });

  const existing = await readSnapshot(client, 'department', termId, department.id);
  if (existing && !force && existing.input_fingerprint === fingerprint) {
    return { snapshot: existing.payload as DepartmentTNA, generatedAt: existing.generated_at.toISOString(), cached: true, fingerprint };
  }
  const snapshot = buildDepartmentTNA(department.name, termId, rubric, inputs);
  const generatedAt = await writeSnapshot(client, 'department', termId, department.id, fingerprint, snapshot, userId);
  return { snapshot, generatedAt: generatedAt.toISOString(), cached: false, fingerprint };
}

export async function getInstitutionalTNA(client: DbClient, termId: string, userId: string | null, force = false): Promise<TNASnapshotResponse<InstitutionalTNA>> {
  const { rows: departments } = await client.query<Department>('SELECT id, name FROM departments ORDER BY name');
  const departmentResults = [];
  for (const d of departments) departmentResults.push(await getDepartmentTNA(client, termId, d, userId, force));
  const fingerprint = fingerprintOf({ termId, departments: departmentResults.map(r => r.fingerprint) });

  const existing = await readSnapshot(client, 'institution', termId, null);
  if (existing && !force && existing.input_fingerprint === fingerprint) {
    return { snapshot: existing.payload as InstitutionalTNA, generatedAt: existing.generated_at.toISOString(), cached: true, fingerprint };
  }

  const departmentTNAs = departmentResults.map(r => r.snapshot);
  const totalSubmissions = departmentTNAs.reduce((s, d) => s + d.totalSubmissions, 0);
  const institutionalAverage = totalSubmissions > 0
    ? departmentTNAs.reduce((s, d) => s + d.overallAverage * d.totalSubmissions, 0) / totalSubmissions
    : 0;
  const criticalDepartments = departmentTNAs.filter(d => d.deficits.some(x => x.severity === 'critical')).map(d => d.department);

  const deficitCounts = new Map<string, number>();
  for (const d of departmentTNAs) for (const x of d.deficits) deficitCounts.set(x.criterionName, (deficitCounts.get(x.criterionName) ?? 0) + 1);
  const sharedWeaknesses = [...deficitCounts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);
  const strengths = [...new Set(departmentTNAs.flatMap(d => d.feedbackThemes.positive))].slice(0, 5);
  const weaknesses = [...new Set(departmentTNAs.flatMap(d => d.feedbackThemes.negative))].slice(0, 5);

  const institutionWide: string[] = [];
  if (criticalDepartments.length > 0) institutionWide.push(`Prioritize development resources for: ${criticalDepartments.join(', ')}`);
  if (sharedWeaknesses.length > 0) institutionWide.push(`Institution-wide training program on: ${sharedWeaknesses.join(', ')}`);
  institutionWide.push('Sustain the faculty development program and cross-department peer mentoring');

  const departmentSpecific: Record<string, string[]> = {};
  for (const d of departmentTNAs) departmentSpecific[d.department] = [...d.recommendations.immediate, ...d.recommendations.shortTerm];

  const snapshot: InstitutionalTNA = {
    cycleId: termId,
    generatedAt: new Date().toISOString(),
    departments: departmentTNAs,
    institutionalAverage,
    totalSubmissions,
    criticalDepartments,
    crossDepartmentalThemes: { strengths, weaknesses },
    strategicRecommendations: { institutionWide, departmentSpecific },
  };
  const generatedAt = await writeSnapshot(client, 'institution', termId, null, fingerprint, snapshot, userId);
  return { snapshot, generatedAt: generatedAt.toISOString(), cached: false, fingerprint };
}
