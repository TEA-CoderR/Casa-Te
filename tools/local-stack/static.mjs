// Serves a built single-page app with history fallback (like the production hosting must).
// Usage: node static.mjs <dist-dir> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir, port] = [path.resolve(process.argv[2]), Number(process.argv[3])];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json' };

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = path.join(dir, pathname);
  if (!file.startsWith(dir)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const html = path.join(dir, `${pathname.replace(/\/$/, '')}.html`);
    file = fs.existsSync(html) ? html : path.join(dir, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`serving ${dir} on :${port}`));
