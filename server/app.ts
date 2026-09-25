import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products';
import { stores } from '../src/config/stores';
import { getCartSnapshot } from '../src/domain/cart';
import { calculateShipping, type FulfilmentMethod } from '../src/config/shipping';
import type { Order, PaymentMethod } from '../src/types/order';
import { createMockCommerceAdapter } from '../src/data/mockCommerce';
import { createCommerceModule, CommerceError } from './commerce';
import type { QuoteRequest } from '../src/commerce/types';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), 'public');
const methods: FulfilmentMethod[] = ['home', 'pickup', 'store'];
const payments: PaymentMethod[] = ['card-demo', 'cash-demo'];
const maxBodyBytes = 64 * 1024;

function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(value));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        if (!tooLarge) { tooLarge = true; reject(new Error('Richiesta troppo grande.')); }
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON non valido.')); }
    });
    req.on('error', reject);
  });
}

function validOrder(input: unknown): Order {
  if (!input || typeof input !== 'object') throw new Error('Ordine non valido.');
  const order = input as Order;
  if (typeof order.id !== 'string' || !/^CT[A-Z0-9]{8,32}$/.test(order.id) ||
    typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt)) ||
    !methods.includes(order.fulfilment) || !payments.includes(order.payment as PaymentMethod) ||
    !stores.includes(order.store as typeof stores[number]) || order.status !== 'confirmed' ||
    !Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > products.length) {
    throw new Error('Ordine non valido.');
  }
  const cart: Record<string, number> = {};
  for (const line of order.lines) {
    const id = line?.product?.id;
    if (typeof id !== 'string' || !products.some((product) => product.id === id) ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || cart[id]) {
      throw new Error('Prodotti non validi.');
    }
    cart[id] = line.quantity;
  }
  const snapshot = getCartSnapshot(cart);
  if (snapshot.lines.length !== order.lines.length || snapshot.itemCount > 99) throw new Error('Prodotti non validi.');
  if (order.fulfilment === 'home') {
    const address = order.address;
    if (!address || ![address.name, address.address, address.city].every((part) =>
      typeof part === 'string' && part.trim().length > 0 && part.length <= 120) ||
      typeof address.cap !== 'string' || !/^\d{5}$/.test(address.cap)) {
      throw new Error('Indirizzo non valido.');
    }
  }
  const shipping = calculateShipping({ subtotal: snapshot.subtotal, weightKg: snapshot.totalWeightKg, method: order.fulfilment });
  const total = Math.round((snapshot.subtotal + shipping) * 100) / 100;
  if (order.subtotal !== snapshot.subtotal || order.totalWeightKg !== snapshot.totalWeightKg ||
    order.itemCount !== snapshot.itemCount || order.shipping !== shipping || order.total !== total) {
    throw new Error('Totale ordine non valido.');
  }
  return {
    id: order.id, createdAt: order.createdAt, status: 'confirmed', fulfilment: order.fulfilment,
    payment: order.payment, store: order.store,
    address: order.fulfilment === 'home' ? {
      name: order.address!.name.trim(), address: order.address!.address.trim(),
      city: order.address!.city.trim(), cap: order.address!.cap,
    } : undefined,
    lines: snapshot.lines.map(({ product, quantity }) => ({ product, quantity })),
    subtotal: snapshot.subtotal, totalWeightKg: snapshot.totalWeightKg,
    itemCount: snapshot.itemCount, shipping, total,
  };
}

export function createDemoServer(dataFile: string) {
  const commerce = createCommerceModule(createMockCommerceAdapter());
  function readOrders(): Order[] {
    if (!existsSync(dataFile)) return [];
    const parsed: unknown = JSON.parse(readFileSync(dataFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Archivio ordini non valido.');
    return parsed as Order[];
  }
  function saveOrders(orders: Order[]) {
    mkdirSync(dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(orders, null, 2), 'utf8');
    renameSync(temporary, dataFile);
  }
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') { send(res, 204, null); return; }
    try {
      if (req.method === 'GET' && path === '/api/health') { send(res, 200, { ok: true, demo: true }); return; }
      if (req.method === 'GET' && path === '/v1/products') { send(res, 200, { demo: true, products: await commerce.listProducts() }); return; }
      if (req.method === 'GET' && path === '/v1/availability') {
        send(res, 200, { demo: true, availability: await commerce.availability(url.searchParams.get('storeId') ?? '') }); return;
      }
      if (req.method === 'POST' && path === '/v1/quotes') {
        send(res, 201, { demo: true, quote: await commerce.quote(await readBody(req) as QuoteRequest) }); return;
      }
      if (req.method === 'POST' && path === '/v1/orders') {
        const body = await readBody(req) as { quoteId?: string; idempotencyKey?: string };
        send(res, 201, { demo: true, order: await commerce.placeOrder(body?.quoteId ?? '', body?.idempotencyKey ?? '') }); return;
      }
      if (req.method === 'GET' && path.startsWith('/v1/orders/')) {
        send(res, 200, { demo: true, order: commerce.getOrder(decodeURIComponent(path.slice('/v1/orders/'.length))) }); return;
      }
      if (req.method === 'GET' && path === '/api/orders') { send(res, 200, { orders: readOrders() }); return; }
      if (req.method === 'GET' && path === '/api/products') { send(res, 200, { products }); return; }
      if (req.method === 'GET' && path === '/api/stores') { send(res, 200, { stores }); return; }
      if (req.method === 'POST' && path === '/api/orders') {
        const candidate = validOrder(await readBody(req));
        const orders = readOrders();
        const existing = orders.find((order) => order.id === candidate.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(candidate)) { send(res, 409, { error: 'Numero ordine già utilizzato.' }); return; }
          send(res, 200, { order: existing }); return;
        }
        saveOrders([candidate, ...orders]);
        send(res, 201, { order: candidate });
        return;
      }
      if (req.method === 'GET' && (path === '/' || path === '/index.html' || path === '/app.css' || path === '/sim.css' || path === '/app.js')) {
        const name = path === '/' ? 'index.html' : path.slice(1);
        const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html';
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(readFileSync(join(publicDir, name)));
        return;
      }
      send(res, 404, { error: 'Non trovato.' });
    } catch (error) {
      if (error instanceof CommerceError) {
        send(res, error.status, { code: error.code, error: error.message, demo: true });
        return;
      }
      const message = error instanceof Error ? error.message : 'Errore del server.';
      const clientError = ['Ordine non valido.', 'Prodotti non validi.', 'Indirizzo non valido.', 'Totale ordine non valido.',
        'JSON non valido.', 'Richiesta troppo grande.'].includes(message);
      send(res, clientError ? 400 : 500, { error: clientError ? message : 'Errore del server.' });
      if (!clientError) console.error(error);
    }
  });
}
