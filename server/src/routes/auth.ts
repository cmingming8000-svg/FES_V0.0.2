import { Router } from 'express';
import { z } from 'zod';
import type { MeResponse } from '../../../src/types';
import { config } from '../config';
import { SYSTEM_CONTEXT, pool, withTransaction } from '../db/pool';
import { HttpError, badRequest, clientIp, parseBody, unauthorized, userAgent } from '../lib/http';
import { sha256Hex } from '../lib/crypto';
import { actorFor, requireAuth } from '../middleware/auth';
import { loginLimiter, recoveryLimiter } from '../middleware/security';
import { hashPassword, passwordPolicyError, verifyAgainstDummy, verifyPassword } from '../security/password';
import { clearSessionCookie, createSession, resolveSession, revokeAllSessionsForUser, revokeSession, setSessionCookie } from '../security/sessions';
import { issueToken } from '../services/accounts';
import { AuditService } from '../services/audit';
import { toPublicUser } from '../services/bootstrap';
import { maskEmail, sendMailInBackground } from '../services/mail';

export const authRouter = Router();

const GENERIC_LOGIN_ERROR = 'Invalid username or password.';

function sessionInfo(expiresAt: Date) {
  return { idleTimeoutSeconds: config.session.idleMinutes * 60, expiresAt: expiresAt.toISOString() };
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = parseBody(
    z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }),
    req,
  );
  const ip = clientIp(req);
  const ua = userAgent(req);

  const outcome = await withTransaction(SYSTEM_CONTEXT, async client => {
    const { rows } = await client.query(
      `SELECT id, username, display_name, role, password_hash, is_active, failed_login_count, locked_until
         FROM users WHERE lower(username) = lower($1) FOR UPDATE`,
      [username],
    );
    const user = rows[0];

    if (!user) {
      await verifyAgainstDummy(password);
      await AuditService.record(client, {
        actor: { label: 'anonymous' }, action: 'login_failed', targetType: 'user', targetId: username.slice(0, 64),
        details: 'Unknown username', ip, userAgent: ua,
      });
      return { kind: 'failed' as const };
    }

    const actor = { userId: user.id, label: `${user.display_name} (${user.username})`, role: user.role };
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await AuditService.record(client, { actor, action: 'login_blocked_locked', targetType: 'user', targetId: user.id, ip, userAgent: ua });
      return { kind: 'locked' as const, until: new Date(user.locked_until) };
    }

    const ok = user.is_active && user.password_hash ? await verifyPassword(user.password_hash, password) : (await verifyAgainstDummy(password), false);
    if (!ok) {
      const failures = user.failed_login_count + 1;
      if (failures >= config.lockout.maxFailedAttempts) {
        const { rows: locked } = await client.query(
          `UPDATE users SET failed_login_count = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1 RETURNING locked_until`,
          [user.id, config.lockout.lockoutMinutes],
        );
        await AuditService.record(client, {
          actor, action: 'account_locked', targetType: 'user', targetId: user.id,
          details: `Locked for ${config.lockout.lockoutMinutes} minutes after ${failures} consecutive failed attempts`, ip, userAgent: ua,
        });
        return { kind: 'locked' as const, until: new Date(locked[0].locked_until) };
      }
      await client.query('UPDATE users SET failed_login_count = $2 WHERE id = $1', [user.id, failures]);
      await AuditService.record(client, {
        actor, action: 'login_failed', targetType: 'user', targetId: user.id,
        details: `Failed attempt ${failures} of ${config.lockout.maxFailedAttempts}`, ip, userAgent: ua,
      });
      return { kind: 'failed' as const, remaining: config.lockout.maxFailedAttempts - failures };
    }

    await client.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    const token = await createSession(client, user.id, ip, ua);
    await AuditService.record(client, { actor, action: 'login', targetType: 'user', targetId: user.id, ip, userAgent: ua });
    return { kind: 'ok' as const, token };
  });

  if (outcome.kind === 'locked') {
    const minutes = Math.max(1, Math.ceil((outcome.until.getTime() - Date.now()) / 60_000));
    throw new HttpError(423, `This account is temporarily locked after repeated failed sign-in attempts. Try again in ${minutes} minute(s) or reset your password.`, 'account_locked');
  }
  if (outcome.kind === 'failed') {
    const hint = outcome.remaining !== undefined && outcome.remaining <= 2 ? ` ${outcome.remaining} attempt(s) remaining before a temporary lockout.` : '';
    throw new HttpError(401, GENERIC_LOGIN_ERROR + hint, 'invalid_credentials');
  }

  const auth = await resolveSession(outcome.token);
  if (!auth) throw unauthorized();
  setSessionCookie(res, outcome.token);
  res.json({ user: toPublicUser(auth.user), session: sessionInfo(auth.expiresAt) } satisfies MeResponse);
});

authRouter.post('/logout', async (req, res) => {
  if (req.auth) {
    await revokeSession(req.auth.sessionId);
    await withTransaction(SYSTEM_CONTEXT, client =>
      AuditService.record(client, { actor: actorFor(req.auth!.user), action: 'logout', targetType: 'user', targetId: req.auth!.user.id, ip: clientIp(req), userAgent: userAgent(req) }),
    );
  }
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  const auth = requireAuth(req);
  res.json({ user: toPublicUser(auth.user), session: sessionInfo(auth.expiresAt) } satisfies MeResponse);
});

/** Called by the client's inactivity monitor while the user is active; loadSession slides the idle window. */
authRouter.post('/heartbeat', (req, res) => {
  const auth = requireAuth(req);
  res.json(sessionInfo(auth.expiresAt));
});

// ---------------------------------------------------------------------------
// Self-service password reset
// ---------------------------------------------------------------------------
const FORGOT_RESPONSE = { message: 'If an account matches, a password reset link has been sent to its registered email address.' };

authRouter.post('/password/forgot', recoveryLimiter, async (req, res) => {
  const { identifier } = parseBody(z.object({ identifier: z.string().trim().min(1).max(254) }), req);
  const ip = clientIp(req);

  const result = await withTransaction(SYSTEM_CONTEXT, async client => {
    const { rows } = await client.query(
      `SELECT id, username, display_name, email, role FROM users
        WHERE is_active AND email IS NOT NULL AND (lower(username) = lower($1) OR lower(email) = lower($1))
        LIMIT 1`,
      [identifier],
    );
    const user = rows[0];
    if (!user) return null;
    const token = await issueToken(client, user.id, 'password_reset', ip);
    await AuditService.record(client, {
      actor: { userId: user.id, label: `${user.display_name} (${user.username})`, role: user.role },
      action: 'password_reset_requested', targetType: 'user', targetId: user.id, ip, userAgent: userAgent(req),
    });
    return { user, token };
  });

  if (result) {
    const link = `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(result.token)}`;
    sendMailInBackground({
      to: result.user.email,
      subject: 'FES password reset',
      text:
        `Hello ${result.user.display_name},\n\n` +
        `A password reset was requested for your Faculty Evaluation System account (${result.user.username}).\n` +
        `This link expires in ${config.tokens.passwordResetTtlMinutes} minutes and can be used once:\n${link}\n\n` +
        `If you did not request this, you can ignore this email; your password will not change.`,
    });
  }
  res.json(FORGOT_RESPONSE);
});

authRouter.get('/password/token', recoveryLimiter, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const { rows } = await pool.query(
    `SELECT purpose FROM auth_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [sha256Hex(token)],
  );
  res.json({ valid: rows.length > 0, purpose: rows[0]?.purpose ?? null });
});

authRouter.post('/password/reset', recoveryLimiter, async (req, res) => {
  const { token, password } = parseBody(z.object({ token: z.string().min(20).max(128), password: z.string().min(1).max(128) }), req);
  const ip = clientIp(req);

  await withTransaction(SYSTEM_CONTEXT, async client => {
    const { rows } = await client.query(
      `SELECT t.id AS token_id, t.purpose, u.id, u.username, u.display_name, u.role
         FROM auth_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active
        FOR UPDATE OF t`,
      [sha256Hex(token)],
    );
    const row = rows[0];
    if (!row) throw badRequest('This link is invalid or has expired. Please request a new one.');
    const policyError = passwordPolicyError(password, row.username);
    if (policyError) throw badRequest(policyError);

    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [row.token_id]);
    await client.query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $1`,
      [row.id, await hashPassword(password)],
    );
    await revokeAllSessionsForUser(client, row.id);
    await AuditService.record(client, {
      actor: { userId: row.id, label: `${row.display_name} (${row.username})`, role: row.role },
      action: row.purpose === 'account_invite' ? 'account_activated' : 'password_reset_completed',
      targetType: 'user', targetId: row.id, details: 'All existing sessions revoked', ip, userAgent: userAgent(req),
    });
  });
  res.json({ message: 'Your password has been updated. You can now sign in.' });
});

// ---------------------------------------------------------------------------
// Username / ID recovery
// ---------------------------------------------------------------------------
authRouter.post('/username/recover', recoveryLimiter, async (req, res) => {
  const { institutionalId } = parseBody(z.object({ institutionalId: z.string().trim().min(2).max(32) }), req);

  const user = await withTransaction(SYSTEM_CONTEXT, async client => {
    const { rows } = await client.query(
      `SELECT id, username, display_name, email, role FROM users WHERE is_active AND email IS NOT NULL AND lower(institutional_id) = lower($1)`,
      [institutionalId],
    );
    const u = rows[0];
    if (u) {
      await AuditService.record(client, {
        actor: { userId: u.id, label: `${u.display_name} (${u.username})`, role: u.role },
        action: 'username_recovery_requested', targetType: 'user', targetId: u.id, ip: clientIp(req), userAgent: userAgent(req),
      });
    }
    return u ?? null;
  });

  if (user) {
    sendMailInBackground({
      to: user.email,
      subject: 'Your FES username',
      text:
        `Hello ${user.display_name},\n\n` +
        `Your Faculty Evaluation System username is: ${user.username}\n\n` +
        `Sign in at ${config.appBaseUrl}/login. If you did not request this, please contact HR / QA.`,
    });
  }
  res.json({
    message: 'If the ID matches an account with a registered email address, the username has been sent to that address.',
    hint: user ? `Sent to ${maskEmail(user.email)}` : undefined,
  });
});
