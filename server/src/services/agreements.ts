import type { AgreementSummary, AgreementTemplate, AgreementType, AgreementVerification, UserRole } from '../../../src/types';
import { DEAN_OVERSIGHT_WINDOW_DAYS } from '../../../src/constants';
import type { DbClient } from '../db/pool';
import { badRequest } from '../lib/http';
import { canonicalJson, sha256Hex } from '../lib/crypto';
import type { AuthUser } from '../security/sessions';

interface TemplateContext {
  termDisplayName: string;
  department?: string;
  facultyName?: string;
}

const TEMPLATES: Record<AgreementType, { version: string; title: string; clauses: (ctx: TemplateContext) => string[] }> = {
  hr_qa_release: {
    version: '2026.1',
    title: 'HR / Quality Assurance (QA) Release Agreement',
    clauses: ctx => [
      `I have reviewed the evaluation data for ${ctx.termDisplayName} and attest to its integrity and completeness.`,
      'I authorize the immediate release of individual results to each faculty member, and of department results to the respective Deans for oversight review.',
      'I confirm that student identities remain confidential and that written comments are presented verbatim, subject only to automated PII redaction, in accordance with RA 10173 (Data Privacy Act of 2012).',
      'I will handle the released information in accordance with institutional policy and solely for professional development and continuous institutional improvement.',
      'I understand that this release is final for this Academic Term, that it closes the term to further student submissions, and that it is recorded in an immutable audit trail.',
      'I acknowledge that this electronic signature has the same legal effect as a handwritten signature under RA 8792 (Electronic Commerce Act of 2000).',
    ],
  },
  dean_oversight_signoff: {
    version: '2026.1',
    title: "Dean's Oversight Sign-Off",
    clauses: ctx => [
      `In my oversight capacity, I have reviewed the evaluation results of the ${ctx.department} department for ${ctx.termDisplayName}.`,
      `I understand that faculty access to their own results was granted upon HR / QA release and does not depend on this sign-off, which is due within ${DEAN_OVERSIGHT_WINDOW_DAYS} days of release.`,
      'I will keep individual faculty results and student comments confidential and use them only for mentoring, professional development planning, and institutional improvement, consistent with RA 10173 (Data Privacy Act of 2012).',
      'I will comply with institutional policies on performance review and will not use these results for punitive purposes outside their developmental scope.',
      'I acknowledge that this electronic signature has the same legal effect as a handwritten signature under RA 8792 (Electronic Commerce Act of 2000) and is recorded in an immutable audit trail.',
    ],
  },
  faculty_acknowledgment: {
    version: '2026.1',
    title: 'Faculty Acknowledgment of Evaluation Results',
    clauses: ctx => [
      `I, ${ctx.facultyName}, acknowledge that I have received and reviewed my evaluation results for ${ctx.termDisplayName}.`,
      'This acknowledgment confirms receipt and review only; it does not signify agreement with every rating or comment.',
      'I understand that student comments are presented verbatim with only automated PII redaction, and I will not attempt to identify individual student respondents.',
      'I will keep these results confidential in accordance with institutional policy and RA 10173 (Data Privacy Act of 2012), and I commit to using them for my professional development.',
      'I acknowledge that this electronic signature has the same legal effect as a handwritten signature under RA 8792 (Electronic Commerce Act of 2000) and is recorded in an immutable audit trail.',
    ],
  },
};

export const ROLE_FOR_AGREEMENT: Record<AgreementType, UserRole> = {
  hr_qa_release: 'hr_qa',
  dean_oversight_signoff: 'dean',
  faculty_acknowledgment: 'faculty',
};

export function renderTemplate(type: AgreementType, ctx: TemplateContext): AgreementTemplate {
  const t = TEMPLATES[type];
  return { type, version: t.version, title: t.title, clauses: t.clauses(ctx) };
}

export function termsTextOf(template: AgreementTemplate): string {
  return [template.title, ...template.clauses.map((c, i) => `${i + 1}. ${c}`)].join('\n');
}

const MAX_SIGNATURE_BYTES = 400_000;

/** Validates a canvas signature (PNG data URL) and returns its raw bytes. */
export function decodeSignature(dataUrl: string): Buffer {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw badRequest('Signature must be a PNG image');
  const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 100 || !buf.subarray(0, 8).equals(pngMagic)) throw badRequest('Signature image is invalid');
  if (buf.length > MAX_SIGNATURE_BYTES) throw badRequest('Signature image is too large');
  return buf;
}

interface AgreementRow {
  id: string;
  tracking_id: string;
  agreement_type: AgreementType;
  term_id: string;
  term_display_name: string;
  signer_user_id: string;
  signer_name: string;
  signer_role: UserRole;
  signer_institutional_id: string;
  department_id: string | null;
  department_name?: string | null;
  faculty_id: string | null;
  terms_version: string;
  terms_text: string;
  signature_png: string;
  signature_sha256: string;
  signed_at: Date;
  document_hash: string;
}

function documentHashOf(r: Omit<AgreementRow, 'id' | 'tracking_id' | 'signature_png' | 'document_hash' | 'department_name'>): string {
  return sha256Hex(
    canonicalJson({
      type: r.agreement_type,
      termId: r.term_id,
      termDisplayName: r.term_display_name,
      signerUserId: r.signer_user_id,
      signerName: r.signer_name,
      signerRole: r.signer_role,
      signerInstitutionalId: r.signer_institutional_id,
      departmentId: r.department_id,
      facultyId: r.faculty_id,
      termsVersion: r.terms_version,
      termsText: r.terms_text,
      signatureSha256: r.signature_sha256,
      signedAt: r.signed_at.toISOString(),
    }),
  );
}

export function toSummary(r: AgreementRow): AgreementSummary {
  return {
    id: r.id,
    trackingId: r.tracking_id,
    type: r.agreement_type,
    termId: r.term_id,
    termDisplayName: r.term_display_name,
    department: r.department_name ?? undefined,
    facultyId: r.faculty_id ?? undefined,
    signerName: r.signer_name,
    signerRole: r.signer_role,
    signerInstitutionalId: r.signer_institutional_id,
    signedAt: r.signed_at.toISOString(),
    termsVersion: r.terms_version,
    documentHash: r.document_hash,
  };
}

export interface SignAgreementInput {
  type: AgreementType;
  term: { id: string; displayName: string };
  signer: AuthUser;
  departmentId?: string | null;
  departmentName?: string | null;
  facultyId?: string | null;
  facultyName?: string | null;
  signaturePng: string;
  ip: string | null;
  userAgent: string | null;
}

export async function signAgreement(client: DbClient, input: SignAgreementInput): Promise<AgreementRow> {
  const signatureBytes = decodeSignature(input.signaturePng);
  const template = renderTemplate(input.type, {
    termDisplayName: input.term.displayName,
    department: input.departmentName ?? undefined,
    facultyName: input.facultyName ?? undefined,
  });
  const signedAt = new Date();
  const record = {
    agreement_type: input.type,
    term_id: input.term.id,
    term_display_name: input.term.displayName,
    signer_user_id: input.signer.id,
    signer_name: input.signer.displayName,
    signer_role: input.signer.role,
    signer_institutional_id: input.signer.institutionalId,
    department_id: input.departmentId ?? null,
    faculty_id: input.facultyId ?? null,
    terms_version: template.version,
    terms_text: termsTextOf(template),
    signature_sha256: sha256Hex(signatureBytes),
    signed_at: signedAt,
  };
  const documentHash = documentHashOf(record);
  const trackingId = `FES-${signedAt.getTime()}-${documentHash.slice(0, 12).toUpperCase()}`;

  const { rows } = await client.query<AgreementRow>(
    `INSERT INTO agreements (tracking_id, agreement_type, term_id, term_display_name, signer_user_id, signer_name, signer_role,
                             signer_institutional_id, department_id, faculty_id, terms_version, terms_text, signature_png,
                             signature_sha256, signed_at, ip_address, user_agent, document_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *, (SELECT name FROM departments WHERE id = $9) AS department_name`,
    [
      trackingId, record.agreement_type, record.term_id, record.term_display_name, record.signer_user_id, record.signer_name,
      record.signer_role, record.signer_institutional_id, record.department_id, record.faculty_id, record.terms_version,
      record.terms_text, input.signaturePng, record.signature_sha256, record.signed_at, input.ip, input.userAgent, documentHash,
    ],
  );
  return rows[0];
}

export const AGREEMENT_SELECT = `SELECT a.*, d.name AS department_name FROM agreements a LEFT JOIN departments d ON d.id = a.department_id`;

export async function getAgreement(client: DbClient, id: string): Promise<AgreementRow | null> {
  const { rows } = await client.query<AgreementRow>(`${AGREEMENT_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

export function verifyAgreementRow(r: AgreementRow): AgreementVerification {
  const signatureOk = sha256Hex(decodeSignature(r.signature_png)) === r.signature_sha256;
  const recomputedHash = documentHashOf(r);
  return {
    valid: signatureOk && recomputedHash === r.document_hash && r.tracking_id.endsWith(r.document_hash.slice(0, 12).toUpperCase()),
    trackingId: r.tracking_id,
    type: r.agreement_type,
    signerName: r.signer_name,
    signedAt: r.signed_at.toISOString(),
    documentHash: r.document_hash,
    recomputedHash,
  };
}

export type { AgreementRow };
