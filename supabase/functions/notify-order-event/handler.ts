// POST /functions/v1/notify-order-event   (verify_jwt = false; called by a Supabase Database Webhook)
// Configure in Supabase: Database → Webhooks → on INSERT into public.order_events → this URL,
// with HTTP header `x-webhook-secret: <ORDER_WEBHOOK_SECRET>`.
// Sends transactional emails through Resend (RESEND_API_KEY, EMAIL_FROM, optional EMAIL_REPLY_TO). No-op if not configured.
import type { Config } from '../_shared/env.ts';
import { env } from '../_shared/env.ts';
import { HttpError } from '../_shared/http.ts';
import { remove, select } from '../_shared/supabase.ts';
import { sendPush, serviceAccount, type PushMessage } from '../_shared/fcm.ts';

type EventRecord = { id: number; order_id: string; status: string | null; kind: string; note: string | null; visible_to_customer: boolean; created_at?: string };
type Payload = { type: string; table: string; record: EventRecord };
type Order = {
  id: string; order_number: string; fulfilment: 'home' | 'pickup' | 'store'; customer_email: string | null;
  customer_name: string | null; total_cents: number; tracking_number: string | null; tracking_url: string | null;
  carrier: string | null; store_id: string; user_id?: string | null;
  subtotal_cents?: number; discount_cents?: number; shipping_cents?: number; coupon_code?: string | null;
  payment_method?: 'card' | 'store'; payment_status?: string; pickup_slot_start?: string | null; pickup_slot_end?: string | null;
  seller_snapshot?: { legal_name: string; vat_number: string; address?: string | null; postal_code?: string | null; city?: string | null; province?: string | null } | null;
};
export type EmailItem = { name: string; quantity: number; unit_price_cents: number; line_total_cents: number };
export type EmailStore = { name: string; address?: string | null; postal_code?: string | null; city?: string | null; phone?: string | null };
export type EmailHours = { weekday: number; opens: string; closes: string };
/** What the emails show besides the order: the store (with its opening hours), the lines, the shop's address. */
export type EmailContext = { store: EmailStore; hours?: EmailHours[]; items?: EmailItem[]; shopUrl?: string };

const ROME = 'Europe/Rome';
/** "sabato 15 novembre, 10:00–11:00" (Europe/Rome). */
export function slotLabel(start: string, end: string): string {
  const day = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ROME }).format(new Date(start));
  const hm = (d: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ROME }).format(new Date(d));
  return `${day}, ${hm(start)}–${hm(end)}`;
}
const dateLabel = (d: Date) => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ROME }).format(d);

const DAYS = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
/** Opening hours grouped: "Lun–Sab 08:30–20:00", "Dom chiuso". */
export function hoursLines(hours: EmailHours[]): string[] {
  if (!hours.length) return [];
  const byDay = (d: number) => hours.filter((h) => h.weekday === d).sort((a, b) => a.opens.localeCompare(b.opens))
    .map((h) => `${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}`).join(', ') || 'chiuso';
  const out: string[] = [];
  let from = 1;
  for (let d = 2; d <= 8; d++) {
    if (d === 8 || byDay(d) !== byDay(from)) {
      out.push(`${from === d - 1 ? DAYS[from] : `${DAYS[from]}–${DAYS[d - 1]}`} ${byDay(from)}`);
      from = d;
    }
  }
  return out;
}

const euro = (c: number) => `€${(c / 100).toFixed(2).replace('.', ',')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

// Brand colours (apps/mobile theme): deep green band, lime logo, ink text. Inline styles only: email clients.
const C = { band: '#1F4127', lime: '#CDE434', ink: '#18201A', muted: '#5F665C', line: '#E8E8E3', sale: '#C8231F' };
const P = `margin:0 0 14px;font-size:15px;line-height:22px;color:${C.ink}`;
const H = `margin:24px 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${C.muted};font-weight:700`;

function itemsTable(order: Order, items: EmailItem[]): string {
  if (!items.length) return '';
  const row = (l: string, r: string, style = '') => `<tr><td style="padding:6px 0;font-size:14px;color:${C.ink};${style}">${l}</td>` +
    `<td style="padding:6px 0;font-size:14px;color:${C.ink};text-align:right;white-space:nowrap;${style}">${r}</td></tr>`;
  const lines = items.map((i) => row(`${i.quantity} × ${esc(i.name)}<br><span style="color:${C.muted};font-size:12px">${euro(i.unit_price_cents)} cad.</span>`,
    euro(i.line_total_cents), `border-bottom:1px solid ${C.line}`)).join('');
  const store = order.payment_method === 'store';
  const totals = [
    order.subtotal_cents != null ? row('Prodotti', euro(order.subtotal_cents)) : '',
    order.discount_cents ? row(`Sconto${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}`, `<span style="color:${C.sale}">−${euro(order.discount_cents)}</span>`) : '',
    order.fulfilment === 'store' ? row('Ritiro in negozio', 'Gratis') : order.shipping_cents != null ? row('Spedizione', order.shipping_cents ? euro(order.shipping_cents) : 'Gratis') : '',
    row(store ? 'Da pagare al ritiro' : 'Totale pagato', euro(order.total_cents), 'font-weight:700;font-size:16px;padding-top:10px'),
  ].join('');
  return `<p style="${H}">Il tuo ordine</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lines}${totals}</table>`;
}

function storeBlock(ctx: EmailContext, withMap: boolean): string {
  const s = ctx.store;
  const place = [s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const hours = hoursLines(ctx.hours ?? []);
  const map = withMap && place ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${place}`)}" style="color:${C.band}">Mappa</a>` : '';
  return `<p style="${H}">Dove ritirare</p><p style="${P}"><strong>${esc(s.name)}</strong>` +
    (place ? `<br>${esc(place)}${map}` : '') + (s.phone ? `<br>Tel. ${esc(s.phone)}` : '') +
    (hours.length ? `<br><span style="color:${C.muted};font-size:13px">${hours.map(esc).join('<br>')}</span>` : '') + `</p>`;
}

function frame(order: Order, ctx: EmailContext, hello: string, content: string): string {
  const seller = order.seller_snapshot;
  const sellerLine = seller ? `${esc(seller.legal_name)}${seller.address ? `, ${esc(seller.address)}, ${esc([seller.postal_code, seller.city].filter(Boolean).join(' '))}${seller.province ? ` (${esc(seller.province)})` : ''}` : ''} · P.IVA ${esc(seller.vat_number)}` : '';
  const link = ctx.shopUrl ? `<p style="margin:24px 0 0"><a href="${esc(ctx.shopUrl)}/order/${esc(order.id)}" style="display:inline-block;background:${C.band};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:24px">Vedi l'ordine</a></p>` : '';
  const legal = ctx.shopUrl ? ` · <a href="${esc(ctx.shopUrl)}/legal/terms" style="color:${C.muted}">Condizioni di vendita e recesso</a>` : '';
  return `<div style="background:#F4F5F1;padding:24px 12px;font-family:Figtree,system-ui,-apple-system,'Segoe UI',Arial,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">` +
    `<tr><td style="background:${C.band};padding:22px 28px"><span style="color:${C.lime};font-size:22px;font-weight:800;letter-spacing:0.5px">CASA &amp; TE</span></td></tr>` +
    `<tr><td style="padding:28px">` +
    `<p style="${P}">${hello}</p>${content}${link}` +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px;border-top:1px solid ${C.line};font-size:12px;line-height:18px;color:${C.muted}">` +
    `Ordine ${esc(order.order_number)}${legal}<br>${sellerLine ? `${sellerLine}<br>` : ''}Email automatica. Per assistenza contatta il negozio o scrivici dall'app.` +
    `</td></tr></table></div>`;
}

export function buildEmail(event: EventRecord, order: Order, ctxOrStore: EmailContext | string): { subject: string; body: string } | null {
  const ctx: EmailContext = typeof ctxOrStore === 'string' ? { store: { name: ctxOrStore } } : ctxOrStore;
  const n = order.order_number;
  const hello = `Ciao${order.customer_name ? ` ${esc(order.customer_name.split(' ')[0])}` : ''},`;
  const pickup = order.fulfilment === 'store';
  let subject: string; let content: string;
  if (event.kind === 'return') {
    if (!event.note) return null;
    subject = `Il tuo reso per l'ordine ${n}`;
    content = `<p style="${P}">${esc(event.note)}</p>`;
  } else if (event.kind === 'refund') {
    subject = `Rimborso per l'ordine ${n}`;
    content = `<p style="${P}">${esc(event.note ?? 'Abbiamo emesso un rimborso.')} L'accredito può richiedere 5–10 giorni lavorativi.</p>`;
  } else if (event.kind === 'status') {
    switch (event.status) {
      case 'paid': {
        const slot = order.pickup_slot_start && order.pickup_slot_end ? slotLabel(order.pickup_slot_start, order.pickup_slot_end) : null;
        subject = `Ordine ${n} confermato`;
        // The amount is said once: in the totals when the lines are there, in this sentence otherwise.
        const amount = ctx.items?.length ? '' : ` di ${euro(order.total_cents)}`;
        const lead = order.payment_method === 'store'
          ? `grazie per il tuo ordine${amount}: lo paghi in negozio al ritiro, in contanti o con carta.`
          : `grazie per il tuo ordine${amount}: il pagamento è andato a buon fine.`;
        content = `<p style="${P}">${lead}</p>` +
          (slot ? `<p style="${P}"><strong>Ritiro: ${esc(slot)}</strong><br>Ti scriviamo quando è pronto.</p>`
            : `<p style="${P}">Ti scriviamo quando è pronto.</p>`) +
          itemsTable(order, ctx.items ?? []) +
          (pickup ? storeBlock(ctx, false) + `<p style="${P}">Al ritiro mostra il numero d'ordine <strong>${esc(n)}</strong> o il codice nell'app.</p>` : '');
        break;
      }
      case 'ready': {
        if (!pickup) return null;
        const until = new Date((event.created_at ? Date.parse(event.created_at) : Date.now()) + 14 * 86_400_000);
        subject = `Ordine ${n} pronto per il ritiro`;
        const due = order.payment_method === 'store' && order.payment_status === 'unpaid';
        content = `<p style="${P}">il tuo ordine è pronto e ti aspetta in negozio.</p>` +
          `<p style="${P}"><strong>Ritiralo entro ${esc(dateLabel(until))}</strong>` +
          (due ? `<br>Da pagare alla cassa: <strong>${euro(order.total_cents)}</strong>` : '') + `</p>` +
          storeBlock(ctx, true) +
          `<p style="${P}">Mostra il numero d'ordine <strong>${esc(n)}</strong> o il codice nell'app.</p>`;
        break;
      }
      case 'shipped':
        subject = `Ordine ${n} spedito`;
        content = `<p style="${P}">il tuo ordine è stato affidato al corriere${order.carrier ? ` ${esc(order.carrier)}` : ''}.` +
          (order.tracking_url ? ` <a href="${esc(order.tracking_url)}" style="color:${C.band}">Segui la spedizione</a>` : order.tracking_number ? ` Codice di tracciamento: ${esc(order.tracking_number)}.` : '') + `</p>`;
        break;
      case 'cancelled':
        if (event.note?.includes('scaduto') || event.note?.includes('prima del pagamento') || event.note?.includes('non avviato')) return null;
        subject = `Ordine ${n} annullato`;
        content = `<p style="${P}">il tuo ordine è stato annullato.${event.note ? ` Motivo: ${esc(event.note)}.` : ''}` +
          (order.payment_method === 'store' ? '' : ' Se avevi già pagato riceverai il rimborso.') + `</p>`;
        break;
      default:
        return null;
    }
  } else {
    return null;
  }
  return { subject, body: frame(order, ctx, hello, content) };
}

/**
 * The push for an order event (plan v3 L2): only what the customer needs to act on — ready for pickup,
 * shipped, cancelled, refunded, an answer about a return. No push for the confirmation (they are in the app)
 * and never marketing. Tapping it opens the order.
 */
export function pushMessage(event: EventRecord, order: Order): PushMessage | null {
  const n = order.order_number;
  const data = { url: `casate://order/${order.id}`, order_id: order.id };
  const tag = `order-${order.id}`;
  if (event.kind === 'return') return event.note ? { title: `Reso dell'ordine ${n}`, body: event.note.slice(0, 180), data, tag } : null;
  if (event.kind === 'refund') return { title: `Rimborso per l'ordine ${n}`, body: event.note?.slice(0, 180) || 'Abbiamo emesso un rimborso.', data, tag };
  if (event.kind !== 'status') return null;
  switch (event.status) {
    case 'ready':
      if (order.fulfilment !== 'store') return null;
      return { title: 'Il tuo ordine è pronto', body: order.payment_method === 'store' && order.payment_status === 'unpaid'
        ? `Ordine ${n}: ritiralo in negozio e paga alla cassa ${euro(order.total_cents)}.` : `Ordine ${n}: ti aspetta in negozio.`, data, tag };
    case 'shipped':
      return { title: 'Ordine spedito', body: `L'ordine ${n} è stato affidato al corriere.`, data, tag };
    case 'cancelled':
      if (event.note?.includes('scaduto') || event.note?.includes('prima del pagamento') || event.note?.includes('non avviato')) return null;
      return { title: 'Ordine annullato', body: `L'ordine ${n} è stato annullato.${event.note ? ` ${event.note.slice(0, 120)}` : ''}`, data, tag };
    default:
      return null;
  }
}

async function pushToCustomer(config: Config, event: EventRecord, order: Order): Promise<number> {
  const sa = serviceAccount();
  const msg = pushMessage(event, order);
  if (!sa || !msg || !order.user_id) return 0;
  const rows = await select<{ token: string }>(config, config.serviceRoleKey, 'push_tokens', `select=token&user_id=eq.${order.user_id}`);
  const results = await sendPush(sa, rows.map((r) => r.token), msg);
  const gone = results.filter((r) => r.gone).map((r) => r.token);
  if (gone.length) await remove(config, config.serviceRoleKey, 'push_tokens', `token=in.(${gone.map((t) => `"${t}"`).join(',')})`).catch(() => {});
  return results.filter((r) => r.ok).length;
}

export async function notifyOrderEvent(req: Request, config: Config): Promise<Response> {
  const secret = env('ORDER_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) throw new HttpError(401, 'unauthorized');
  const payload = (await req.json()) as Payload;
  const event = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'order_events' || !event?.visible_to_customer) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }
  const [order] = await select<Order>(config, config.serviceRoleKey, 'orders', `select=*&id=eq.${event.order_id}`);
  if (!order) return new Response(JSON.stringify({ skipped: 'no_order' }), { status: 200 });

  // Push first, on its own: a push failure never blocks the email, and the email does not need push.
  const pushed = await pushToCustomer(config, event, order).catch((e) => { console.error('push failed', e); return 0; });

  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!apiKey || !from) return new Response(JSON.stringify({ pushed, email: 'not_configured' }), { status: 200 });
  if (!order.customer_email) return new Response(JSON.stringify({ pushed, email: 'no_email' }), { status: 200 });
  const [store] = await select<EmailStore>(config, config.serviceRoleKey, 'stores', `select=name,address,postal_code,city,phone&id=eq.${order.store_id}`);
  const [hours, items] = await Promise.all([
    select<EmailHours>(config, config.serviceRoleKey, 'store_opening_hours', `select=weekday,opens,closes&store_id=eq.${order.store_id}&order=weekday,opens`).catch(() => []),
    select<EmailItem>(config, config.serviceRoleKey, 'order_items', `select=name,quantity,unit_price_cents,line_total_cents&order_id=eq.${order.id}&order=name`),
  ]);
  const email = buildEmail(event, order, { store: store ?? { name: 'il negozio' }, hours, items, shopUrl: config.webShopUrl || undefined });
  if (!email) return new Response(JSON.stringify({ pushed, email: 'not_notifiable' }), { status: 200 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `order-event-${event.id}` },
    body: JSON.stringify({
      from, to: [order.customer_email], subject: email.subject, html: email.body,
      ...(env('EMAIL_REPLY_TO') ? { reply_to: env('EMAIL_REPLY_TO') } : {}),
    }),
  });
  if (!res.ok) throw new HttpError(502, 'email_failed', await res.text());
  return new Response(JSON.stringify({ pushed, sent: true }), { status: 200 });
}
