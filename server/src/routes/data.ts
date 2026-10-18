import { Router } from 'express';
import { z } from 'zod';
import { stripPII } from '../../../src/utils/pii';
import { pool, withTransaction } from '../db/pool';
import { badRequest, clientIp, conflict, notFound, parseBody, parseQuery, userAgent } from '../lib/http';
import { actorFor, contextFor, requireAuth, requireRole } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { loadBootstrap, loadEvaluations, loadTermStatsFor } from '../services/bootstrap';

export const dataRouter = Router();

const termQuery = z.object({ cycleId: z.string().max(64).optional() });

dataRouter.get('/bootstrap', async (req, res) => {
  const { user } = requireAuth(req);
  const { cycleId } = parseQuery(termQuery, req);
  res.json(await loadBootstrap(user, cycleId));
});

dataRouter.get('/evaluations', async (req, res) => {
  const user = requireRole(req, 'hr_qa', 'dean', 'faculty');
  const { cycleId } = parseQuery(z.object({ cycleId: z.string().min(1).max(64) }), req);
  const evaluations = await withTransaction(contextFor(user), client => loadEvaluations(client, user, [cycleId]));
  res.json({ cycleId, evaluations, termStats: await loadTermStatsFor(user, [cycleId]) });
});

dataRouter.get('/public/active-term', async (_req, res) => {
  const { rows } = await pool.query(`SELECT display_name FROM academic_terms WHERE status = 'active' LIMIT 1`);
  res.json({ displayName: rows[0]?.display_name ?? null });
});

// ---------------------------------------------------------------------------
// Student submission: Program → Subject → Professor (bound server-side)
// ---------------------------------------------------------------------------
const submissionSchema = z.object({
  subjectId: z.string().min(1).max(32),
  ratings: z.record(z.string().max(64), z.number().int().min(1).max(5)),
  feedback: z.string().max(2000).default(''),
});

dataRouter.post('/evaluations', async (req, res) => {
  const user = requireRole(req, 'student');
  const body = parseBody(submissionSchema, req);

  const result = await withTransaction(contextFor(user), async client => {
    const term = (await client.query(`SELECT id, display_name FROM academic_terms WHERE status = 'active' FOR SHARE`)).rows[0];
    if (!term) throw conflict('There is no active Academic Term open for evaluation.');
    const released = await client.query('SELECT 1 FROM hr_qa_releases WHERE term_id = $1', [term.id]);
    if (released.rowCount) throw conflict('Evaluations for this Academic Term are closed: results have been released by HR / QA.');

    const subject = (await client.query(
      `SELECT s.id, s.code, s.faculty_id, f.name AS faculty_name
         FROM subjects s
         JOIN faculty f ON f.id = s.faculty_id
         JOIN student_enrollments se ON se.subject_id = s.id AND se.student_id = $2
        WHERE s.id = $1`,
      [body.subjectId, user.studentId],
    )).rows[0];
    if (!subject) throw notFound('You are not enrolled in this subject.');

    const indicatorIds = (await client.query(
      `SELECT i.id FROM performance_indicators i JOIN criteria c ON c.id = i.criterion_id AND c.archived_at IS NULL WHERE i.archived_at IS NULL`,
    )).rows.map(r => r.id as string);
    const submitted = Object.keys(body.ratings);
    const missing = indicatorIds.filter(id => !(id in body.ratings));
    const unknown = submitted.filter(id => !indicatorIds.includes(id));
    if (missing.length || unknown.length) throw badRequest('Please rate every Performance Indicator exactly once.', { missing, unknown });

    // Comments stay verbatim; only the automated regex redactor is applied (RA 10173).
    const feedback = stripPII(body.feedback.trim());
    const evaluation = (await client.query(
      `INSERT INTO evaluations (term_id, faculty_id, subject_id, student_id, feedback) VALUES ($1, $2, $3, $4, $5) RETURNING id, submitted_at`,
      [term.id, subject.faculty_id, subject.id, user.studentId, feedback],
    )).rows[0];
    await client.query(
      `INSERT INTO evaluation_ratings (evaluation_id, indicator_id, rating) SELECT $1, unnest($2::text[]), unnest($3::smallint[])`,
      [evaluation.id, submitted, submitted.map(id => body.ratings[id])],
    );

    const values = Object.values(body.ratings);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'evaluation_submitted', targetType: 'evaluation', targetId: evaluation.id,
      newValue: { termId: term.id, subjectId: subject.id, facultyId: subject.faculty_id, studentId: user.studentId, average: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) },
      details: `Student ${user.studentId} evaluated ${subject.faculty_name} for ${subject.code}`,
      ip: clientIp(req), userAgent: userAgent(req),
    });
    return { id: evaluation.id as string, submittedAt: (evaluation.submitted_at as Date).toISOString() };
  });

  res.status(201).json(result);
});
