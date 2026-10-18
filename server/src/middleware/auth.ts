import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../../../src/types';
import { config } from '../config';
import type { DbContext } from '../db/pool';
import { forbidden, unauthorized } from '../lib/http';
import { clearSessionCookie, resolveSession, type AuthContext, type AuthUser } from '../security/sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[config.session.cookieName];
  if (typeof token === 'string' && token) {
    const auth = await resolveSession(token, req.path === '/auth/heartbeat');
    if (auth) req.auth = auth;
    else clearSessionCookie(res);
  }
  next();
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized('Your session has expired. Please sign in again.');
  return req.auth;
}

/** Server-side RBAC gate: returns the authenticated user if their role is allowed. */
export function requireRole(req: Request, ...roles: UserRole[]): AuthUser {
  const { user } = requireAuth(req);
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

export function contextFor(user: AuthUser): DbContext {
  return {
    role: user.role,
    userId: user.id,
    departmentId: user.departmentId,
    facultyId: user.facultyId,
    studentId: user.studentId,
  };
}

export function actorFor(user: AuthUser) {
  return { userId: user.id, label: `${user.displayName} (${user.username})`, role: user.role };
}
