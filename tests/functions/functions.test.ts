// Unit tests for Supabase Edge Function handlers, run in Node with a mocked global fetch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Config } from '../../supabase/functions/_shared/env.ts';
import { handle } from '../../supabase/functions/_shared/http.ts';
import { loadConfig } from '../../supabase/functions/_shared/env.ts';
import { headers as supabaseHeaders } from '../../supabase/functions/_shared/supabase.ts';
import { formEncode, hmacSha256Hex, verifyStripeEvent } from '../../supabase/functions/_shared/stripe.ts';
import { checkout } from '../../supabase/functions/checkout/handler.ts';
import { checkoutReturn } from '../../supabase/functions/checkout-return/handler.ts';
import { stripeWebhook } from '../../supabase/functions/stripe-webhook/handler.ts';
import { adminRefund } from '../../supabase/functions/admin-refund/handler.ts';
import { deleteAccount } from '../../supabase/functions/delete-account/handler.ts';
import { buildEmail } from '../../supabase/functions/notify-order-event/handler.ts';

const config: Config = {
  supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon', serviceRoleKey: 'service',
  stripeSecretKey: 'sk_test_x', stripeWebhookSecret: 'whsec_test', webShopUrl: 'https://shop.casate.it', appScheme: 'casate',
};
const ORDER_ID = '11111111-2222-3333-4444-555555555555';

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
let calls: Call[] = [];
type Route = (call: Call) => Response | Promise<Response> | undefined;
let routes: Route[] = [];

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const route = (pattern: RegExp, fn: (c: Call) => Response | Promise<Response>): Route => (c) => (pattern.test(`${c.method} ${c.url}`) ? fn(c) : undefined);
const callsTo = (pattern: RegExp) => calls.filter((c) => pattern.test(`${c.method} ${c.url}`));

beforeEach(() => {
  calls = []; routes = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const call: Call = { url, method: init?.method ?? 'GET', headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body ?? '') };
    calls.push(call);
    for (const r of routes) { const res = await r(call); if (res) return res; }
    throw new Error(`Unmocked fetch: ${call.method} ${url}`);
  }) as typeof fetch;
});

const post = (path: string, body: unknown, token = 'user-jwt') => new Request(`https://fn.local/${path}`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const decode = (body: string) => Object.fromEntries(new URLSearchParams(body).entries());

// --------------------------------------------------------------------------------------------

test('formEncode encodes nested Stripe params', () => {
  const s = formEncode({ a: 1, b: { c: 'x y' }, items: [{ q: 1, p: { amount: 500 } }], skip: undefined, tags: ['t1'] });
  assert.equal(decodeURIComponent(s), 'a=1&b[c]=x y&items[0][q]=1&items[0][p][amount]=500&tags[0]=t1');
});

test('Stripe signature verification', async () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 't', data: { object: {} } });
  const t = 1_800_000_000;
  const sig = await hmacSha256Hex('whsec_test', `${t}.${payload}`);
  const event = await verifyStripeEvent(payload, `t=${t},v1=${sig}`, 'whsec_test', 300, t + 10);
  assert.equal(event.id, 'evt_1');
  await assert.rejects(verifyStripeEvent(payload, `t=${t},v1=${sig.replace(/.$/, '0')}`, 'whsec_test', 300, t), /invalid_signature/);
  await assert.rejects(verifyStripeEvent(payload, `t=${t},v1=${sig}`, 'whsec_test', 300, t + 301), /signature_expired/);
  await assert.rejects(verifyStripeEvent(payload, null, 'whsec_test'), /missing_signature/);
});

test('checkout: creates order server-side and a Stripe session for the stored total', async () => {
  routes = [
    route(/GET .*\/auth\/v1\/user$/, () => jsonRes({ id: 'u1', email: 'anna@example.com' })),
    route(/POST .*\/rpc\/create_order$/, () => jsonRes({ id: ORDER_ID, order_number: 'CT26001001', total_cents: 3188, customer_email: 'anna@example.com', expires_at: '' })),
    route(/POST https:\/\/api\.stripe\.com\/v1\/checkout\/sessions$/, () => jsonRes({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })),
    route(/POST .*\/rpc\/attach_checkout_session$/, () => new Response(null, { status: 204 })),
  ];
  const res = await handle((r) => checkout(r, config))(post('checkout', { platform: 'native', order: { store_id: 's', items: [], total_cents: 1 } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { order_id: ORDER_ID, order_number: 'CT26001001', checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

  const create = callsTo(/create_order/)[0];
  assert.equal(create.headers.authorization, 'Bearer user-jwt', 'order created with the user token (auth.uid)');
  assert.deepEqual(JSON.parse(create.body), { p: { store_id: 's', items: [], total_cents: 1 } });

  const stripe = callsTo(/checkout\/sessions/)[0];
  const params = decode(stripe.body);
  assert.equal(params['line_items[0][price_data][unit_amount]'], '3188', 'Stripe charges the DB total');
  assert.equal(params['line_items[0][price_data][currency]'], 'eur');
  assert.equal(params['metadata[order_id]'], ORDER_ID);
  assert.equal(params['payment_intent_data[metadata][order_id]'], ORDER_ID);
  assert.equal(params.customer_email, 'anna@example.com');
  assert.match(params.success_url, /checkout-return\?order=.*&result=success&platform=native&session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(stripe.headers['idempotency-key'], `checkout-${ORDER_ID}`);
  assert.equal(stripe.headers.authorization, 'Bearer sk_test_x');

  const attach = callsTo(/attach_checkout_session/)[0];
  assert.equal(attach.headers.authorization, 'Bearer service', 'attach uses service role');
});

test('checkout: releases reserved stock when Stripe fails', async () => {
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'u1' })),
    route(/rpc\/create_order$/, () => jsonRes({ id: ORDER_ID, order_number: 'CT1', total_cents: 500, customer_email: null, expires_at: '' })),
    route(/api\.stripe\.com/, () => jsonRes({ error: { message: 'boom' } }, 500)),
    route(/rpc\/release_order$/, () => jsonRes(true)),
  ];
  const res = await handle((r) => checkout(r, config))(post('checkout', { order: {} }));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'payment_unavailable');
  assert.equal(JSON.parse(callsTo(/release_order/)[0].body).p_order_id, ORDER_ID);
});

test('checkout: database errors surface as codes (e.g. insufficient_stock)', async () => {
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'u1' })),
    route(/rpc\/create_order$/, () => jsonRes({ code: 'P0001', message: 'insufficient_stock' }, 400)),
  ];
  const res = await handle((r) => checkout(r, config))(post('checkout', { order: {} }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'insufficient_stock');
  assert.equal(callsTo(/stripe/).length, 0);
});

test('checkout: requires authentication', async () => {
  const req = new Request('https://fn.local/checkout', { method: 'POST', body: '{}' });
  const res = await handle((r) => checkout(r, config))(req);
  assert.equal(res.status, 401);
});

test('checkout-return: settles payment then redirects to app or web shop', async () => {
  routes = [
    route(/GET https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/cs_test_1$/, () => jsonRes({
      id: 'cs_test_1', payment_status: 'paid', status: 'complete', amount_total: 3188, payment_intent: 'pi_1',
      client_reference_id: ORDER_ID, metadata: { order_id: ORDER_ID } })),
    route(/rpc\/mark_order_paid$/, () => jsonRes('paid')),
  ];
  const native = await checkoutReturn(new Request(`https://fn/x?order=${ORDER_ID}&result=success&platform=native&session_id=cs_test_1`), config);
  assert.equal(native.status, 200);
  assert.match(await native.text(), new RegExp(`casate://checkout/return\\?order=${ORDER_ID}&amp;result=success|casate://checkout/return\\?order=${ORDER_ID}&result=success`));
  assert.deepEqual(JSON.parse(callsTo(/mark_order_paid/)[0].body), { p_order_id: ORDER_ID, p_session_id: 'cs_test_1', p_payment_intent_id: 'pi_1', p_amount_cents: 3188 });

  const web = await checkoutReturn(new Request(`https://fn/x?order=${ORDER_ID}&result=cancel&platform=web`), config);
  assert.equal(web.status, 303);
  assert.equal(web.headers.get('location'), `https://shop.casate.it/checkout/return?order=${ORDER_ID}&result=cancel`);

  const bad = await checkoutReturn(new Request('https://fn/x?order=javascript:alert(1)&platform=web'), config);
  assert.match(await bad.text(), /Link non valido/);
});

async function signedWebhook(event: unknown) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(config.stripeWebhookSecret, `${t}.${payload}`);
  return new Request('https://fn/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
}

test('webhook: checkout.session.completed marks the order paid and logs the event', async () => {
  routes = [
    route(/GET .*stripe_events/, () => jsonRes([])),
    route(/rpc\/mark_order_paid$/, () => jsonRes('paid')),
    route(/POST .*\/rest\/v1\/stripe_events$/, () => jsonRes([{ id: 'evt_1' }], 201)),
  ];
  const res = await handle((r) => stripeWebhook(r, config))(await signedWebhook({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', payment_status: 'paid', amount_total: 999, payment_intent: 'pi_9', metadata: { order_id: ORDER_ID } } } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).outcome, 'paid');
  assert.equal(JSON.parse(callsTo(/mark_order_paid/)[0].body).p_amount_cents, 999);
  assert.equal(callsTo(/POST .*stripe_events/).length, 1, 'event recorded after processing');
});

test('webhook: duplicate events are skipped', async () => {
  routes = [route(/GET .*stripe_events/, () => jsonRes([{ id: 'evt_1' }]))];
  const res = await handle((r) => stripeWebhook(r, config))(await signedWebhook({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } }));
  assert.equal((await res.json()).duplicate, true);
  assert.equal(callsTo(/rpc/).length, 0);
});

test('webhook: late payment for an expired order is refunded automatically', async () => {
  routes = [
    route(/GET .*stripe_events/, () => jsonRes([])),
    route(/rpc\/mark_order_paid$/, () => jsonRes('needs_refund')),
    route(/POST https:\/\/api\.stripe\.com\/v1\/refunds$/, () => jsonRes({ id: 're_1', amount: 999, status: 'succeeded', payment_intent: 'pi_9', metadata: {} })),
    route(/rpc\/record_refund$/, () => jsonRes(true)),
    route(/POST .*stripe_events/, () => jsonRes([{}], 201)),
  ];
  await handle((r) => stripeWebhook(r, config))(await signedWebhook({ id: 'evt_2', type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', payment_status: 'paid', amount_total: 999, payment_intent: 'pi_9', metadata: { order_id: ORDER_ID } } } }));
  assert.equal(decode(callsTo(/v1\/refunds/)[0].body).payment_intent, 'pi_9');
  assert.equal(callsTo(/v1\/refunds/)[0].headers['idempotency-key'], `auto-refund-${ORDER_ID}`);
  assert.deepEqual(JSON.parse(callsTo(/record_refund/)[0].body).p_stripe_refund_id, 're_1');
});

test('webhook: expired sessions release stock; bad signatures are rejected', async () => {
  routes = [
    route(/GET .*stripe_events/, () => jsonRes([])),
    route(/rpc\/release_order$/, () => jsonRes(true)),
    route(/POST .*stripe_events/, () => jsonRes([{}], 201)),
  ];
  const res = await handle((r) => stripeWebhook(r, config))(await signedWebhook({ id: 'evt_3', type: 'checkout.session.expired', data: { object: {
    id: 'cs_1', payment_status: 'unpaid', metadata: { order_id: ORDER_ID } } } }));
  assert.equal((await res.json()).outcome, 'released');

  const forged = new Request('https://fn/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=abc' }, body: '{}' });
  assert.equal((await handle((r) => stripeWebhook(r, config))(forged)).status, 400);
});

test('webhook: refunds made in the Stripe dashboard are recorded', async () => {
  routes = [
    route(/GET .*stripe_events/, () => jsonRes([])),
    route(/GET .*orders\?select=id&stripe_payment_intent_id=eq\.pi_7/, () => jsonRes([{ id: ORDER_ID }])),
    route(/rpc\/record_refund$/, () => jsonRes(true)),
    route(/POST .*stripe_events/, () => jsonRes([{}], 201)),
  ];
  const res = await handle((r) => stripeWebhook(r, config))(await signedWebhook({ id: 'evt_4', type: 'refund.created', data: { object: {
    id: 're_7', amount: 500, status: 'succeeded', payment_intent: 'pi_7', metadata: {} } } }));
  assert.equal((await res.json()).outcome, 'refund_recorded');
  assert.equal(JSON.parse(callsTo(/record_refund/)[0].body).p_amount_cents, 500);
});

test('admin-refund: only managers; bounded amounts; optional cancel', async () => {
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'staff1' })),
    route(/rpc\/is_manager$/, () => jsonRes(false)),
  ];
  let res = await handle((r) => adminRefund(r, config))(post('admin-refund', { order_id: ORDER_ID }));
  assert.equal(res.status, 403);

  const order = { id: ORDER_ID, status: 'paid', payment_status: 'paid', total_cents: 3000, refunded_cents: 1000, stripe_payment_intent_id: 'pi_1' };
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'staff1' })),
    route(/rpc\/is_manager$/, () => jsonRes(true)),
    route(/GET .*\/rest\/v1\/orders/, () => jsonRes([order])),
    route(/POST https:\/\/api\.stripe\.com\/v1\/refunds$/, (c) => jsonRes({ id: 're_2', amount: Number(decode(c.body).amount), status: 'succeeded', payment_intent: 'pi_1' })),
    route(/rpc\/record_refund$/, () => jsonRes(true)),
    route(/rpc\/staff_set_order_status$/, () => jsonRes(order)),
  ];
  res = await handle((r) => adminRefund(r, config))(post('admin-refund', { order_id: ORDER_ID, amount_cents: 2001 }));
  assert.equal(res.status, 400, 'cannot refund more than remaining');

  res = await handle((r) => adminRefund(r, config))(post('admin-refund', { order_id: ORDER_ID, cancel: true, reason: 'Merce danneggiata' }));
  assert.equal(res.status, 200);
  assert.equal(decode(callsTo(/v1\/refunds/)[0].body).amount, '2000', 'defaults to remaining amount');
  assert.equal(JSON.parse(callsTo(/record_refund/)[0].body).p_actor, 'staff1');
  assert.equal(JSON.parse(callsTo(/staff_set_order_status/)[0].body).p_status, 'cancelled');
  assert.equal(callsTo(/staff_set_order_status/)[0].headers.authorization, 'Bearer user-jwt', 'status change as the staff user');
});

test('delete-account: needs confirmation and no orders in progress', async () => {
  let res = await handle((r) => deleteAccount(r, config))(post('delete-account', {}));
  assert.equal(res.status, 400);
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'u1' })),
    route(/GET .*\/rest\/v1\/orders/, () => jsonRes([{ id: 'o' }])),
  ];
  res = await handle((r) => deleteAccount(r, config))(post('delete-account', { confirm: 'ELIMINA' }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'orders_in_progress');
  routes = [
    route(/auth\/v1\/user$/, () => jsonRes({ id: 'u1' })),
    route(/GET .*\/rest\/v1\/orders/, () => jsonRes([])),
    route(/GET .*\/rest\/v1\/staff_members/, () => jsonRes([])),
    route(/DELETE .*\/auth\/v1\/admin\/users\/u1$/, () => jsonRes({})),
  ];
  res = await handle((r) => deleteAccount(r, config))(post('delete-account', { confirm: 'ELIMINA' }));
  assert.equal(res.status, 200);
  assert.equal(callsTo(/DELETE/)[0].headers.authorization, 'Bearer service');
});

test('notification emails', () => {
  const order = { id: ORDER_ID, order_number: 'CT26001001', fulfilment: 'store' as const, customer_email: 'a@b.it', customer_name: 'Anna Rossi',
    total_cents: 3188, tracking_number: null, tracking_url: null, carrier: null, store_id: 's' };
  const paid = buildEmail({ id: 1, order_id: ORDER_ID, status: 'paid', kind: 'status', note: null, visible_to_customer: true }, order, 'CASA & TE Lucca 1');
  assert.equal(paid?.subject, 'Ordine CT26001001 confermato');
  assert.match(paid!.body, /Ciao Anna,/);
  assert.match(paid!.body, /€31,88/);
  const ready = buildEmail({ id: 2, order_id: ORDER_ID, status: 'ready', kind: 'status', note: null, visible_to_customer: true }, order, 'CASA & TE Lucca 1');
  assert.match(ready!.body, /CASA &amp; TE Lucca 1/);
  assert.equal(buildEmail({ id: 3, order_id: ORDER_ID, status: 'picking', kind: 'status', note: null, visible_to_customer: true }, order, 'x'), null);
  assert.equal(buildEmail({ id: 4, order_id: ORDER_ID, status: 'cancelled', kind: 'status', note: 'Tempo per il pagamento scaduto', visible_to_customer: true }, order, 'x'), null);
  const xss = buildEmail({ id: 5, order_id: ORDER_ID, status: 'paid', kind: 'status', note: null, visible_to_customer: true }, { ...order, customer_name: '<script>' }, 'x');
  assert.ok(!xss!.body.includes('<script>'));
});

// ---- Supabase API keys (legacy JWT keys and new sb_publishable_/sb_secret_ keys) ---------------

test('supabase headers: new-format keys go only in apikey, JWTs in Authorization', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig';
  assert.deepEqual(supabaseHeaders(config, jwt), { apikey: 'anon', Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' });
  const secret = supabaseHeaders({ ...config, anonKey: 'sb_publishable_x' }, 'sb_secret_x');
  assert.equal(secret.apikey, 'sb_secret_x');
  assert.equal(secret.Authorization, undefined, 'a non-JWT key in Authorization is rejected by PostgREST');
});

test('checkout with a new-format secret key: service-role calls send it as apikey only', async () => {
  const cfg = { ...config, anonKey: 'sb_publishable_x', serviceRoleKey: 'sb_secret_x' };
  routes = [
    route(/GET .*\/auth\/v1\/user$/, () => jsonRes({ id: 'u1', email: 'anna@example.com' })),
    route(/POST .*\/rpc\/create_order$/, () => jsonRes({ id: ORDER_ID, order_number: 'CT26001001', total_cents: 3188, customer_email: 'anna@example.com', expires_at: '' })),
    route(/POST https:\/\/api\.stripe\.com\/v1\/checkout\/sessions$/, () => jsonRes({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })),
    route(/POST .*\/rpc\/attach_checkout_session$/, () => new Response(null, { status: 204 })),
  ];
  const res = await handle((r) => checkout(r, cfg))(post('checkout', { platform: 'web', order: {} }));
  assert.equal(res.status, 200);
  const create = callsTo(/create_order/)[0];
  assert.equal(create.headers.apikey, 'sb_publishable_x');
  assert.equal(create.headers.authorization, 'Bearer user-jwt');
  const attach = callsTo(/attach_checkout_session/)[0];
  assert.equal(attach.headers.apikey, 'sb_secret_x');
  assert.equal(attach.headers.authorization, undefined);
});

test('loadConfig prefers SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS over legacy keys', () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_SECRET_KEYS'] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, { SUPABASE_URL: 'https://p.supabase.co/', SUPABASE_ANON_KEY: 'legacy-anon', SUPABASE_SERVICE_ROLE_KEY: 'legacy-service' });
    delete process.env.SUPABASE_PUBLISHABLE_KEYS; delete process.env.SUPABASE_SECRET_KEYS;
    assert.deepEqual([loadConfig().anonKey, loadConfig().serviceRoleKey, loadConfig().supabaseUrl], ['legacy-anon', 'legacy-service', 'https://p.supabase.co']);
    process.env.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({ default: 'sb_publishable_new' });
    process.env.SUPABASE_SECRET_KEYS = JSON.stringify({ default: 'sb_secret_new' });
    assert.deepEqual([loadConfig().anonKey, loadConfig().serviceRoleKey], ['sb_publishable_new', 'sb_secret_new']);
    delete process.env.SUPABASE_ANON_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SECRET_KEYS = 'not json';
    assert.throws(() => loadConfig(), /SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
