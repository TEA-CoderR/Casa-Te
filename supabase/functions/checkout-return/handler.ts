// GET /functions/v1/checkout-return?order=<uuid>&result=success|cancel&platform=native|web[&session_id=cs_...]
// Stripe redirects here after checkout. On success we settle the payment immediately (the webhook
// remains the source of truth and is idempotent), then bounce the customer back into the app
// (deep link) or the web shop. Redirect targets are fixed server-side: no open redirect.
import type { Config } from '../_shared/env.ts';
import { stripeRequest, type CheckoutSession } from '../_shared/stripe.ts';
import { settleCheckoutSession } from '../_shared/payments.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function html(message: string, target?: string): Response {
  const link = target ? `<p><a href="${target}">Torna all'app CASA &amp; TE</a></p>` : '';
  const redirect = target ? `<meta http-equiv="refresh" content="0;url=${target}">` : '';
  return new Response(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${redirect}` +
    `<title>CASA &amp; TE</title></head><body style="font-family:system-ui;padding:32px;text-align:center;color:#182019">` +
    `<h1 style="color:#2F6634">${message}</h1>${link}</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function checkoutReturn(req: Request, config: Config): Promise<Response> {
  const url = new URL(req.url);
  const order = url.searchParams.get('order') ?? '';
  const result = url.searchParams.get('result') === 'success' ? 'success' : 'cancel';
  const platform = url.searchParams.get('platform') === 'web' ? 'web' : 'native';
  const sessionId = url.searchParams.get('session_id') ?? '';
  if (!UUID.test(order)) return html('Link non valido');

  if (result === 'success' && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    try {
      const session = await stripeRequest<CheckoutSession>(config, 'GET', `checkout/sessions/${sessionId}`);
      if ((session.metadata?.order_id ?? session.client_reference_id) === order) await settleCheckoutSession(config, session);
    } catch (error) {
      console.error('settle on return failed (webhook will retry)', error);
    }
  }

  const query = `order=${order}&result=${result}`;
  const target = platform === 'native'
    ? `${config.appScheme}://checkout/return?${query}`
    : config.webShopUrl ? `${config.webShopUrl}/checkout/return?${query}` : undefined;
  if (!target) return html(result === 'success' ? 'Pagamento completato' : 'Pagamento annullato');
  if (platform === 'native') {
    // Some in-app browsers ignore 30x to custom schemes; an HTML page with a link always works.
    return html(result === 'success' ? 'Pagamento completato' : 'Pagamento annullato', target);
  }
  return new Response(null, { status: 303, headers: { Location: target, 'Cache-Control': 'no-store' } });
}
