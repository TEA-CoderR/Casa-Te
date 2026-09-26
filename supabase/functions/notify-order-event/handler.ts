// POST /functions/v1/notify-order-event   (verify_jwt = false; called by a Supabase Database Webhook)
// Configure in Supabase: Database → Webhooks → on INSERT into public.order_events → this URL,
// with HTTP header `x-webhook-secret: <ORDER_WEBHOOK_SECRET>`.
// Sends transactional emails through Resend (RESEND_API_KEY, EMAIL_FROM). No-op if not configured.
import type { Config } from '../_shared/env.ts';
import { env } from '../_shared/env.ts';
import { HttpError } from '../_shared/http.ts';
import { select } from '../_shared/supabase.ts';

type EventRecord = { id: number; order_id: string; status: string | null; kind: string; note: string | null; visible_to_customer: boolean };
type Payload = { type: string; table: string; record: EventRecord };
type Order = {
  id: string; order_number: string; fulfilment: 'home' | 'pickup' | 'store'; customer_email: string | null;
  customer_name: string | null; total_cents: number; tracking_number: string | null; tracking_url: string | null;
  carrier: string | null; store_id: string;
};

const euro = (c: number) => `€${(c / 100).toFixed(2).replace('.', ',')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function buildEmail(event: EventRecord, order: Order, storeName: string): { subject: string; body: string } | null {
  const n = order.order_number;
  const hello = `Ciao${order.customer_name ? ` ${esc(order.customer_name.split(' ')[0])}` : ''},`;
  let subject: string; let body: string;
  if (event.kind === 'refund') {
    subject = `Rimborso per l'ordine ${n}`;
    body = `${esc(event.note ?? 'Abbiamo emesso un rimborso.')} L'accredito può richiedere 5–10 giorni lavorativi.`;
  } else if (event.kind === 'status') {
    switch (event.status) {
      case 'paid':
        subject = `Ordine ${n} confermato`;
        body = `grazie per il tuo ordine di ${euro(order.total_cents)}. Ti avviseremo quando sarà pronto.`; break;
      case 'ready':
        if (order.fulfilment !== 'store') return null;
        subject = `Ordine ${n} pronto per il ritiro`;
        body = `il tuo ordine ti aspetta presso ${esc(storeName)}. Porta con te il numero d'ordine ${n}.`; break;
      case 'shipped':
        subject = `Ordine ${n} spedito`;
        body = `il tuo ordine è stato affidato al corriere${order.carrier ? ` ${esc(order.carrier)}` : ''}.` +
          (order.tracking_url ? ` <a href="${esc(order.tracking_url)}">Segui la spedizione</a>` : order.tracking_number ? ` Codice di tracciamento: ${esc(order.tracking_number)}.` : ''); break;
      case 'cancelled':
        if (event.note?.includes('scaduto') || event.note?.includes('prima del pagamento') || event.note?.includes('non avviato')) return null;
        subject = `Ordine ${n} annullato`;
        body = `il tuo ordine è stato annullato.${event.note ? ` Motivo: ${esc(event.note)}.` : ''} Se avevi già pagato riceverai il rimborso.`; break;
      default:
        return null;
    }
  } else {
    return null;
  }
  return {
    subject,
    body: `<div style="font-family:system-ui,Arial,sans-serif;color:#182019;max-width:560px">` +
      `<h2 style="color:#2F6634">CASA &amp; TE</h2><p>${hello}</p><p>${body}</p>` +
      `<p style="color:#6F786F;font-size:12px">Ordine ${n} · Questa è un'email automatica, non rispondere.</p></div>`,
  };
}

export async function notifyOrderEvent(req: Request, config: Config): Promise<Response> {
  const secret = env('ORDER_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) throw new HttpError(401, 'unauthorized');
  const payload = (await req.json()) as Payload;
  const event = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'order_events' || !event?.visible_to_customer) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }
  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!apiKey || !from) return new Response(JSON.stringify({ skipped: 'email_not_configured' }), { status: 200 });

  const [order] = await select<Order>(config, config.serviceRoleKey, 'orders', `select=*&id=eq.${event.order_id}`);
  if (!order?.customer_email) return new Response(JSON.stringify({ skipped: 'no_email' }), { status: 200 });
  const [store] = await select<{ name: string }>(config, config.serviceRoleKey, 'stores', `select=name&id=eq.${order.store_id}`);
  const email = buildEmail(event, order, store?.name ?? 'il negozio');
  if (!email) return new Response(JSON.stringify({ skipped: 'not_notifiable' }), { status: 200 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `order-event-${event.id}` },
    body: JSON.stringify({ from, to: [order.customer_email], subject: email.subject, html: email.body }),
  });
  if (!res.ok) throw new HttpError(502, 'email_failed', await res.text());
  return new Response(JSON.stringify({ sent: true }), { status: 200 });
}
