// HTTP helpers shared by all Edge Functions.
import { env } from './env.ts';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

function allowedOrigin(origin: string | null): string {
  const list = (env('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) return '*';
  return origin && list.includes(origin) ? origin : list[0] ?? '';
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Wraps a handler with CORS preflight handling and uniform error responses. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof HttpError) return json(req, { error: error.code, message: error.message }, error.status);
      console.error(error);
      return json(req, { error: 'internal_error' }, 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function bearer(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token || token === header) throw new HttpError(401, 'not_authenticated');
  return token;
}
