import { Router } from 'express';
import { z } from 'zod';
import type { BulkImportResult, ManagedAccount } from '../../../src/types';
import { config } from '../config';
import { withTransaction, type DbClient } from '../db/pool';
import { badRequest, clientIp, conflict, notFound, parseBody, userAgent } from '../lib/http';
import { actorFor, contextFor, requireRole } from '../middleware/auth';
import { revokeAllSessionsForUser } from '../security/sessions';
import { accountInputSchema, createAccount, createAccountsBulk, issueToken, loadLookups, sendInviteEmail, MAX_BULK_ROWS } from '../services/accounts';
import { AuditService } from '../services/audit';
import { sendMailInBackground } from '../services/mail';

export const accountsRouter = Router();

function accountId(raw: string): string {
  const result = z.string().uuid().safeParse(raw);
  if (!result.success) throw notFound('Account not found');
  return result.data;
}

accountsRouter.get('/', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const rows = await withTransaction(contextFor(user), async client => (await client.query(
    `SELECT u.id, u.username, u.display_name, u.email, u.role, u.institutional_id, d.name AS department,
            u.is_active, u.password_hash IS NOT NULL AS has_password, u.locked_until, u.last_login_at, u.created_at
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY u.role, lower(u.display_name)`,
  )).rows);
  res.json(rows.map((r): ManagedAccount => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    email: r.email,
    role: r.role,
    institutionalId: r.institutional_id,
    department: r.department,
    isActive: r.is_active,
    hasPassword: r.has_password,
    lockedUntil: r.locked_until && new Date(r.locked_until) > new Date() ? new Date(r.locked_until).toISOString() : null,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  })));
});

async function lockAccount(client: DbClient, id: string) {
  const { rows } = await client.query(
    `SELECT id, username, display_name, email, role, institutional_id, is_active, password_hash IS NOT NULL AS has_password
       FROM users WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) throw notFound('Account not found');
  return rows[0];
}

accountsRouter.patch('/:id/status', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const id = accountId(req.params.id);
  const { isActive } = parseBody(z.object({ isActive: z.boolean() }), req);
  if (id === user.id && !isActive) throw badRequest('You cannot deactivate your own account');

  await withTransaction(contextFor(user), async client => {
    const target = await lockAccount(client, id);
    if (target.is_active === isActive) return;
    if (!isActive && target.role === 'hr_qa') {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM users WHERE role = 'hr_qa' AND is_active AND id <> $1`, [id]);
      if (rows[0].n === 0) throw conflict('At least one active HR / QA account must remain');
    }
    await client.query('UPDATE users SET is_active = $2 WHERE id = $1', [id, isActive]);
    if (!isActive) await revokeAllSessionsForUser(client, id);
    await AuditService.record(client, {
      actor: actorFor(user), action: isActive ? 'account_reactivated' : 'account_deactivated', targetType: 'user', targetId: id,
      oldValue: { isActive: target.is_active }, newValue: { isActive },
      details: `${isActive ? 'Reactivated' : 'Deactivated'} ${target.role} account ${target.username}${isActive ? '' : '; all sessions revoked'}`,
      ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.json({ message: isActive ? 'Account reactivated.' : 'Account deactivated and signed out of all sessions.' });
});

accountsRouter.post('/:id/unlock', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const id = accountId(req.params.id);
  await withTransaction(contextFor(user), async client => {
    const target = await lockAccount(client, id);
    await client.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [id]);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'account_unlocked', targetType: 'user', targetId: id,
      details: `Cleared sign-in lockout for ${target.username}`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.json({ message: 'Account unlocked.' });
});

/** Emails a password reset link, or re-sends the invitation if the account has never set a password. */
accountsRouter.post('/:id/reset-password', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const id = accountId(req.params.id);
  const ip = clientIp(req);

  const result = await withTransaction(contextFor(user), async client => {
    const target = await lockAccount(client, id);
    if (!target.is_active) throw badRequest('Reactivate this account before sending a password link');
    if (!target.email) throw badRequest('This account has no registered email address');
    const purpose = target.has_password ? 'password_reset' : 'account_invite';
    const token = await issueToken(client, id, purpose, ip);
    await AuditService.record(client, {
      actor: actorFor(user), action: purpose === 'password_reset' ? 'password_reset_issued_by_hr' : 'account_invite_resent',
      targetType: 'user', targetId: id, details: `Password link emailed to ${target.username}`, ip, userAgent: userAgent(req),
    });
    return { target, purpose, token };
  });

  const { target, purpose, token } = result;
  if (purpose === 'account_invite') {
    sendInviteEmail({
      userId: target.id, username: target.username, role: target.role, institutionalId: target.institutional_id,
      email: target.email, displayName: target.display_name, inviteToken: token,
    });
  } else {
    const link = `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    sendMailInBackground({
      to: target.email,
      subject: 'FES password reset',
      text:
        `Hello ${target.display_name},\n\n` +
        `HR / Quality Assurance has issued a password reset for your Faculty Evaluation System account (${target.username}).\n` +
        `This link expires in ${config.tokens.passwordResetTtlMinutes} minutes and can be used once:\n${link}\n\n` +
        `If you did not expect this, please contact HR / QA.`,
    });
  }
  res.json({ message: purpose === 'account_invite' ? `Invitation re-sent to ${target.email}.` : `Password reset link sent to ${target.email}.` });
});

accountsRouter.post('/', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const input = parseBody(accountInputSchema, req);
  const account = await withTransaction(contextFor(user), async client => {
    const created = await createAccount(client, input, await loadLookups(client));
    await AuditService.record(client, {
      actor: actorFor(user), action: 'account_created', targetType: 'user', targetId: created.userId,
      newValue: { role: created.role, username: created.username, institutionalId: created.institutionalId, invited: !!created.inviteToken },
      details: `Created ${created.role} account for ${created.displayName}`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return created;
  });
  sendInviteEmail(account);
  res.status(201).json({
    username: account.username,
    message: account.inviteToken
      ? `Account created. An invitation to set a password was emailed to ${account.email}.`
      : 'Account created successfully.',
  });
});

accountsRouter.post('/bulk', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { rows } = parseBody(z.object({ rows: z.array(z.unknown()).max(MAX_BULK_ROWS) }), req);
  const created = await withTransaction(contextFor(user), async client => {
    const accounts = await createAccountsBulk(client, rows);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'accounts_bulk_imported', targetType: 'user', targetId: `${accounts.length} accounts`,
      newValue: { count: accounts.length, byRole: accounts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.role]: (m[a.role] ?? 0) + 1 }), {}) },
      details: `Bulk onboarding created ${accounts.length} account(s); invitations emailed`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return accounts;
  });
  created.forEach(sendInviteEmail);
  res.status(201).json({
    created: created.length,
    rows: created.map((a, i) => ({ row: i + 2, institutionalId: a.institutionalId, username: a.username, role: a.role })),
  } satisfies BulkImportResult);
});
