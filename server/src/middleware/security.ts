import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { forbidden } from '../lib/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Anti-CSRF defense layered on SameSite=Strict cookies: state-changing requests
 * must carry a custom header (which cross-site forms cannot send without a CORS
 * preflight we never grant) and, when present, a same-origin Origin header.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-fes-request') !== '1') throw forbidden('Missing anti-forgery header');
  const origin = req.get('origin');
  if (origin && origin !== config.appOrigin) throw forbidden('Cross-origin request rejected');
  next();
}

export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store');
  next();
}

const limiterDefaults = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please wait and try again.', code: 'rate_limited' } },
};

const bodyField = (req: Request, field: string): string => {
  const value = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
};

export const apiLimiter = rateLimit({ ...limiterDefaults, windowMs: 5 * 60_000, limit: 1000 });

// Campus networks often share one public IP behind NAT, so the strict limits are
// keyed per IP + target account, with a looser ceiling per IP. Per-account
// lockout (users.locked_until) handles distributed guessing against one account.
function compose(...handlers: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let i = 0;
    const run = (err?: unknown): void => {
      if (err) return next(err);
      const handler = handlers[i++];
      if (!handler) return next();
      void handler(req, res, run);
    };
    run();
  };
}

export const loginLimiter = compose(
  rateLimit({ ...limiterDefaults, windowMs: 15 * 60_000, limit: 300 }),
  rateLimit({ ...limiterDefaults, windowMs: 15 * 60_000, limit: 10, keyGenerator: req => `${req.ip}|${bodyField(req, 'username')}` }),
);
export const recoveryLimiter = compose(
  rateLimit({ ...limiterDefaults, windowMs: 15 * 60_000, limit: 60 }),
  rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60_000,
    limit: 5,
    keyGenerator: req => `${req.ip}|${bodyField(req, 'identifier') || bodyField(req, 'institutionalId') || String(req.query.token ?? '').slice(0, 16)}`,
  }),
);
