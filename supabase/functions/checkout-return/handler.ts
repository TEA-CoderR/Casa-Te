// GET /functions/v1/checkout-return?order=<uuid>&result=success|cancel&platform=native|web[&session_id=cs_...]
// Stripe redirects here after checkout. On success we settle the payment immediately (the webhook
// remains the source of truth and is idempotent), then bounce the customer back into the app
// (deep link) or the web shop. Redirect targets are fixed server-side: no open redirect.
import type { Config } from '../_shared/env.ts';
import { stripeRequest, type CheckoutSession } from '../_shared/stripe.ts';
import { settleCheckoutSession } from '../_shared/payments.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Supabase serves Edge Function responses to GET requests with `text/html` rewritten to
// `text/plain` (anti-phishing on *.supabase.co), so an HTML page shows up as raw source. Customers
// therefore only ever get a 303 redirect or, when there is nowhere to go, a short plain-text note.
function text(message: string, status = 200): Response {
  return new Response(`CASA & TE\n\n${message}\n`,
    { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function checkoutReturn(req: Request, config: Config): Promise<Response> {
  const url = new URL(req.url);
  const order = url.searchParams.get('order') ?? '';
  const result = url.searchParams.get('result') === 'success' ? 'success' : 'cancel';
  const platform = url.searchParams.get('platform') === 'web' ? 'web' : 'native';
  const sessionId = url.searchParams.get('session_id') ?? '';
  if (!UUID.test(order)) return text('Link non valido.', 400);

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
  if (!target) {
    // WEB_SHOP_URL not configured yet (e.g. staging without hosting): the payment is already settled.
    return text(result === 'success'
      ? 'Pagamento completato. Puoi chiudere questa pagina e tornare al negozio.'
      : 'Pagamento annullato. Puoi chiudere questa pagina e tornare al negozio.');
  }
  // Native: WebBrowser.openAuthSessionAsync watches for the casate:// redirect and closes the sheet.
  return new Response(null, { status: 303, headers: { Location: target, 'Cache-Control': 'no-store' } });
}
