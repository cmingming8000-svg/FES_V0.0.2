import type { CookieOptions, Response } from 'express';
import type { UserRole } from '../../../src/types';
import { config } from '../config';
import { pool, type DbClient } from '../db/pool';
import { randomToken, sha256Hex } from '../lib/crypto';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  displayName: string;
  institutionalId: string;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  facultyId: string | null;
  studentId: string | null;
}

export interface AuthContext {
  sessionId: string;
  expiresAt: Date;
  user: AuthUser;
}

const TOUCH_THROTTLE_MS = 30_000;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.session.absoluteHours * 3600_000,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.session.cookieName, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.session.cookieName, opts);
}

export async function createSession(client: DbClient, userId: string, ip: string | null, userAgent: string | null): Promise<string> {
  const token = randomToken(32);
  await client.query(
    `INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [sha256Hex(token), userId, config.session.absoluteHours, ip, userAgent],
  );
  return token;
}

/**
 * Resolves a session cookie. Enforces revocation, the absolute lifetime and the
 * inactivity timeout, and slides the idle window on activity.
 */
export async function resolveSession(token: string, forceTouch = false): Promise<AuthContext | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sessionId = sha256Hex(token);
  const { rows } = await pool.query(
    `SELECT s.id, s.expires_at, s.last_seen_at,
            u.id AS user_id, u.username, u.role, u.display_name, u.institutional_id, u.email,
            u.department_id, d.name AS department_name, u.faculty_id, u.student_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE s.id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)
        AND u.is_active`,
    [sessionId, config.session.idleMinutes],
  );
  const row = rows[0];
  if (!row) return null;

  if (forceTouch || Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_THROTTLE_MS) {
    await pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
  }

  return {
    sessionId,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
      displayName: row.display_name,
      institutionalId: row.institutional_id,
      email: row.email,
      departmentId: row.department_id,
      departmentName: row.department_name,
      facultyId: row.faculty_id,
      studentId: row.student_id,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

export async function revokeAllSessionsForUser(client: DbClient, userId: string): Promise<void> {
  await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

export async function purgeExpiredSessionsAndTokens(): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE expires_at < now() - interval '1 day' OR revoked_at < now() - interval '1 day'`);
  await pool.query(`DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day'`);
}
