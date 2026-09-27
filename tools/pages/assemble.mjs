// Assembles the GitHub Pages site: web shop at <base>/, admin console at <base>/admin/.
// 404.html is the shop's index.html (Expo Router renders deep links client-side) plus a tiny
// redirect for admin deep links, which the admin's index.html restores (?__p=...).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const base = (process.env.PAGES_BASE_PATH || '/').replace(/\/?$/, '/');
const out = 'pages-dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('apps/mobile/dist', out, { recursive: true });
cpSync('apps/admin/dist', `${out}/admin`, { recursive: true });

const redirect = `<script>(function(){var b=${JSON.stringify(base)}+'admin';var p=location.pathname;` +
  `if(p===b||p.indexOf(b+'/')===0){location.replace(b+'/?__p='+encodeURIComponent(p+location.search));}})();</script>`;
const shopIndex = readFileSync(`${out}/index.html`, 'utf8');
writeFileSync(`${out}/404.html`, shopIndex.replace('<head>', `<head>${redirect}`));
writeFileSync(`${out}/.nojekyll`, '');
console.log(`Pages site assembled in ${out}/ (base ${base})`);
