import type {
  AgreementSummary, BootstrapPayload, Criterion, DeanRelease, Evaluation, EvaluationCycle, Faculty, Program,
  PublicUser, Student, SubQuestion, Subject, TermStats, TNATemplate,
} from '../../../src/types';
import { SYSTEM_CONTEXT, withTransaction, type DbClient } from '../db/pool';
import { contextFor } from '../middleware/auth';
import type { AuthUser } from '../security/sessions';
import { AGREEMENT_SELECT, toSummary } from './agreements';
import { computeTermStats } from './metrics';

export function toPublicUser(u: AuthUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    institutionalId: u.institutionalId,
    email: u.email ?? undefined,
    facultyId: u.facultyId ?? undefined,
    studentId: u.studentId ?? undefined,
    department: u.departmentName ?? undefined,
  };
}

async function loadTerms(client: DbClient, user: AuthUser): Promise<EvaluationCycle[]> {
  const { rows } = await client.query(
    `SELECT t.id, t.name, t.display_name, t.start_date, t.end_date, t.status,
            r.released_at, ru.display_name AS released_by
       FROM academic_terms t
       LEFT JOIN hr_qa_releases r ON r.term_id = t.id
       LEFT JOIN users ru ON ru.id = r.released_by
      ORDER BY t.start_date DESC`,
  );
  const signoffs = user.role === 'hr_qa' || user.role === 'dean'
    ? (await client.query(
        `SELECT s.term_id, d.name AS department, s.signed_at, u.display_name, s.comments
           FROM dean_oversight_signoffs s
           JOIN departments d ON d.id = s.department_id
           JOIN users u ON u.id = s.signed_by
          WHERE $1::text IS NULL OR s.department_id = $1`,
        [user.role === 'dean' ? user.departmentId : null],
      )).rows
    : [];

  return rows
    .filter(r => user.role !== 'student' || r.status === 'active')
    .map(r => {
      const deanReleases: Record<string, DeanRelease> = {};
      for (const s of signoffs.filter(s => s.term_id === r.id)) {
        deanReleases[s.department] = { signedOffAt: s.signed_at.toISOString(), signedOffBy: s.display_name, comments: s.comments ?? undefined };
      }
      return {
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        verificationStatus: r.released_at ? 'released' : undefined,
        adminRelease: r.released_at && user.role !== 'student'
          ? { releasedAt: r.released_at.toISOString(), releasedBy: r.released_by, termId: r.id }
          : undefined,
        deanReleases,
      } satisfies EvaluationCycle;
    });
}

async function loadRubric(client: DbClient): Promise<{ criteria: Criterion[]; subQuestions: SubQuestion[] }> {
  const criteria = await client.query(`SELECT id, name, sort_order FROM criteria WHERE archived_at IS NULL ORDER BY sort_order, name`);
  const indicators = await client.query(
    `SELECT i.id, i.criterion_id, i.text, i.sort_order
       FROM performance_indicators i JOIN criteria c ON c.id = i.criterion_id AND c.archived_at IS NULL
      WHERE i.archived_at IS NULL ORDER BY i.criterion_id, i.sort_order`,
  );
  return {
    criteria: criteria.rows.map(r => ({ id: r.id, name: r.name, order: r.sort_order })),
    subQuestions: indicators.rows.map(r => ({ id: r.id, criterionId: r.criterion_id, text: r.text, order: r.sort_order })),
  };
}

async function loadFaculty(client: DbClient, user: AuthUser, activeTermId: string | null, subjectFacultyIds: string[]): Promise<Faculty[]> {
  const scope =
    user.role === 'hr_qa' ? { clause: 'TRUE', params: [] as unknown[] }
    : user.role === 'dean' ? { clause: 'f.department_id = $2', params: [user.departmentId] }
    : user.role === 'faculty' ? { clause: 'f.id = $2', params: [user.facultyId] }
    : { clause: 'f.id = ANY($2)', params: [subjectFacultyIds] };

  const { rows } = await client.query(
    `SELECT f.id, f.name, f.title, d.name AS department,
            COALESCE(array_agg(fc.subject_id ORDER BY fc.subject_id) FILTER (WHERE fc.subject_id IS NOT NULL), '{}') AS courses,
            a.acknowledged_at, au.display_name AS acknowledged_by,
            (SELECT max(ar.sent_at) FROM acknowledgment_reminders ar WHERE ar.faculty_id = f.id AND ar.term_id = $1) AS last_reminder
       FROM faculty f
       JOIN departments d ON d.id = f.department_id
       LEFT JOIN faculty_courses fc ON fc.faculty_id = f.id
       LEFT JOIN faculty_acknowledgments a ON a.faculty_id = f.id AND a.term_id = $1
       LEFT JOIN users au ON au.id = a.acknowledged_by
      WHERE ${scope.clause}
      GROUP BY f.id, d.name, a.acknowledged_at, au.display_name
      ORDER BY f.name`,
    [activeTermId, ...scope.params],
  );

  return rows.map(r => {
    if (user.role === 'student') {
      return { id: r.id, name: r.name, department: r.department, title: r.title, courses: [], acknowledgmentStatus: 'pending_review' as const };
    }
    return {
      id: r.id,
      name: r.name,
      department: r.department,
      title: r.title,
      courses: r.courses,
      acknowledgmentStatus: r.acknowledged_at ? 'acknowledged' as const : 'pending_review' as const,
      acknowledgedAt: r.acknowledged_at?.toISOString(),
      acknowledgedBy: r.acknowledged_by ?? undefined,
      lastReminderSent: r.last_reminder?.toISOString(),
    };
  });
}

/** Evaluations visible to the user for the given terms (RLS enforces the same rules in the database). */
export async function loadEvaluations(client: DbClient, user: AuthUser, termIds: string[]): Promise<Evaluation[]> {
  if (user.role === 'student' || termIds.length === 0) return [];
  const scope =
    user.role === 'hr_qa' ? { clause: 'TRUE', params: [] as unknown[] }
    : user.role === 'dean' ? { clause: 'f.department_id = $2', params: [user.departmentId] }
    : { clause: 'e.faculty_id = $2', params: [user.facultyId] };

  const { rows } = await client.query(
    `SELECT e.id, e.faculty_id, e.subject_id, e.term_id, e.feedback, e.submitted_at, e.student_id,
            COALESCE(json_object_agg(r.indicator_id, r.rating) FILTER (WHERE r.indicator_id IS NOT NULL), '{}'::json) AS ratings
       FROM evaluations e
       JOIN faculty f ON f.id = e.faculty_id
       LEFT JOIN evaluation_ratings r ON r.evaluation_id = e.id
      WHERE e.term_id = ANY($1) AND ${scope.clause}
      GROUP BY e.id
      ORDER BY e.submitted_at`,
    [termIds, ...scope.params],
  );
  return rows.map(r => ({
    id: r.id,
    facultyId: r.faculty_id,
    courseId: r.subject_id,
    cycleId: r.term_id,
    ratings: r.ratings,
    feedback: r.feedback,
    submittedAt: r.submitted_at.toISOString(),
    ...(user.role === 'hr_qa' && r.student_id ? { studentId: r.student_id } : {}),
  }));
}

async function releasedTermIds(client: DbClient, termIds: string[]): Promise<string[]> {
  const { rows } = await client.query('SELECT term_id FROM hr_qa_releases WHERE term_id = ANY($1)', [termIds]);
  return rows.map(r => r.term_id);
}

export async function loadTermStatsFor(user: AuthUser, termIds: string[]): Promise<Record<string, TermStats>> {
  if (user.role !== 'dean' && user.role !== 'faculty') return {};
  return withTransaction(SYSTEM_CONTEXT, async client => {
    const released = await releasedTermIds(client, termIds);
    return computeTermStats(client, released, user.role === 'faculty' ? user.facultyId : null);
  });
}

export async function loadBootstrap(user: AuthUser, requestedTermId?: string): Promise<BootstrapPayload> {
  const payload = await withTransaction(contextFor(user), async client => {
    const departments = (await client.query('SELECT name FROM departments ORDER BY name')).rows.map(r => r.name as string);
    const cycles = await loadTerms(client, user);
    const activeTermId = cycles.find(c => c.status === 'active')?.id ?? null;
    const loadedCycleIds = [...new Set([activeTermId, requestedTermId].filter((id): id is string => !!id && cycles.some(c => c.id === id)))];
    const { criteria, subQuestions } = await loadRubric(client);

    const programs: Program[] = (await client.query(
      `SELECT p.id, p.name, d.name AS department FROM programs p JOIN departments d ON d.id = p.department_id ORDER BY p.name`,
    )).rows.map(r => ({ id: r.id, name: r.name, department: r.department }));

    const subjectScope =
      user.role === 'hr_qa' ? { clause: 'TRUE', params: [] as unknown[] }
      : user.role === 'dean' ? { clause: 'f.department_id = $1', params: [user.departmentId] }
      : user.role === 'faculty' ? { clause: 's.id IN (SELECT subject_id FROM faculty_courses WHERE faculty_id = $1)', params: [user.facultyId] }
      : { clause: 's.id IN (SELECT subject_id FROM student_enrollments WHERE student_id = $1)', params: [user.studentId] };
    const subjects: Subject[] = (await client.query(
      `SELECT s.id, s.code, s.name, s.program_id, s.faculty_id FROM subjects s JOIN faculty f ON f.id = s.faculty_id
        WHERE ${subjectScope.clause} ORDER BY s.code`,
      subjectScope.params,
    )).rows.map(r => ({ id: r.id, code: r.code, name: r.name, programId: r.program_id, facultyId: r.faculty_id }));

    const faculty = await loadFaculty(client, user, activeTermId, [...new Set(subjects.map(s => s.facultyId))]);

    let students: Student[] = [];
    if (user.role === 'hr_qa' || user.role === 'student') {
      students = (await client.query(
        `SELECT s.id, s.name, s.program_id,
                COALESCE(array_agg(se.subject_id ORDER BY se.subject_id) FILTER (WHERE se.subject_id IS NOT NULL), '{}') AS subjects
           FROM students s LEFT JOIN student_enrollments se ON se.student_id = s.id
          WHERE $1::text IS NULL OR s.id = $1
          GROUP BY s.id ORDER BY s.id`,
        [user.role === 'student' ? user.studentId : null],
      )).rows.map(r => ({ id: r.id, name: r.name, programId: r.program_id, enrolledSubjects: r.subjects }));
    }

    const evaluations = await loadEvaluations(client, user, loadedCycleIds);

    let agreements: AgreementSummary[] = [];
    if (user.role !== 'student') {
      const scope =
        user.role === 'hr_qa' ? { clause: 'TRUE', params: [] as unknown[] }
        : user.role === 'dean' ? { clause: '(a.department_id = $1 OR a.signer_user_id = $2)', params: [user.departmentId, user.id] }
        : { clause: 'a.signer_user_id = $1', params: [user.id] };
      agreements = (await client.query(`${AGREEMENT_SELECT} WHERE ${scope.clause} ORDER BY a.signed_at DESC`, scope.params)).rows.map(toSummary);
    }

    const evaluatedSubjectIds = user.role === 'student' && activeTermId
      ? (await client.query('SELECT subject_id FROM evaluations WHERE term_id = $1 AND student_id = $2', [activeTermId, user.studentId])).rows.map(r => r.subject_id as string)
      : [];

    const tnaTemplates: TNATemplate[] = user.role === 'student' ? [] : (await client.query(
      'SELECT id, criterion_id, threshold, recommendation, sort_order FROM tna_templates ORDER BY criterion_id, sort_order',
    )).rows.map(r => ({ id: r.id, criterionId: r.criterion_id, threshold: r.threshold, recommendation: r.recommendation, order: r.sort_order }));

    return {
      user: toPublicUser(user),
      departments,
      programs,
      subjects,
      faculty,
      students,
      cycles,
      criteria,
      subQuestions,
      evaluations,
      loadedCycleIds,
      agreements,
      evaluatedSubjectIds,
      termStats: {},
      tnaTemplates,
    } satisfies BootstrapPayload;
  });

  payload.termStats = await loadTermStatsFor(user, payload.loadedCycleIds);
  return payload;
}
