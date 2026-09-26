// POST /functions/v1/admin-refund   (admin / manager only)
// Body: { order_id, amount_cents?: number (default: remaining amount), reason?: string, cancel?: boolean }
// Issues a Stripe refund, records it, and optionally cancels the order (restocking items).
import type { Config } from '../_shared/env.ts';
import { bearer, HttpError, json, readJson } from '../_shared/http.ts';
import { getUser, rpc, select } from '../_shared/supabase.ts';
import { stripeRequest, type StripeRefund } from '../_shared/stripe.ts';
import { recordRefund } from '../_shared/payments.ts';

type Body = { order_id?: string; amount_cents?: number; reason?: string; cancel?: boolean };
type OrderLite = {
  id: string; status: string; payment_status: string; total_cents: number; refunded_cents: number;
  stripe_payment_intent_id: string | null;
};

export async function adminRefund(req: Request, config: Config): Promise<Response> {
  const token = bearer(req);
  const user = await getUser(config, token);
  const body = await readJson<Body>(req);
  if (!(await rpc<boolean>(config, token, 'is_manager', {}))) throw new HttpError(403, 'forbidden');
  if (!body.order_id) throw new HttpError(400, 'order_not_found');

  // Read with the staff token so RLS applies.
  const [order] = await select<OrderLite>(config, token, 'orders',
    `select=id,status,payment_status,total_cents,refunded_cents,stripe_payment_intent_id&id=eq.${encodeURIComponent(body.order_id)}`);
  if (!order) throw new HttpError(404, 'order_not_found');

  const remaining = order.total_cents - order.refunded_cents;
  const amount = body.amount_cents ?? remaining;
  if (remaining > 0 && order.payment_status !== 'unpaid') {
    if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) throw new HttpError(400, 'invalid_refund_amount');
    if (!order.stripe_payment_intent_id) throw new HttpError(409, 'order_not_refundable');
    const reason = body.reason?.trim().slice(0, 300) || null;
    const refund = await stripeRequest<StripeRefund>(config, 'POST', 'refunds', {
      payment_intent: order.stripe_payment_intent_id,
      amount,
      metadata: { order_id: order.id, staff_user_id: user.id, reason: reason ?? '' },
    }, `refund-${order.id}-${order.refunded_cents}-${amount}`);
    await recordRefund(config, order.id, refund, reason, user.id);
  } else if (!body.cancel) {
    throw new HttpError(409, 'order_not_refundable');
  }

  if (body.cancel && order.status !== 'cancelled') {
    await rpc(config, token, 'staff_set_order_status', {
      p_order_id: order.id, p_status: 'cancelled', p_note: body.reason ?? 'Ordine annullato e rimborsato',
    });
  }

  const [updated] = await select<OrderLite>(config, token, 'orders', `select=*&id=eq.${order.id}`);
  return json(req, { order: updated });
}
