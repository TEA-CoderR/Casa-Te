// Local stand-in for the Supabase API gateway (Kong) on :54321.
//   /rest/v1/*       -> PostgREST
//   /auth/v1/*       -> Supabase Auth (GoTrue)
//   /functions/v1/*  -> Edge Functions (functions-server.ts), with verify_jwt like supabase/config.toml
//   /__templates/*   -> auth email templates for GoTrue (local only)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const upstream = {
  rest: Number(process.env.POSTGREST_PORT ?? 54330),
  auth: Number(process.env.GOTRUE_PORT ?? 54332),
  functions: Number(process.env.FUNCTIONS_PORT ?? 54331),
};

// Functions with `verify_jwt = false` in supabase/config.toml.
const config = fs.readFileSync(path.join(here, '../../supabase/config.toml'), 'utf8');
const noJwt = new Set([...config.matchAll(/\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*false/g)].map((m) => m[1]));

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function verifyJwt(token) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return false;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  return !claims.exp || claims.exp > Date.now() / 1000;
}

// Like Supabase's gateway: any origin, and preflights allow whatever headers the client asks for.
function cors(req) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': req.headers['access-control-request-headers'] ?? 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-expose-headers': 'content-range, x-supabase-api-version',
  };
}

function proxy(req, res, port, targetPath, addCors) {
  const headers = { ...req.headers, 'x-forwarded-host': req.headers.host ?? '', 'x-forwarded-proto': 'http' };
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: targetPath, headers }, (r) => {
    const out = { ...r.headers };
    if (addCors) {
      for (const k of Object.keys(out)) if (k.startsWith('access-control-')) delete out[k];
      Object.assign(out, cors(req));
    }
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, { 'Content-Type': 'application/json', ...cors(req) }); res.end(JSON.stringify({ error: 'upstream_unavailable', message: e.message })); });
  req.pipe(up);
}

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://gateway');
  const p = url.pathname;
  const qs = url.search;

  if (p.startsWith('/__templates/')) {
    const file = path.join(here, 'templates', path.basename(p));
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(file));
  }
  if (req.method === 'OPTIONS' && !p.startsWith('/functions/v1/')) return res.writeHead(204, cors(req)).end();
  if (p.startsWith('/rest/v1/')) return proxy(req, res, upstream.rest, p.slice('/rest/v1'.length) + qs, true);
  if (p.startsWith('/auth/v1/')) return proxy(req, res, upstream.auth, p.slice('/auth/v1'.length) + qs, true);
  if (p.startsWith('/functions/v1/')) {
    const rest = p.slice('/functions/v1'.length);
    const name = rest.split('/')[1] ?? '';
    if (req.method !== 'OPTIONS' && !noJwt.has(name)) {
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!token || !verifyJwt(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json', ...cors(req) });
        return res.end(JSON.stringify({ code: 401, message: 'Invalid JWT' }));
      }
    }
    return proxy(req, res, upstream.functions, rest + qs, false);
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'no route' }));
}).listen(PORT, '0.0.0.0', () => console.log(`gateway on :${PORT} (verify_jwt=false: ${[...noJwt].join(', ')})`));
