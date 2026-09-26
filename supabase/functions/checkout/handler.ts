// POST /functions/v1/checkout
// Body: { action?: 'create', platform: 'native' | 'web', order: CreateOrderInput }
//    or { action: 'resume', order_id }
// Creates the order server-side (prices, shipping and stock computed in Postgres), then a Stripe
// Checkout Session for exactly the stored total. Returns { order_id, order_number, checkout_url }.
import type { Config } from '../_shared/env.ts';
import { bearer, HttpError, json, readJson } from '../_shared/http.ts';
import { getUser, rpc, select } from '../_shared/supabase.ts';
import { stripeRequest, type CheckoutSession } from '../_shared/stripe.ts';
import { releaseOrder } from '../_shared/payments.ts';

type Body = {
  action?: 'create' | 'resume';
  platform?: 'native' | 'web';
  order?: Record<string, unknown>;
  order_id?: string;
};

type CreatedOrder = { id: string; order_number: string; total_cents: number; customer_email: string | null; expires_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function returnUrl(config: Config, orderId: string, result: 'success' | 'cancel', platform: 'native' | 'web'): string {
  const base = `${config.supabaseUrl}/functions/v1/checkout-return?order=${orderId}&result=${result}&platform=${platform}`;
  return result === 'success' ? `${base}&session_id={CHECKOUT_SESSION_ID}` : base;
}

export async function checkout(req: Request, config: Config): Promise<Response> {
  const token = bearer(req);
  const user = await getUser(config, token);
  const body = await readJson<Body>(req);
  const platform = body.platform === 'web' ? 'web' : 'native';

  if (body.action === 'resume') {
    if (!body.order_id || !UUID.test(body.order_id)) throw new HttpError(400, 'order_not_found');
    // RLS: the user token only returns the caller's own orders.
    const [order] = await select<{ id: string; order_number: string; status: string; stripe_checkout_session_id: string | null }>(
      config, token, 'orders', `select=id,order_number,status,stripe_checkout_session_id&id=eq.${body.order_id}`);
    if (!order || order.status !== 'pending_payment' || !order.stripe_checkout_session_id) throw new HttpError(409, 'order_not_pending');
    const session = await stripeRequest<CheckoutSession>(config, 'GET', `checkout/sessions/${order.stripe_checkout_session_id}`);
    if (session.status !== 'open' || !session.url) throw new HttpError(409, 'order_not_pending');
    return json(req, { order_id: order.id, order_number: order.order_number, checkout_url: session.url });
  }

  if (!body.order || typeof body.order !== 'object') throw new HttpError(400, 'invalid_order');
  const order = await rpc<CreatedOrder>(config, token, 'create_order', { p: body.order });

  try {
    const metadata = { order_id: order.id, order_number: order.order_number };
    const session = await stripeRequest<CheckoutSession>(config, 'POST', 'checkout/sessions', {
      mode: 'payment',
      locale: 'it',
      client_reference_id: order.id,
      customer_email: order.customer_email ?? user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: order.total_cents,
          product_data: { name: `Ordine CASA & TE ${order.order_number}` },
        },
      }],
      metadata,
      payment_intent_data: { metadata, description: `Ordine ${order.order_number}` },
      // Stripe minimum is 30 minutes; the order itself expires 35 minutes after creation.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: returnUrl(config, order.id, 'success', platform),
      cancel_url: returnUrl(config, order.id, 'cancel', platform),
    }, `checkout-${order.id}`);
    if (!session.url) throw new HttpError(502, 'payment_unavailable');
    await rpc(config, config.serviceRoleKey, 'attach_checkout_session', { p_order_id: order.id, p_session_id: session.id });
    return json(req, { order_id: order.id, order_number: order.order_number, checkout_url: session.url });
  } catch (error) {
    // Never leave stock reserved for an order that cannot be paid.
    await releaseOrder(config, order.id, 'Pagamento non avviato').catch((e) => console.error('release failed', e));
    throw error;
  }
}
