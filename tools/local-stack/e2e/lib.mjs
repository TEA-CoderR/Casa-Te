import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const env = Object.fromEntries(fs.readFileSync(new URL('../../../.tools/local-stack/env', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
export const OUT = process.env.OUT ?? fileURLToPath(new URL('../../../.tools/e2e-shots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
export const STATE_FILE = fileURLToPath(new URL('../../../.tools/local-stack/e2e-state.json', import.meta.url));

let n = 0;
export async function shot(page, name) {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`  [shot] ${file}`);
}

export async function launch() {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  return browser;
}

export function watch(page, tag) {
  page.on('pageerror', (e) => console.log(`  [${tag} pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) console.log(`  [${tag} http ${r.status()}] ${r.request().method()} ${r.url().slice(0, 200)}`); });
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${tag} console] ${m.text().slice(0, 300)}`); });
}

/** Latest Mailpit message to `to`, polled. */
export async function mailTo(to, since = 0, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const list = await (await fetch(`${env.MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const hit = (list.messages ?? []).find((m) => new Date(m.Created).getTime() >= since);
    if (hit) return await (await fetch(`${env.MAIL_URL}/api/v1/message/${hit.ID}`)).json();
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email to ${to}`);
}

export async function sql(query) {
  const { execFileSync } = await import('node:child_process');
  return execFileSync('psql', [env.DB_URL, '-XAtq', '-F', '|', '-c', query], { encoding: 'utf8' }).trim();
}

export function step(title) { console.log(`\n== ${title}`); }
