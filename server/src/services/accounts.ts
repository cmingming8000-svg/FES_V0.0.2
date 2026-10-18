import { z } from 'zod';
import type { UserRole } from '../../../src/types';
import { config } from '../config';
import type { DbClient } from '../db/pool';
import { HttpError, badRequest } from '../lib/http';
import { randomToken, sha256Hex } from '../lib/crypto';
import { hashPassword, passwordPolicyError } from '../security/password';
import { sendMailInBackground } from './mail';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;

export const accountInputSchema = z.object({
  role: z.enum(['student', 'faculty', 'dean', 'hr_qa']),
  name: z.string().trim().min(2).max(120),
  institutionalId: z.string().trim().regex(idPattern, 'Use 2–32 letters, digits, dots, dashes or underscores'),
  email: z.string().trim().toLowerCase().email().max(254),
  username: z.string().trim().regex(idPattern, 'Use 2–32 letters, digits, dots, dashes or underscores').optional(),
  password: z.string().max(128).optional(),
  department: z.string().trim().max(120).optional(),
  title: z.string().trim().max(80).optional(),
  programId: z.string().trim().max(32).optional(),
  subjects: z.array(z.string().trim().max(32)).max(50).optional(),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

export interface CreatedAccount {
  userId: string;
  username: string;
  role: UserRole;
  institutionalId: string;
  email: string;
  displayName: string;
  inviteToken?: string;
}

interface Lookups {
  departments: Map<string, string>; // lower(name) -> id
  programs: Map<string, { id: string; departmentId: string }>; // lower(id) -> program
  subjects: Set<string>;
}

export async function loadLookups(client: DbClient): Promise<Lookups> {
  const [d, p, s] = await Promise.all([
    client.query('SELECT id, name FROM departments'),
    client.query('SELECT id, department_id FROM programs'),
    client.query('SELECT id FROM subjects'),
  ]);
  return {
    departments: new Map(d.rows.map(r => [String(r.name).toLowerCase(), r.id])),
    programs: new Map(p.rows.map(r => [String(r.id).toLowerCase(), { id: r.id, departmentId: r.department_id }])),
    subjects: new Set(s.rows.map(r => r.id)),
  };
}

/** Business-rule validation that does not need a write; returns a message or null. */
export function validateAccount(input: AccountInput, lookups: Lookups): string | null {
  const needsDepartment = input.role === 'faculty' || input.role === 'dean';
  if (needsDepartment && !input.department) return 'Department is required for faculty and dean accounts';
  if (input.department && needsDepartment && !lookups.departments.has(input.department.toLowerCase())) return `Unknown department "${input.department}"`;
  if (input.role === 'faculty' && !input.title) return 'Title is required for faculty accounts';
  if (input.role === 'student') {
    if (!input.programId) return 'Program is required for student accounts';
    if (!lookups.programs.has(input.programId.toLowerCase())) return `Unknown program "${input.programId}"`;
  }
  const unknownSubject = (input.subjects ?? []).find(s => !lookups.subjects.has(s));
  if (unknownSubject) return `Unknown subject "${unknownSubject}"`;
  if (input.password) {
    const err = passwordPolicyError(input.password, input.username ?? input.institutionalId);
    if (err) return err;
  }
  return null;
}

export async function createAccount(client: DbClient, input: AccountInput, lookups: Lookups): Promise<CreatedAccount> {
  const error = validateAccount(input, lookups);
  if (error) throw badRequest(error);

  const username = input.username ?? input.institutionalId;
  const program = input.role === 'student' ? lookups.programs.get(input.programId!.toLowerCase())! : null;
  const departmentId =
    program ? program.departmentId
    : input.department && input.role !== 'hr_qa' ? lookups.departments.get(input.department.toLowerCase()) ?? null
    : null;
  let facultyId: string | null = null;
  let studentId: string | null = null;

  if (input.role === 'faculty') {
    facultyId = input.institutionalId;
    await client.query('INSERT INTO faculty (id, name, title, department_id) VALUES ($1, $2, $3, $4)', [facultyId, input.name, input.title, departmentId]);
    if (input.subjects?.length) {
      await client.query('INSERT INTO faculty_courses (faculty_id, subject_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING', [facultyId, input.subjects]);
    }
  }
  if (input.role === 'student') {
    studentId = input.institutionalId;
    await client.query('INSERT INTO students (id, name, program_id) VALUES ($1, $2, $3)', [studentId, input.name, program!.id]);
    if (input.subjects?.length) {
      await client.query('INSERT INTO student_enrollments (student_id, subject_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING', [studentId, input.subjects]);
    }
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash, role, display_name, institutional_id, department_id, faculty_id, student_id, password_changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $3::text IS NULL THEN NULL ELSE now() END)
     RETURNING id`,
    [username, input.email, passwordHash, input.role, input.name, input.institutionalId, departmentId, facultyId, studentId],
  );
  const userId = rows[0].id;

  let inviteToken: string | undefined;
  if (!passwordHash) inviteToken = await issueToken(client, userId, 'account_invite', null);

  return { userId, username, role: input.role, institutionalId: input.institutionalId, email: input.email, displayName: input.name, inviteToken };
}

export async function issueToken(client: DbClient, userId: string, purpose: 'password_reset' | 'account_invite', ip: string | null): Promise<string> {
  const token = randomToken(32);
  // Only the most recent token of each purpose remains usable.
  await client.query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  const ttl = purpose === 'password_reset'
    ? `${config.tokens.passwordResetTtlMinutes} minutes`
    : `${config.tokens.inviteTtlHours} hours`;
  await client.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at, requested_ip) VALUES ($1, $2, $3, now() + $4::interval, $5)`,
    [userId, sha256Hex(token), purpose, ttl, ip],
  );
  return token;
}

export function sendInviteEmail(account: CreatedAccount): void {
  if (!account.inviteToken) return;
  const link = `${config.appBaseUrl}/reset-password?invite=1&token=${encodeURIComponent(account.inviteToken)}`;
  sendMailInBackground({
    to: account.email,
    subject: 'Your Faculty Evaluation System (FES) account',
    text:
      `Hello ${account.displayName},\n\n` +
      `An FES account has been created for you by HR / Quality Assurance.\n` +
      `Username: ${account.username}\n\n` +
      `Set your password within ${config.tokens.inviteTtlHours} hours using this link:\n${link}\n\n` +
      `If you were not expecting this email, please contact HR / QA.`,
  });
}

export const MAX_BULK_ROWS = 2000;

export interface BulkRowError {
  row: number;
  message: string;
}

/** Validates and inserts all rows in the caller's transaction; any failure aborts the whole batch. */
export async function createAccountsBulk(client: DbClient, rawRows: unknown[]): Promise<CreatedAccount[]> {
  if (rawRows.length === 0) throw badRequest('The import file contains no rows');
  if (rawRows.length > MAX_BULK_ROWS) throw badRequest(`A single import is limited to ${MAX_BULK_ROWS} rows`);

  const lookups = await loadLookups(client);
  const errors: BulkRowError[] = [];
  const parsed: AccountInput[] = [];
  const seen = { ids: new Set<string>(), usernames: new Set<string>(), emails: new Set<string>() };

  rawRows.forEach((raw, i) => {
    const row = i + 2; // header is row 1
    const result = accountInputSchema.omit({ password: true }).safeParse(raw);
    if (!result.success) {
      errors.push({ row, message: result.error.issues.map(x => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') });
      return;
    }
    const input = result.data;
    const businessError = validateAccount(input, lookups);
    if (businessError) errors.push({ row, message: businessError });
    const id = input.institutionalId.toLowerCase();
    const username = (input.username ?? input.institutionalId).toLowerCase();
    if (seen.ids.has(id)) errors.push({ row, message: `Duplicate ID "${input.institutionalId}" in file` });
    if (seen.usernames.has(username)) errors.push({ row, message: `Duplicate username "${username}" in file` });
    if (seen.emails.has(input.email)) errors.push({ row, message: `Duplicate email "${input.email}" in file` });
    seen.ids.add(id);
    seen.usernames.add(username);
    seen.emails.add(input.email);
    parsed.push(input);
  });

  if (errors.length === 0) {
    const existing = await client.query(
      `SELECT lower(institutional_id) AS id, lower(username) AS username, lower(email) AS email FROM users
        WHERE lower(institutional_id) = ANY($1) OR lower(username) = ANY($2) OR lower(email) = ANY($3)`,
      [[...seen.ids], [...seen.usernames], [...seen.emails]],
    );
    parsed.forEach((input, i) => {
      const row = i + 2;
      const hit = existing.rows.find(r =>
        r.id === input.institutionalId.toLowerCase() ||
        r.username === (input.username ?? input.institutionalId).toLowerCase() ||
        r.email === input.email);
      if (hit) errors.push({ row, message: `An account already exists with this ID, username or email (${input.institutionalId})` });
    });
  }

  if (errors.length > 0) {
    throw new HttpError(422, `Import rejected: ${errors.length} row(s) need correction. No accounts were created.`, 'validation_failed', errors.slice(0, 200));
  }

  const created: CreatedAccount[] = [];
  for (const input of parsed) created.push(await createAccount(client, input, lookups));
  return created;
}
