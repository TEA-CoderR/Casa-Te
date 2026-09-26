// Payment settlement shared by the Stripe webhook and the checkout return endpoint.
import type { Config } from './env.ts';
import { rpc, select } from './supabase.ts';
import { stripeRequest, type CheckoutSession, type StripeRefund } from './stripe.ts';

export type SettleResult = 'paid' | 'already_paid' | 'needs_refund' | 'not_paid' | 'no_order';

function orderIdOf(session: CheckoutSession): string | null {
  return session.metadata?.order_id ?? session.client_reference_id ?? null;
}

/** Marks the order paid if the session is paid. Idempotent. Auto-refunds payments for expired orders. */
export async function settleCheckoutSession(config: Config, session: CheckoutSession): Promise<SettleResult> {
  const orderId = orderIdOf(session);
  if (!orderId) return 'no_order';
  if (session.payment_status !== 'paid') return 'not_paid';

  const result = await rpc<SettleResult>(config, config.serviceRoleKey, 'mark_order_paid', {
    p_order_id: orderId,
    p_session_id: session.id,
    p_payment_intent_id: session.payment_intent,
    p_amount_cents: session.amount_total,
  });

  if (result === 'needs_refund' && session.payment_intent) {
    const refund = await stripeRequest<StripeRefund>(config, 'POST', 'refunds', {
      payment_intent: session.payment_intent,
      reason: 'requested_by_customer',
      metadata: { order_id: orderId, cause: 'order_expired' },
    }, `auto-refund-${orderId}`);
    await recordRefund(config, orderId, refund, 'Rimborso automatico: pagamento arrivato dopo la scadenza', null);
  }
  return result;
}

export async function releaseOrder(config: Config, orderId: string, reason: string): Promise<boolean> {
  return await rpc<boolean>(config, config.serviceRoleKey, 'release_order', { p_order_id: orderId, p_reason: reason });
}

export async function recordRefund(
  config: Config, orderId: string, refund: StripeRefund, reason: string | null, actor: string | null,
): Promise<boolean> {
  return await rpc<boolean>(config, config.serviceRoleKey, 'record_refund', {
    p_order_id: orderId, p_amount_cents: refund.amount, p_stripe_refund_id: refund.id, p_reason: reason, p_actor: actor,
  });
}

export async function orderIdByPaymentIntent(config: Config, paymentIntent: string): Promise<string | null> {
  const rows = await select<{ id: string }>(config, config.serviceRoleKey, 'orders',
    `select=id&stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}&limit=1`);
  return rows[0]?.id ?? null;
}
