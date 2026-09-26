// Serves every Edge Function from one Deno process, the way the Supabase Edge Runtime does:
// POST /<function-name>/... → that function's handler, wrapped exactly like its index.ts.
// JWT verification (verify_jwt) is done by the gateway in front of this server.
import { loadConfig } from '../../supabase/functions/_shared/env.ts';
import { handle } from '../../supabase/functions/_shared/http.ts';
import { adminRefund } from '../../supabase/functions/admin-refund/handler.ts';
import { adminStaff } from '../../supabase/functions/admin-staff/handler.ts';
import { checkoutReturn } from '../../supabase/functions/checkout-return/handler.ts';
import { checkout } from '../../supabase/functions/checkout/handler.ts';
import { deleteAccount } from '../../supabase/functions/delete-account/handler.ts';
import { notifyOrderEvent } from '../../supabase/functions/notify-order-event/handler.ts';
import { stripeWebhook } from '../../supabase/functions/stripe-webhook/handler.ts';
import type { Config } from '../../supabase/functions/_shared/env.ts';

const config = loadConfig();
const handlers: Record<string, (req: Request, config: Config) => Promise<Response>> = {
  'admin-refund': adminRefund,
  'admin-staff': adminStaff,
  'checkout-return': checkoutReturn,
  'checkout': checkout,
  'delete-account': deleteAccount,
  'notify-order-event': notifyOrderEvent,
  'stripe-webhook': stripeWebhook,
};
const wrapped = Object.fromEntries(
  Object.entries(handlers).map(([name, fn]) => [name, handle((req) => fn(req, config))]),
);

const port = Number(Deno.env.get('FUNCTIONS_PORT') ?? '54331');
Deno.serve({ port, hostname: '127.0.0.1' }, (req) => {
  const name = new URL(req.url).pathname.split('/')[1] ?? '';
  const fn = wrapped[name];
  if (!fn) return new Response(JSON.stringify({ error: 'function_not_found' }), { status: 404 });
  return fn(req);
});
