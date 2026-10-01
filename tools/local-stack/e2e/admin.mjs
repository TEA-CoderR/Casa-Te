import fs from 'node:fs';
import { env, launch, mailTo, shot, sql, step, watch, STATE_FILE } from './lib.mjs';

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const [order1, order2] = state.orders;
const ADMIN = 'admin@casate.test', STAFF = 'magazzino.arezzo@casate.test';
const PW_ADMIN = 'Admin-Local-Pass-1', PW_STAFF = 'Staff-Local-Pass-1';
const linkIn = (mail) => mail.HTML.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
const browser = await launch();

async function setPasswordViaLink(page, link, pw) {
  await page.goto(link);
  await page.waitForURL(/\/reset-password/);
  await page.getByLabel('Nuova password').fill(pw);
  await page.getByLabel('Conferma password').fill(pw);
  await page.getByRole('button', { name: 'Salva password' }).click();
  await page.waitForURL((u) => !u.pathname.includes('reset-password'));
}

// ---------------------------------------------------------------------------------------------
step('First admin, DEPLOYMENT.md §1 step 1: dashboard-style invite (service role /invite, no redirect)');
let since = Date.now() - 1000;
let r = await fetch(`${env.API_URL}/auth/v1/invite`, { method: 'POST', body: JSON.stringify({ email: ADMIN }),
  headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' } });
console.log(`  invite → ${r.status}`);
const inviteLink = linkIn(await mailTo(ADMIN, since));
const probe = await fetch(inviteLink, { redirect: 'manual' });
console.log(`  invite link redirects to: ${probe.headers.get('location')?.split('#')[0]}`);

step('First admin: set password from the admin console ("Password dimenticata / primo accesso")');
const actx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'it-IT' });
const admin = await actx.newPage(); watch(admin, 'admin');
await admin.goto(env.ADMIN_URL, { waitUntil: 'networkidle' });
await admin.getByLabel('Email').fill(ADMIN);
since = Date.now() - 1000;
await admin.getByRole('button', { name: /Password dimenticata/ }).click();
await admin.getByText('riceverai un link').waitFor();
await setPasswordViaLink(admin, linkIn(await mailTo(ADMIN, since)), PW_ADMIN);
console.log('  password set; granting admin role via SQL (DEPLOYMENT.md step 3)');
await sql(`insert into public.staff_members (user_id, role, email, display_name)
  select id, 'admin', email, 'Amministratore' from auth.users where email = '${ADMIN}'`);
await admin.goto(env.ADMIN_URL, { waitUntil: 'networkidle' });
await admin.reload({ waitUntil: 'networkidle' });
await admin.getByText('Preparazione').first().waitFor();
await shot(admin, 'admin-dashboard');

// ---------------------------------------------------------------------------------------------
step('Admin invites a store employee (Personale → admin-staff Edge Function)');
await admin.goto(`${env.ADMIN_URL}/staff`, { waitUntil: 'networkidle' });
await admin.getByRole('button', { name: '+ Invita persona' }).click();
await admin.getByLabel('Email').fill(STAFF);
await admin.getByLabel('Nome visualizzato').fill('Magazzino Arezzo');
await admin.getByLabel('Ruolo').selectOption('store_staff');
const arezzo = await admin.locator('label.field').filter({ hasText: /^Negozio/ }).locator('select').locator('option', { hasText: 'Arezzo' }).first().getAttribute('value');
await admin.locator('label.field').filter({ hasText: /^Negozio/ }).locator('select').selectOption(arezzo);
since = Date.now() - 1000;
await admin.getByRole('button', { name: 'Invia invito' }).click();
await admin.getByText(STAFF).first().waitFor();
await shot(admin, 'admin-personale');

step('Store employee accepts invite → sets password → picking');
const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'it-IT' });
const staff = await sctx.newPage(); watch(staff, 'staff');
await setPasswordViaLink(staff, linkIn(await mailTo(STAFF, since)), PW_STAFF);
await staff.goto(`${env.ADMIN_URL}/picking`, { waitUntil: 'networkidle' });
await staff.getByText(order1).first().waitFor();
const staffSees = await sql(`select count(*) from orders where status='paid'`);
console.log(`  paid orders in DB: ${staffSees}; staff queue shows ${order1}: yes`);
await staff.getByRole('button', { name: new RegExp(order1) }).click();
await shot(staff, 'picking-da-preparare');
await staff.getByRole('button', { name: 'Inizia preparazione' }).click();
await staff.getByRole('button', { name: 'Tutto pronto' }).waitFor();
const boxes = staff.getByRole('checkbox', { name: /: preparato$/ });
for (let i = 0; i < await boxes.count(); i++) {
  const box = boxes.nth(i);
  await staff.waitForFunction((el) => !el.disabled, await box.elementHandle());
  await box.click();
  await staff.waitForFunction((el) => el.checked && !el.disabled, await box.elementHandle());
}
await shot(staff, 'picking-spuntato');
await staff.getByRole('button', { name: 'Tutto pronto' }).click();
await staff.getByRole('link', { name: 'Registra spedizione' }).waitFor();
await shot(staff, 'picking-pronto');
await staff.getByRole('link', { name: 'Registra spedizione' }).click();
await staff.waitForURL(/\/orders\//);
await staff.getByRole('button', { name: 'Segna come spedito' }).click();
await staff.getByLabel('Corriere').fill('BRT');
await staff.getByLabel('Codice di tracciamento').fill('TEST123456');
await staff.getByRole('button', { name: 'Conferma spedizione' }).click();
await staff.getByText('TEST123456').waitFor();
await shot(staff, 'ordine-spedito');
const staffRefundButtons = await staff.getByRole('button', { name: /Rimborso parziale|Annulla ordine/ }).count();
console.log(`  refund buttons visible to store staff: ${staffRefundButtons} (expected 0)`);
console.log(`  db: ${await sql(`select status, carrier, tracking_number from orders where order_number='${order1}'`)}`);

// ---------------------------------------------------------------------------------------------
step(`Admin: partial refund €4,99 on shipped order ${order1}`);
const id1 = await sql(`select id from orders where order_number='${order1}'`);
await admin.goto(`${env.ADMIN_URL}/orders/${id1}`, { waitUntil: 'networkidle' });
await admin.getByRole('button', { name: 'Rimborso parziale' }).click();
await admin.getByLabel(/Importo/).fill('4,99');
await admin.getByLabel(/Motivo/).fill('Carta cucina arrivata danneggiata');
await admin.getByRole('button', { name: /^Rimborsa €4,99/ }).click();
await admin.getByRole('status').filter({ hasText: /Rimborso di €4,99 emesso/ }).waitFor();
await admin.getByText('Rimborsato').first().waitFor();
await shot(admin, 'rimborso-parziale');
console.log(`  db: ${await sql(`select status, payment_status, total_cents, refunded_cents from orders where id='${id1}'`)}`);
console.log(`  refunds: ${await sql(`select amount_cents, stripe_refund_id, reason from refunds where order_id='${id1}'`)}`);

step(`Admin: cancel & full refund of paid order ${order2} (stock must return)`);
const id2 = await sql(`select id from orders where order_number='${order2}'`);
const stockSql = `select string_agg(p.sku||'='||i.quantity, ', ' order by p.sku) from inventory i join products p on p.id=i.product_id
  join stores s on s.id=i.store_id where s.id=(select store_id from orders where id='${id2}') and p.sku in ('padella-28','carta-cucina')`;
const before = await sql(stockSql);
await admin.goto(`${env.ADMIN_URL}/orders/${id2}`, { waitUntil: 'networkidle' });
await admin.getByRole('button', { name: 'Annulla ordine…' }).click();
await admin.getByLabel(/Motivo/).fill('Richiesta del cliente');
await admin.getByRole('button', { name: /^Annulla e rimborsa €/ }).click();
await admin.getByRole('status').filter({ hasText: /Ordine annullato/ }).waitFor();
await admin.getByText('Rimborsato').first().waitFor();
await admin.waitForLoadState('networkidle');
await shot(admin, 'annulla-rimborsa');
console.log(`  db: ${await sql(`select status, payment_status, total_cents, refunded_cents from orders where id='${id2}'`)}`);
console.log(`  stock before: ${before}\n  stock after:  ${await sql(stockSql)}`);

step('Stripe webhooks received');
await new Promise((ok) => setTimeout(ok, 1500));
console.log(await sql(`select type, count(*) from stripe_events group by type order by type`));
console.log(`  refund rows total: ${await sql('select count(*), sum(amount_cents) from refunds')}`);
await browser.close();
