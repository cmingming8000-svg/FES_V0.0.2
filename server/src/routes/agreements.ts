import { Router } from 'express';
import { z } from 'zod';
import { SYSTEM_CONTEXT, withTransaction } from '../db/pool';
import { forbidden, notFound, parseQuery } from '../lib/http';
import { contextFor, requireAuth } from '../middleware/auth';
import { AGREEMENT_SELECT, ROLE_FOR_AGREEMENT, getAgreement, renderTemplate, verifyAgreementRow, type AgreementRow } from '../services/agreements';
import { renderAgreementReceipt } from '../services/receiptPdf';
import type { AuthUser } from '../security/sessions';

export const agreementsRouter = Router();

const typeSchema = z.enum(['hr_qa_release', 'dean_oversight_signoff', 'faculty_acknowledgment']);

/** The exact, current terms a user will be asked to sign. */
agreementsRouter.get('/template/:type', async (req, res) => {
  const { user } = requireAuth(req);
  const parsedType = typeSchema.safeParse(req.params.type);
  if (!parsedType.success) throw notFound('Unknown agreement type');
  const type = parsedType.data;
  if (ROLE_FOR_AGREEMENT[type] !== user.role) throw forbidden();
  const { cycleId } = parseQuery(z.object({ cycleId: z.string().min(1).max(64) }), req);
  const ctx = await withTransaction(contextFor(user), async client => {
    const term = (await client.query('SELECT display_name FROM academic_terms WHERE id = $1', [cycleId])).rows[0];
    if (!term) throw notFound('Academic Term not found');
    const faculty = user.facultyId ? (await client.query('SELECT name FROM faculty WHERE id = $1', [user.facultyId])).rows[0] : null;
    return { termDisplayName: term.display_name as string, department: user.departmentName ?? undefined, facultyName: faculty?.name };
  });
  res.json(renderTemplate(type, ctx));
});

function canAccess(user: AuthUser, a: AgreementRow): boolean {
  if (user.role === 'hr_qa' || a.signer_user_id === user.id) return true;
  return user.role === 'dean' && !!a.department_id && a.department_id === user.departmentId;
}

agreementsRouter.get('/:id/receipt.pdf', async (req, res) => {
  const { user } = requireAuth(req);
  if (!z.string().uuid().safeParse(req.params.id).success) throw notFound('Agreement not found');
  const agreement = await withTransaction(contextFor(user), client => getAgreement(client, req.params.id));
  if (!agreement || !canAccess(user, agreement)) throw notFound('Agreement not found');
  const pdf = renderAgreementReceipt(agreement);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${agreement.tracking_id}.pdf"`,
    'Content-Length': String(pdf.length),
  });
  res.send(pdf);
});

/** Recomputes the SHA-256 document hash to confirm a receipt has not been altered. */
agreementsRouter.get('/verify/:trackingId', async (req, res) => {
  requireAuth(req);
  const trackingId = z.string().regex(/^FES-\d{10,16}-[0-9A-F]{12}$/).safeParse(req.params.trackingId);
  if (!trackingId.success) throw notFound('No agreement with that Tracking ID');
  const agreement = await withTransaction(SYSTEM_CONTEXT, async client =>
    (await client.query<AgreementRow>(`${AGREEMENT_SELECT} WHERE a.tracking_id = $1`, [trackingId.data])).rows[0] ?? null,
  );
  if (!agreement) throw notFound('No agreement with that Tracking ID');
  res.json(verifyAgreementRow(agreement));
});
