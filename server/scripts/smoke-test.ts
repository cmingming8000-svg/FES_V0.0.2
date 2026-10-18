/**
 * End-to-end API smoke test against a freshly seeded database:
 *   npm run db:seed && npm run dev:server   (in another terminal)
 *   npm run test:smoke
 * Exercises RBAC, CSRF, lockout, the two-tier release, e-signatures, receipts,
 * TNA snapshots, bulk onboarding and audit-chain verification.
 */
import { crc32, deflateSync } from 'node:zlib';
import pg from 'pg';

const BASE = process.env.FES_API_URL ?? 'http://localhost:4000/api';
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Fes-Demo-2026!';

let failures = 0;
function check(name: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && info !== undefined ? `  -> ${JSON.stringify(info).slice(0, 300)}` : ''}`);
  if (!ok) failures++;
}

class Session {
  cookie = '';
  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.csrf === false ? {} : { 'X-FES-Request': '1' }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data: data as any, headers: res.headers };
  }
  async login(username: string, password = PASSWORD) {
    return this.req('POST', '/auth/login', { username, password });
  }
}

function signaturePng(): string {
  const width = 120, height = 40;
  const raw = Buffer.alloc((width * 4 + 1) * height, 0xff);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 10; x < 110; x++) if (Math.abs(y - 20 - Math.round(8 * Math.sin(x / 8))) < 2) raw.fill(0x20, y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 4 + x * 4);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

async function main() {
  const anon = new Session();
  check('unauthenticated bootstrap is rejected (401)', (await anon.req('GET', '/bootstrap')).status === 401);
  check('state change without anti-forgery header is rejected (403)', (await anon.req('POST', '/auth/login', { username: 'admin', password: PASSWORD }, { csrf: false })).status === 403);
  check('bad password returns generic 401', (await anon.login('admin', 'wrong-password-1')).status === 401);

  // Lockout after 5 consecutive failures
  const victim = new Session();
  for (let i = 0; i < 5; i++) await victim.login('C24-024', 'wrong-password-1');
  const locked = await victim.login('C24-024');
  check('account locks after 5 failed attempts, even with the right password (423)', locked.status === 423, locked);

  const hr = new Session();
  const hrLogin = await hr.login('admin');
  check('HR / QA login succeeds', hrLogin.status === 200 && hrLogin.data.user.role === 'hr_qa', hrLogin.data);
  check('session cookie is HttpOnly; Secure; SameSite=Strict', /HttpOnly/i.test(hrLogin.headers.get('set-cookie') ?? '') && /Secure/i.test(hrLogin.headers.get('set-cookie') ?? '') && /SameSite=Strict/i.test(hrLogin.headers.get('set-cookie') ?? ''));
  check('password hash never leaves the server', !JSON.stringify(hrLogin.data).includes('argon2'));

  const hrBoot = await hr.req('GET', '/bootstrap');
  const activeId = hrBoot.data.cycles.find((c: any) => c.status === 'active').id;
  check('HR / QA sees all evaluations with student IDs', hrBoot.data.evaluations.length === 127 && hrBoot.data.evaluations.some((e: any) => e.studentId), hrBoot.data.evaluations.length);

  const faculty = new Session();
  await faculty.login('faculty');
  const facBefore = await faculty.req('GET', '/bootstrap');
  check('faculty sees no results before HR / QA release', facBefore.data.evaluations.length === 0, facBefore.data.evaluations.length);
  check('faculty cannot read the audit log (403)', (await faculty.req('GET', '/audit')).status === 403);
  check('faculty cannot release a term (403)', (await faculty.req('POST', `/cycles/${activeId}/release`, { signature: signaturePng(), accepted: true })).status === 403);

  const dean = new Session();
  await dean.login('M001');
  const earlySignoff = await dean.req('POST', `/cycles/${activeId}/oversight-signoff`, { signature: signaturePng(), accepted: true });
  check('dean cannot sign off before HR / QA release (409)', earlySignoff.status === 409, earlySignoff);

  // Student submission with server-side PII redaction
  const evaluated = new Set(hrBoot.data.evaluations.map((e: any) => `${e.studentId}:${e.courseId}`));
  const candidate = hrBoot.data.students.find((s: any) => s.id !== 'C24-024' && s.enrolledSubjects.some((sub: string) => !evaluated.has(`${s.id}:${sub}`)));
  const student = new Session();
  await student.login(candidate.id);
  const sBoot = await student.req('GET', '/bootstrap');
  check('student bootstrap contains no evaluations or other students', sBoot.data.evaluations.length === 0 && sBoot.data.students.length === 1);
  const ratings = Object.fromEntries(sBoot.data.subQuestions.map((sq: any) => [sq.id, 4]));
  const target = sBoot.data.subjects.find((s: any) => !sBoot.data.evaluatedSubjectIds.includes(s.id));
  const notEnrolled = hrBoot.data.subjects.find((s: any) => !candidate.enrolledSubjects.includes(s.id));
  const submit = await student.req('POST', '/evaluations', { subjectId: target.id, ratings, feedback: 'Great class! Email me at someone@example.com' });
  check('student submits an evaluation (201)', submit.status === 201, submit.data);
  check('duplicate submission is rejected (409)', (await student.req('POST', '/evaluations', { subjectId: target.id, ratings, feedback: '' })).status === 409);
  check('incomplete ratings are rejected (400)', (await student.req('POST', '/evaluations', { subjectId: target.id, ratings: { 'sq-teaching-1': 5 } })).status === 400);
  check('cannot evaluate a subject you are not enrolled in (404)', (await student.req('POST', '/evaluations', { subjectId: notEnrolled.id, ratings })).status === 404);
  const hrAfterSubmit = await hr.req('GET', '/bootstrap');
  const stored = hrAfterSubmit.data.evaluations.find((e: any) => e.id === submit.data.id);
  check('feedback stored verbatim with only regex PII redaction', stored?.feedback === 'Great class! Email me at [REDACTED_EMAIL]', stored?.feedback);

  // Tier 1: HR / QA release with e-signature
  check('release requires accepting terms (400)', (await hr.req('POST', `/cycles/${activeId}/release`, { signature: signaturePng(), accepted: false })).status === 400);
  const template = await hr.req('GET', `/agreements/template/hr_qa_release?cycleId=${activeId}`);
  check('release agreement text references RA 8792 and RA 10173', template.data.clauses.join(' ').includes('RA 8792') && template.data.clauses.join(' ').includes('RA 10173'));
  const release = await hr.req('POST', `/cycles/${activeId}/release`, { signature: signaturePng(), accepted: true });
  check('HR / QA release succeeds with tracking ID FES-[timestamp]-[id]', release.status === 201 && /^FES-\d+-[0-9A-F]{12}$/.test(release.data.trackingId), release.data);
  check('second release is rejected (409)', (await hr.req('POST', `/cycles/${activeId}/release`, { signature: signaturePng(), accepted: true })).status === 409);
  check('student submissions close after release (409)', (await student.req('POST', '/evaluations', { subjectId: target.id, ratings })).status === 409);

  const facAfter = await faculty.req('GET', '/bootstrap');
  check('faculty sees own results immediately after release (no Dean gate)', facAfter.data.evaluations.length > 0 && facAfter.data.evaluations.every((e: any) => e.facultyId === 'F001'), facAfter.data.evaluations.length);
  check('faculty never receives student IDs', facAfter.data.evaluations.every((e: any) => !('studentId' in e)));
  check('faculty receives department rank aggregate', !!facAfter.data.termStats[activeId]?.facultyRank, facAfter.data.termStats);

  const ack = await faculty.req('POST', `/cycles/${activeId}/acknowledge`, { signature: signaturePng(), accepted: true });
  check('faculty acknowledgment signed', ack.status === 201, ack.data);
  const receipt = await faculty.req('GET', `/agreements/${ack.data.id}/receipt.pdf`);
  check('signed receipt PDF downloads', receipt.status === 200 && Buffer.isBuffer(receipt.data) && receipt.data.subarray(0, 4).toString() === '%PDF', receipt.status);
  const verify = await faculty.req('GET', `/agreements/verify/${ack.data.trackingId}`);
  check('receipt hash verifies', verify.data.valid === true && verify.data.recomputedHash === verify.data.documentHash, verify.data);
  check('other faculty cannot download this receipt (404)', (await (async () => { const f2 = new Session(); await f2.login('faculty3'); return f2.req('GET', `/agreements/${ack.data.id}/receipt.pdf`); })()).status === 404);

  // Tier 2: Dean's Oversight Sign-Off
  const deanBoot = await dean.req('GET', '/bootstrap');
  const deptFaculty = new Set(deanBoot.data.faculty.map((f: any) => f.id));
  check('dean sees only own-department evaluations', deanBoot.data.evaluations.length > 0 && deanBoot.data.evaluations.every((e: any) => deptFaculty.has(e.facultyId)) && deanBoot.data.evaluations.every((e: any) => !('studentId' in e)));
  check('dean receives institution aggregates for comparison', Object.keys(deanBoot.data.termStats[activeId]?.departments ?? {}).length === 3);
  const signoff = await dean.req('POST', `/cycles/${activeId}/oversight-signoff`, { signature: signaturePng(), accepted: true, comments: 'Reviewed with department chairs.' });
  check("Dean's Oversight Sign-Off signed", signoff.status === 201, signoff.data);
  check('dean can download the faculty acknowledgment receipt in their department', (await dean.req('GET', `/agreements/${ack.data.id}/receipt.pdf`)).status === 200);

  // TNA snapshots
  const tna1 = await dean.req('GET', `/tna/department?cycleId=${activeId}`);
  const tna2 = await dean.req('GET', `/tna/department?cycleId=${activeId}`);
  check('department TNA generated then served from snapshot', tna1.status === 200 && tna2.data.cached === true, { first: tna1.data.cached, second: tna2.data.cached });
  check('dean cannot request another department TNA (403)', (await dean.req('GET', `/tna/department?cycleId=${activeId}&department=Physics`)).status === 403);
  const inst = await hr.req('GET', `/tna/institution?cycleId=${activeId}`);
  check('institutional TNA generated', inst.status === 200 && inst.data.snapshot.departments.length === 3, inst.data);

  // Bulk onboarding
  const bulkBad = await hr.req('POST', '/accounts/bulk', { rows: [
    { role: 'student', institutionalId: 'C25-900', name: 'Bulk Student', email: 'c25-900@example.edu.ph', programId: 'BSCS', subjects: ['CS101'] },
    { role: 'faculty', institutionalId: 'F900', name: 'Bulk Faculty', email: 'f900@example.edu.ph', department: 'Nowhere', title: 'Lecturer' },
  ] });
  check('bulk import with an invalid row is rejected atomically (422)', bulkBad.status === 422 && bulkBad.data.error.details?.[0]?.row === 3, bulkBad.data);
  const bulkOk = await hr.req('POST', '/accounts/bulk', { rows: [
    { role: 'student', institutionalId: 'C25-900', name: 'Bulk Student', email: 'c25-900@example.edu.ph', programId: 'BSCS', subjects: ['CS101'] },
    { role: 'faculty', institutionalId: 'F900', name: 'Bulk Faculty', email: 'f900@example.edu.ph', department: 'Computer Science', title: 'Lecturer', subjects: ['CS150'] },
  ] });
  check('bulk import creates all rows', bulkOk.status === 201 && bulkOk.data.created === 2, bulkOk.data);

  // Recovery endpoints respond generically
  check('forgot-password response is generic', (await anon.req('POST', '/auth/password/forgot', { identifier: 'nobody-here' })).data.message?.startsWith('If an account matches'));
  const recover = await anon.req('POST', '/auth/username/recover', { institutionalId: 'C24-001' });
  check('username recovery returns a masked hint', recover.status === 200 && /•/.test(recover.data.hint ?? ''), recover.data);

  // Audit trail integrity
  const audit = await hr.req('GET', '/audit?limit=5');
  check('audit entries carry SHA-256 event hashes', audit.data.every((e: any) => /^[0-9a-f]{64}$/.test(e.eventHash)));
  const chain = await hr.req('GET', '/audit/verify');
  check('audit hash chain verifies end to end', chain.data.valid === true && chain.data.checked > 10, chain.data);

  // Database-level immutability (bypassing the API entirely)
  const tryMutation = async (url: string | undefined, sql: string) => {
    if (!url) return 'skipped';
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try { await c.query(sql); return 'allowed'; } catch (e) { return (e as { code?: string }).code ?? 'error'; } finally { await c.end(); }
  };
  const appUpdate = await tryMutation(process.env.DATABASE_URL, `UPDATE audit_log SET details = 'tampered' WHERE id = 1`);
  check('runtime DB role cannot UPDATE audit_log (permission denied)', appUpdate === '42501', appUpdate);
  const ownerDelete = await tryMutation(process.env.MIGRATION_DATABASE_URL, `DELETE FROM audit_log WHERE id = 1`);
  check('even the schema owner is blocked by the append-only trigger', ownerDelete === 'FES01', ownerDelete);
  const ownerTruncate = await tryMutation(process.env.MIGRATION_DATABASE_URL, `TRUNCATE agreements CASCADE`);
  check('TRUNCATE of signed agreements is blocked', ownerTruncate === 'FES01', ownerTruncate);

  if (process.env.DATABASE_URL) {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const count = async (settings: Record<string, string>) => {
      await c.query('BEGIN');
      for (const [k, v] of Object.entries(settings)) await c.query('SELECT set_config($1, $2, true)', [k, v]);
      const { rows } = await c.query('SELECT count(*)::int AS n, count(DISTINCT faculty_id)::int AS f FROM evaluations');
      await c.query('ROLLBACK');
      return rows[0];
    };
    check('RLS: no security context sees zero evaluation rows', (await count({})).n === 0);
    const asFaculty = await count({ 'fes.role': 'faculty', 'fes.faculty_id': 'F003' });
    check('RLS: faculty context sees only its own rows even without a WHERE clause', asFaculty.f === 1 && asFaculty.n >= 11, asFaculty);
    const asDean = await count({ 'fes.role': 'dean', 'fes.department_id': 'PHYS' });
    check('RLS: dean context sees only its department', asDean.f === 3, asDean);
    await c.end();
  }

  const logout = await faculty.req('POST', '/auth/logout');
  check('logout revokes the session', logout.status === 204 && (await faculty.req('GET', '/auth/me')).status === 401);

  console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} smoke test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
