export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Dispatched when the server reports the session is gone (idle timeout, revocation). */
export const UNAUTHORIZED_EVENT = 'fes:unauthorized';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

function headers(hasBody: boolean): HeadersInit {
  // The custom header is required by the server's anti-CSRF check.
  return { 'X-FES-Request': '1', Accept: 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}) };
}

async function failure(res: Response, path: string): Promise<never> {
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null;
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.code, data?.error?.details);
}

export async function api<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: headers(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) return failure(res, path);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads an authenticated file response (e.g. a signed agreement receipt). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: headers(false) });
  if (!res.ok) return failure(res, path);
  const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
