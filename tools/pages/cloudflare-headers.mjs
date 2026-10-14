// Writes Cloudflare Pages `_headers` files: basic hardening for the web shop, plus noindex and no framing for
// the admin console. Usage: node tools/pages/cloudflare-headers.mjs <shop dist> <admin dist>
import { writeFileSync } from 'node:fs';

const [shop, admin] = process.argv.slice(2);
if (!shop || !admin) throw new Error('usage: cloudflare-headers.mjs <shop dist> <admin dist>');

const common = [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
];
const file = (lines) => `/*\n${lines.map((l) => `  ${l}`).join('\n')}\n`;

writeFileSync(`${shop}/_headers`, file([...common, 'X-Frame-Options: SAMEORIGIN']));
writeFileSync(`${admin}/_headers`, file([...common, 'X-Frame-Options: DENY', 'X-Robots-Tag: noindex, nofollow']));
console.log(`_headers written to ${shop} and ${admin}`);
