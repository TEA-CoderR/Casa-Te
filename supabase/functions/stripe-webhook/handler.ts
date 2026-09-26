// POST /functions/v1/stripe-webhook  (verify_jwt = false; authenticated by Stripe signature)
// Subscribe in the Stripe dashboard to:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed, checkout.session.expired,
//   refund.created, refund.updated
import type { Config } from '../_shared/env.ts';
import { HttpError } from '../_shared/http.ts';
import { insertIgnoreDuplicate, select } from '../_shared/supabase.ts';
import { verifyStripeEvent, type CheckoutSession, type StripeRefund } from '../_shared/stripe.ts';
import { orderIdByPaymentIntent, recordRefund, releaseOrder, settleCheckoutSession } from '../_shared/payments.ts';

function ok(body: Record<string, unknown> = { received: true }): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function stripeWebhook(req: Request, config: Config): Promise<Response> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const payload = await req.text();
  const event = await verifyStripeEvent(payload, req.headers.get('stripe-signature'), config.stripeWebhookSecret);

  // Skip events already processed. The row is written only AFTER successful processing, so a
  // failure makes Stripe retry; every handler below is idempotent anyway.
  const seen = await select<{ id: string }>(config, config.serviceRoleKey, 'stripe_events', `select=id&id=eq.${encodeURIComponent(event.id)}`);
  if (seen.length) return ok({ received: true, duplicate: true });

  const object = event.data.object;
  let outcome: string = 'ignored';
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      outcome = await settleCheckoutSession(config, object as unknown as CheckoutSession);
      break;
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = object as unknown as CheckoutSession;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (orderId) {
        const released = await releaseOrder(config, orderId,
          event.type === 'checkout.session.expired' ? 'Tempo per il pagamento scaduto' : 'Pagamento non riuscito');
        outcome = released ? 'released' : 'noop';
      }
      break;
    }
    case 'refund.created':
    case 'refund.updated': {
      const refund = object as unknown as StripeRefund;
      if ((refund.status === 'succeeded' || refund.status === 'pending') && refund.payment_intent) {
        const orderId = refund.metadata?.order_id ?? await orderIdByPaymentIntent(config, refund.payment_intent);
        if (orderId) {
          outcome = (await recordRefund(config, orderId, refund, 'Rimborso registrato da Stripe', null)) ? 'refund_recorded' : 'refund_known';
        }
      } else if (refund.status === 'failed' || refund.status === 'canceled') {
        console.error(`Refund ${refund.id} ${refund.status}: manual reconciliation required`);
        outcome = 'refund_failed_logged';
      }
      break;
    }
  }

  await insertIgnoreDuplicate(config, config.serviceRoleKey, 'stripe_events', { id: event.id, type: event.type });
  return ok({ received: true, outcome });
}
