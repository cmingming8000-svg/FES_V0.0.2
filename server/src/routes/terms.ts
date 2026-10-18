import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AgreementSummary } from '../../../src/types';
import { DEAN_OVERSIGHT_WINDOW_DAYS } from '../../../src/constants';
import { config } from '../config';
import { pool, withTransaction, type DbClient } from '../db/pool';
import { badRequest, clientIp, conflict, forbidden, notFound, parseBody, userAgent } from '../lib/http';
import { actorFor, contextFor, requireRole } from '../middleware/auth';
import { signAgreement, toSummary } from '../services/agreements';
import { AuditService } from '../services/audit';
import { sendMailInBackground } from '../services/mail';

export const termsRouter = Router();

const termSchema = z.object({
  name: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(v => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

const signatureSchema = z.object({
  signature: z.string().min(1).max(600_000),
  accepted: z.literal(true, { errorMap: () => ({ message: 'You must accept the agreement terms' }) }),
  comments: z.string().trim().max(2000).optional(),
});

async function lockTerm(client: DbClient, id: string) {
  const term = (await client.query(`SELECT id, name, display_name, status FROM academic_terms WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!term) throw notFound('Academic Term not found');
  return term as { id: string; name: string; display_name: string; status: string };
}

termsRouter.post('/', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const body = parseBody(termSchema, req);
  const id = `term-${randomUUID().slice(0, 8)}`;
  await withTransaction(contextFor(user), async client => {
    await client.query(
      `INSERT INTO academic_terms (id, name, display_name, start_date, end_date, status) VALUES ($1, $2, $3, $4, $5, 'upcoming')`,
      [id, body.name, body.displayName, body.startDate, body.endDate],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'term_created', targetType: 'academic_term', targetId: id, newValue: body,
      details: `Created Academic Term "${body.displayName}"`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(201).json({ id });
});

termsRouter.post('/:id/activate', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  await withTransaction(contextFor(user), async client => {
    await client.query(`SELECT id FROM academic_terms WHERE status = 'active' FOR UPDATE`);
    const term = await lockTerm(client, req.params.id);
    if (term.status === 'active') return;
    if (term.status === 'archived') throw conflict('Unarchive the Academic Term before activating it.');
    const previous = (await client.query(`UPDATE academic_terms SET status = 'completed' WHERE status = 'active' RETURNING id, display_name`)).rows[0];
    await client.query(`UPDATE academic_terms SET status = 'active' WHERE id = $1`, [term.id]);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'term_activated', targetType: 'academic_term', targetId: term.id,
      oldValue: { status: term.status, previouslyActive: previous?.id ?? null }, newValue: { status: 'active' },
      details: `Activated "${term.display_name}"${previous ? `; "${previous.display_name}" marked completed` : ''}`,
      ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(204).end();
});

for (const [action, from, to] of [['archive', null, 'archived'], ['unarchive', 'archived', 'completed']] as const) {
  termsRouter.post(`/:id/${action}`, async (req, res) => {
    const user = requireRole(req, 'hr_qa');
    await withTransaction(contextFor(user), async client => {
      const term = await lockTerm(client, req.params.id);
      if (from && term.status !== from) throw conflict(`Only ${from} Academic Terms can be ${action}d.`);
      if (action === 'archive' && term.status === 'active') throw conflict('Activate another Academic Term before archiving the active one.');
      await client.query('UPDATE academic_terms SET status = $2 WHERE id = $1', [term.id, to]);
      await AuditService.record(client, {
        actor: actorFor(user), action: `term_${action}d`, targetType: 'academic_term', targetId: term.id,
        oldValue: { status: term.status }, newValue: { status: to }, details: `${action === 'archive' ? 'Archived' : 'Unarchived'} "${term.display_name}"`,
        ip: clientIp(req), userAgent: userAgent(req),
      });
    });
    res.status(204).end();
  });
}

termsRouter.delete('/:id', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  await withTransaction(contextFor(user), async client => {
    const term = await lockTerm(client, req.params.id);
    if (term.status === 'active') throw conflict('The active Academic Term cannot be removed.');
    const usage = (await client.query(
      `SELECT (SELECT count(*) FROM evaluations WHERE term_id = $1)::int AS evaluations,
              (SELECT count(*) FROM agreements WHERE term_id = $1)::int AS agreements`,
      [term.id],
    )).rows[0];
    if (usage.evaluations > 0 || usage.agreements > 0) {
      throw conflict('This Academic Term has evaluation or signature records and cannot be removed. Archive it instead.');
    }
    await client.query('DELETE FROM tna_snapshots WHERE term_id = $1', [term.id]);
    await client.query('DELETE FROM academic_terms WHERE id = $1', [term.id]);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'term_removed', targetType: 'academic_term', targetId: term.id,
      oldValue: term, details: `Removed "${term.display_name}"`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Tier 1 — HR / QA Release: immediately grants faculty access to their results.
// ---------------------------------------------------------------------------
termsRouter.post('/:id/release', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const body = parseBody(signatureSchema, req);
  const summary = await withTransaction(contextFor(user), async client => {
    const term = await lockTerm(client, req.params.id);
    if (term.status === 'upcoming') throw conflict('An upcoming Academic Term cannot be released.');
    if ((await client.query('SELECT 1 FROM hr_qa_releases WHERE term_id = $1', [term.id])).rowCount) {
      throw conflict('This Academic Term has already been released by HR / QA.');
    }
    const agreement = await signAgreement(client, {
      type: 'hr_qa_release', term: { id: term.id, displayName: term.display_name }, signer: user,
      signaturePng: body.signature, ip: clientIp(req), userAgent: userAgent(req),
    });
    await client.query(
      'INSERT INTO hr_qa_releases (term_id, released_by, released_at, agreement_id) VALUES ($1, $2, $3, $4)',
      [term.id, user.id, agreement.signed_at, agreement.id],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'hr_qa_release', targetType: 'academic_term', targetId: term.id,
      newValue: { trackingId: agreement.tracking_id, documentHash: agreement.document_hash },
      details: `HR / QA released "${term.display_name}" with e-signature; faculty access granted`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return toSummary(agreement);
  });
  notifyFacultyOfRelease(summary).catch(err => console.error('Release notification failed:', err));
  res.status(201).json(summary);
});

async function notifyFacultyOfRelease(summary: AgreementSummary): Promise<void> {
  const { rows } = await pool.query(`SELECT email, display_name FROM users WHERE role IN ('faculty', 'dean') AND is_active AND email IS NOT NULL`);
  for (const r of rows) {
    sendMailInBackground({
      to: r.email,
      subject: `FES results released — ${summary.termDisplayName}`,
      text: `Hello ${r.display_name},\n\nEvaluation results for ${summary.termDisplayName} have been released by HR / QA and are now available in FES:\n${config.appBaseUrl}/\n`,
    });
  }
}

// ---------------------------------------------------------------------------
// Tier 2 — Dean's Oversight Sign-Off (7-day review window; never gates faculty access).
// ---------------------------------------------------------------------------
termsRouter.post('/:id/oversight-signoff', async (req, res) => {
  const user = requireRole(req, 'dean');
  const body = parseBody(signatureSchema, req);
  if (!user.departmentId) throw forbidden('Your account is not assigned to a department.');
  const summary = await withTransaction(contextFor(user), async client => {
    const term = await lockTerm(client, req.params.id);
    const release = (await client.query('SELECT released_at FROM hr_qa_releases WHERE term_id = $1', [term.id])).rows[0];
    if (!release) throw conflict('HR / QA has not released this Academic Term yet.');
    if ((await client.query('SELECT 1 FROM dean_oversight_signoffs WHERE term_id = $1 AND department_id = $2', [term.id, user.departmentId])).rowCount) {
      throw conflict("The Dean's Oversight Sign-Off for this department and term is already on file.");
    }
    const agreement = await signAgreement(client, {
      type: 'dean_oversight_signoff', term: { id: term.id, displayName: term.display_name }, signer: user,
      departmentId: user.departmentId, departmentName: user.departmentName, signaturePng: body.signature,
      ip: clientIp(req), userAgent: userAgent(req),
    });
    await client.query(
      'INSERT INTO dean_oversight_signoffs (term_id, department_id, signed_by, signed_at, comments, agreement_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [term.id, user.departmentId, user.id, agreement.signed_at, body.comments || null, agreement.id],
    );
    const daysAfterRelease = (agreement.signed_at.getTime() - new Date(release.released_at).getTime()) / 86_400_000;
    await AuditService.record(client, {
      actor: actorFor(user), action: 'dean_oversight_signoff', targetType: 'academic_term', targetId: term.id,
      newValue: { department: user.departmentName, trackingId: agreement.tracking_id, documentHash: agreement.document_hash, withinWindow: daysAfterRelease <= DEAN_OVERSIGHT_WINDOW_DAYS },
      details: `Dean's Oversight Sign-Off for ${user.departmentName} (${daysAfterRelease.toFixed(1)} days after release)`,
      ip: clientIp(req), userAgent: userAgent(req),
    });
    return toSummary(agreement);
  });
  res.status(201).json(summary);
});

// ---------------------------------------------------------------------------
// Faculty acknowledgment of results.
// ---------------------------------------------------------------------------
termsRouter.post('/:id/acknowledge', async (req, res) => {
  const user = requireRole(req, 'faculty');
  const body = parseBody(signatureSchema, req);
  if (!user.facultyId) throw forbidden('Your account is not linked to a faculty record.');
  const summary = await withTransaction(contextFor(user), async client => {
    const term = await lockTerm(client, req.params.id);
    if (!(await client.query('SELECT 1 FROM hr_qa_releases WHERE term_id = $1', [term.id])).rowCount) {
      throw conflict('Results for this Academic Term have not been released yet.');
    }
    if ((await client.query('SELECT 1 FROM faculty_acknowledgments WHERE term_id = $1 AND faculty_id = $2', [term.id, user.facultyId])).rowCount) {
      throw conflict('You have already acknowledged your results for this Academic Term.');
    }
    const faculty = (await client.query('SELECT name, department_id FROM faculty WHERE id = $1', [user.facultyId])).rows[0];
    const agreement = await signAgreement(client, {
      type: 'faculty_acknowledgment', term: { id: term.id, displayName: term.display_name }, signer: user,
      departmentId: faculty.department_id, departmentName: user.departmentName, facultyId: user.facultyId, facultyName: faculty.name,
      signaturePng: body.signature, ip: clientIp(req), userAgent: userAgent(req),
    });
    await client.query(
      'INSERT INTO faculty_acknowledgments (term_id, faculty_id, acknowledged_by, acknowledged_at, agreement_id) VALUES ($1, $2, $3, $4, $5)',
      [term.id, user.facultyId, user.id, agreement.signed_at, agreement.id],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'faculty_acknowledgment', targetType: 'faculty', targetId: user.facultyId!,
      newValue: { termId: term.id, trackingId: agreement.tracking_id, documentHash: agreement.document_hash },
      details: `Faculty acknowledged results for "${term.display_name}" with e-signature`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return toSummary(agreement);
  });
  res.status(201).json(summary);
});

// ---------------------------------------------------------------------------
// Acknowledgment reminders (Dean for own department, or HR / QA).
// ---------------------------------------------------------------------------
termsRouter.post('/:id/reminders', async (req, res) => {
  const user = requireRole(req, 'dean', 'hr_qa');
  const { facultyId } = parseBody(z.object({ facultyId: z.string().min(1).max(32) }), req);
  await withTransaction(contextFor(user), async client => {
    const term = await lockTerm(client, req.params.id);
    const faculty = (await client.query(
      `SELECT f.id, f.name, f.department_id, u.email FROM faculty f LEFT JOIN users u ON u.faculty_id = f.id WHERE f.id = $1`,
      [facultyId],
    )).rows[0];
    if (!faculty) throw notFound('Faculty not found');
    if (user.role === 'dean' && faculty.department_id !== user.departmentId) throw forbidden();
    if ((await client.query('SELECT 1 FROM faculty_acknowledgments WHERE term_id = $1 AND faculty_id = $2', [term.id, facultyId])).rowCount) {
      throw badRequest('This faculty member has already acknowledged their results.');
    }
    await client.query('INSERT INTO acknowledgment_reminders (term_id, faculty_id, sent_by) VALUES ($1, $2, $3)', [term.id, facultyId, user.id]);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'reminder_sent', targetType: 'faculty', targetId: facultyId,
      details: `Acknowledgment reminder sent to ${faculty.name} for "${term.display_name}"`, ip: clientIp(req), userAgent: userAgent(req),
    });
    if (faculty.email) {
      sendMailInBackground({
        to: faculty.email,
        subject: `Reminder: acknowledge your evaluation results — ${term.display_name}`,
        text: `Hello ${faculty.name},\n\nThis is a reminder to review and acknowledge your evaluation results for ${term.display_name} in FES:\n${config.appBaseUrl}/\n`,
      });
    }
  });
  res.status(204).end();
});
