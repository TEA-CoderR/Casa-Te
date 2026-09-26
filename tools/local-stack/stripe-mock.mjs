// Minimal Stripe test-mode stand-in for local end-to-end runs (no network access to Stripe needed).
// Implements only what supabase/functions uses:
//   POST /v1/checkout/sessions, GET /v1/checkout/sessions/:id, POST /v1/checkout/sessions/:id/expire,
//   POST /v1/refunds
// plus a hosted payment page (/c/pay/:id) and signed webhooks (Stripe-Signature scheme v1), so the
// real webhook verification, settlement and refund code paths run unchanged.
// Test cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000 0002 is declined.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.STRIPE_MOCK_PORT ?? 12111);
const PUBLIC_URL = (process.env.STRIPE_MOCK_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const WEBHOOK_URL = process.env.STRIPE_WEBHOOK_URL ?? '';

const sessions = new Map();
const paymentIntents = new Map(); // id -> { amount, refunded }
const idempotency = new Map(); // key -> { fingerprint, status, body }
const events = [];

const rid = (prefix) => `${prefix}_test_${crypto.randomBytes(12).toString('hex')}`;
const now = () => Math.floor(Date.now() / 1000);

/** Parses Stripe's bracket form encoding (a[b][0][c]=1) into nested objects/arrays. */
function parseForm(body) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const keys = rawKey.replace(/\]/g, '').split('[');
    let node = out;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(keys[i + 1]);
      if (last) node[k] = value;
      else node = node[k] ??= nextIsIndex ? [] : {};
    });
  }
  return out;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const stripeError = (res, status, message, type = 'invalid_request_error', code) =>
  send(res, status, { error: { type, message, ...(code ? { code } : {}) } });

async function deliver(type, object) {
  const event = { id: rid('evt'), object: 'event', api_version: '2025-03-31.basil', created: now(), type, data: { object } };
  events.push(event);
  if (!WEBHOOK_URL) return;
  const payload = JSON.stringify(event);
  const t = now();
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` },
      });
      const text = await r.text();
      event.delivery = { status: r.status, body: text };
      console.log(`webhook ${type} ${event.id} -> ${r.status} ${text}`);
      if (r.ok) return;
    } catch (e) {
      console.log(`webhook ${type} attempt ${attempt} failed: ${e.message}`);
    }
    await new Promise((ok) => setTimeout(ok, 500 * attempt));
  }
}

function publicSession(s) {
  const { _successUrl, _cancelUrl, ...rest } = s;
  return rest;
}

function createSession(p) {
  const expiresAt = Number(p.expires_at ?? now() + 24 * 3600);
  if (expiresAt < now() + 30 * 60 - 5 || expiresAt > now() + 24 * 3600) {
    throw Object.assign(new Error('The `expires_at` timestamp must be between 30 minutes and 24 hours from Checkout Session creation.'), { param: 'expires_at' });
  }
  if (!p.success_url) throw new Error('Missing required param: success_url.');
  const items = p.line_items ?? [];
  if (!items.length) throw new Error('Missing required param: line_items.');
  const amount = items.reduce((sum, li) => sum + Number(li.price_data?.unit_amount ?? 0) * Number(li.quantity ?? 1), 0);
  if (!Number.isInteger(amount) || amount < 50) throw new Error('The Checkout Session\'s total amount due must add up to at least €0.50 eur');
  const id = rid('cs');
  const session = {
    id, object: 'checkout.session', mode: p.mode, livemode: false, locale: p.locale ?? null,
    currency: items[0].price_data?.currency ?? 'eur', amount_total: amount, amount_subtotal: amount,
    client_reference_id: p.client_reference_id ?? null, customer_email: p.customer_email ?? null,
    metadata: p.metadata ?? {}, payment_intent: null, payment_status: 'unpaid', status: 'open',
    expires_at: expiresAt, created: now(), url: `${PUBLIC_URL}/c/pay/${id}`,
    _successUrl: p.success_url, _cancelUrl: p.cancel_url ?? null,
    _description: items[0].price_data?.product_data?.name ?? '', _pi: p.payment_intent_data ?? {},
  };
  sessions.set(id, session);
  return session;
}

function createRefund(p) {
  const pi = paymentIntents.get(p.payment_intent);
  if (!pi) throw Object.assign(new Error(`No such payment_intent: '${p.payment_intent}'`), { status: 404, code: 'resource_missing' });
  const remaining = pi.amount - pi.refunded;
  const amount = p.amount === undefined ? remaining : Number(p.amount);
  if (remaining <= 0) throw Object.assign(new Error(`Charge for ${p.payment_intent} has already been refunded.`), { code: 'charge_already_refunded' });
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw Object.assign(new Error(`Refund amount (€${(amount / 100).toFixed(2)}) is greater than unrefunded amount on charge (€${(remaining / 100).toFixed(2)})`), { code: 'amount_too_large' });
  }
  pi.refunded += amount;
  return {
    id: rid('re'), object: 'refund', amount, currency: 'eur', status: 'succeeded', created: now(),
    payment_intent: p.payment_intent, reason: p.reason ?? null, metadata: p.metadata ?? {},
  };
}

const page = (title, body) => `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui;background:#f6f9fc;margin:0;padding:32px;color:#1a1f36}
main{max-width:420px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px #0001}
.badge{display:inline-block;background:#ffde92;color:#6b4b00;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600}
label{display:block;font-size:13px;margin:16px 0 6px}input{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid #ccd;border-radius:6px}
button{margin-top:20px;width:100%;padding:12px;font-size:16px;border:0;border-radius:6px;background:#635bff;color:#fff;cursor:pointer}
.amount{font-size:32px;font-weight:700;margin:8px 0}.err{color:#c0392b}a{color:#635bff}</style></head>
<body><main>${body}</main></body></html>`;

function payPage(s, error = '') {
  const euros = (s.amount_total / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  return page('Pagamento', `<span class="badge">MODALITÀ TEST (mock locale)</span>
<p>${s._description}</p><div class="amount" data-testid="amount">${euros}</div>
<p>${s.customer_email ?? ''}</p>
${error ? `<p class="err" data-testid="error">${error}</p>` : ''}
<form method="post"><label for="card">Numero carta</label>
<input id="card" name="card" value="4242 4242 4242 4242" autocomplete="off">
<label for="exp">Scadenza</label><input id="exp" name="exp" value="12 / 34">
<label for="cvc">CVC</label><input id="cvc" name="cvc" value="123">
<button type="submit">Paga ${euros}</button></form>
${s._cancelUrl ? `<p><a href="${s._cancelUrl}">← Annulla e torna al negozio</a></p>` : ''}`);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  const path = url.pathname;
  const body = await readBody(req);

  // ---- Hosted checkout page ----
  let m = path.match(/^\/c\/pay\/(cs_test_[0-9a-f]+)$/);
  if (m) {
    const s = sessions.get(m[1]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!s) return res.writeHead(404).end(page('Errore', '<h1>Sessione non trovata</h1>'));
    if (s.status === 'expired' || s.expires_at < now()) return res.end(page('Scaduta', '<h1>Questa sessione di pagamento è scaduta</h1>'));
    if (s.status === 'complete') return res.writeHead(303, { Location: s._successUrl.replace('{CHECKOUT_SESSION_ID}', s.id) }).end();
    if (req.method === 'GET') return res.end(payPage(s));
    const card = (new URLSearchParams(body).get('card') ?? '').replace(/\s+/g, '');
    if (card === '4000000000000002') return res.end(payPage(s, 'La carta è stata rifiutata.'));
    if (card !== '4242424242424242') return res.end(payPage(s, 'Numero di carta non valido. Usa 4242 4242 4242 4242.'));
    const piId = rid('pi');
    paymentIntents.set(piId, { amount: s.amount_total, refunded: 0, metadata: s._pi.metadata ?? {} });
    Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: piId });
    // Like Stripe, the webhook and the browser redirect race each other; both paths are idempotent.
    deliver('checkout.session.completed', publicSession(s));
    return res.writeHead(303, { Location: s._successUrl.replace('{CHECKOUT_SESSION_ID}', s.id) }).end();
  }

  if (path === '/favicon.ico') return res.writeHead(204).end();

  // ---- Mock inspection helpers (not part of Stripe) ----
  if (path === '/__mock/events') return send(res, 200, events);

  // ---- API ----
  if (!path.startsWith('/v1/')) return send(res, 404, { error: { message: 'Unrecognized request URL' } });
  if (req.headers.authorization !== `Bearer ${SECRET_KEY}` || !SECRET_KEY.startsWith('sk_test_')) {
    return stripeError(res, 401, 'Invalid API Key provided');
  }
  if (!req.headers['stripe-version']) return stripeError(res, 400, 'Missing Stripe-Version header (the functions pin it)');

  const key = req.headers['idempotency-key'];
  const fingerprint = `${req.method} ${path} ${body}`;
  if (key && idempotency.has(key)) {
    const hit = idempotency.get(key);
    if (hit.fingerprint !== fingerprint) return stripeError(res, 400, 'Keys for idempotent requests can only be used with the same parameters they were first used with.', 'idempotency_error');
    return send(res, hit.status, hit.body, { 'Idempotent-Replayed': 'true' });
  }
  const reply = (status, obj) => {
    if (key && req.method === 'POST') idempotency.set(key, { fingerprint, status, body: obj });
    send(res, status, obj);
  };

  try {
    const params = parseForm(body);
    if (req.method === 'POST' && path === '/v1/checkout/sessions') return reply(200, publicSession(createSession(params)));
    m = path.match(/^\/v1\/checkout\/sessions\/(cs_test_[0-9a-f]+)(\/expire)?$/);
    if (m) {
      const s = sessions.get(m[1]);
      if (!s) return stripeError(res, 404, `No such checkout.session: '${m[1]}'`, 'invalid_request_error', 'resource_missing');
      if (m[2] && req.method === 'POST') {
        if (s.status !== 'open') return stripeError(res, 400, 'Only Checkout Sessions with a status in [\'open\'] can be expired.');
        s.status = 'expired';
        await deliver('checkout.session.expired', publicSession(s));
        return reply(200, publicSession(s));
      }
      if (s.status === 'open' && s.expires_at < now()) s.status = 'expired';
      return send(res, 200, publicSession(s));
    }
    if (req.method === 'POST' && path === '/v1/refunds') {
      const refund = createRefund(params);
      reply(200, refund);
      deliver('refund.created', refund);
      return;
    }
    return stripeError(res, 404, `Unrecognized request URL (${req.method}: ${path}).`);
  } catch (e) {
    return stripeError(res, e.status ?? 400, e.message, 'invalid_request_error', e.code);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`stripe mock on ${PUBLIC_URL} (webhooks -> ${WEBHOOK_URL || 'disabled'})`));
