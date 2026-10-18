import type { Request } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, 'bad_request', details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'You do not have permission to perform this action') => new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, 'conflict', details);

export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw badRequest('Invalid request', result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>, req: Request): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw badRequest('Invalid query', result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

export function userAgent(req: Request): string | null {
  const ua = req.get('user-agent');
  return ua ? ua.slice(0, 512) : null;
}
