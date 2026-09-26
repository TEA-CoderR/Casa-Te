import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { calculateShipping } from '../src/config/shipping';
import type { Quote, QuoteRequest } from '../src/commerce/types';

export class ProductError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export type OrderStatus = 'awaiting_payment' | 'paid' | 'preparing' | 'ready_for_pickup' | 'shipped' | 'completed' | 'cancelled';
export type Principal = { id: string; role: 'customer' | 'operator' | 'payment'; storeIds?: string[] };
export type ProductOrder = { id: string; customerId: string; quote: Quote; status: OrderStatus; version: number; createdAt: string };
const error = (code: string, status = 409): never => { throw new ProductError(code, status); };
function customer(actor: Principal) { if (actor.role !== 'customer' || !actor.id) error('FORBIDDEN', 403); }
function order(row: any): ProductOrder {
  return { id: row.id, customerId: row.customer_id, quote: row.snapshot, status: row.status, version: row.version, createdAt: new Date(row.created_at).toISOString() };
}

/** All stock, order, audit and integration-event changes share one database transaction. */
export function createProductCommerce(pool: Pool) {
  async function transaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await run(db); await db.query('COMMIT'); return result; }
    catch (failure) { await db.query('ROLLBACK'); throw failure; }
    finally { db.release(); }
  }
  async function event(db: PoolClient, id: string, actor: Principal, type: string, payload: object) {
    await db.query('INSERT INTO order_events(order_id,actor_id,event_type,payload) VALUES($1,$2,$3,$4)', [id, actor.id, type, payload]);
    await db.query('INSERT INTO outbox(aggregate_id,event_type,payload) VALUES($1,$2,$3)', [id, type, payload]);
  }
  async function quote(actor: Principal, input: QuoteRequest): Promise<Quote> {
    customer(actor);
    if (!input || typeof input.storeId !== 'string' || !['home','store'].includes(input.fulfilment) || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 50 ||
      (input.fulfilment === 'home' && !/^\d{5}$/.test(input.postalCode ?? ''))) error('INVALID_QUOTE', 400);
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (!line || typeof line.sku !== 'string' || seen.has(line.sku) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) error('INVALID_LINES', 400);
      seen.add(line.sku);
    }
    return transaction(async db => {
      const store = await db.query('SELECT id FROM stores WHERE id=$1 AND active', [input.storeId]);
      if (!store.rowCount) error('STORE_UNAVAILABLE');
      const rows = await db.query('SELECT p.*, i.on_hand-i.reserved AS available FROM products p JOIN inventory i USING(sku) WHERE i.store_id=$1 AND p.sku=ANY($2::text[]) AND p.active', [input.storeId, [...seen]]);
      const products = new Map(rows.rows.map(p => [p.sku, p]));
      const lines = input.lines.map(line => {
        const p = products.get(line.sku);
        if (!p || p.available < line.quantity) error('OUT_OF_STOCK');
        return { ...line, name: p.name as string, unitPriceCents: p.price_cents as number, unitWeightGrams: p.weight_grams as number };
      });
      const subtotalCents = lines.reduce((sum,l) => sum + l.quantity*l.unitPriceCents,0);
      const weightGrams = lines.reduce((sum,l) => sum + l.quantity*l.unitWeightGrams,0);
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 2_000_000_000 || weightGrams > 10000) error('UNSUPPORTED_CART');
      const shippingCents = Math.round(calculateShipping({subtotal:subtotalCents/100,weightKg:weightGrams/1000,method:input.fulfilment})*100);
      const q: Quote = { id: randomUUID(), storeId:input.storeId, fulfilment:input.fulfilment, postalCode:input.fulfilment==='home'?input.postalCode:undefined,
        lines,subtotalCents,weightGrams,shippingCents,totalCents:subtotalCents+shippingCents,expiresAt:new Date(Date.now()+300_000).toISOString() };
      await db.query('INSERT INTO quotes(id,customer_id,snapshot,expires_at) VALUES($1,$2,$3,$4)',[q.id,actor.id,q,q.expiresAt]);
      return q;
    });
  }
  async function placeOrder(actor: Principal, quoteId: string, key: string): Promise<ProductOrder> {
    customer(actor);
    if (!/^[0-9a-f-]{36}$/i.test(quoteId) || typeof key !== 'string' || key.length < 8 || key.length > 128) error('INVALID_ORDER',400);
    return transaction(async db => {
      // Serializes reuse of one key across independent server instances.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([actor.id,key])]);
      const previous = await db.query('SELECT * FROM orders WHERE customer_id=$1 AND idempotency_key=$2',[actor.id,key]);
      if (previous.rowCount) { if (previous.rows[0].quote_id !== quoteId) error('IDEMPOTENCY_CONFLICT'); return order(previous.rows[0]); }
      const qr = await db.query('SELECT *, expires_at > now() AS valid FROM quotes WHERE id=$1 AND customer_id=$2 FOR UPDATE',[quoteId,actor.id]);
      if (!qr.rowCount) error('QUOTE_NOT_FOUND',404);
      if ((await db.query('SELECT id FROM orders WHERE quote_id=$1',[quoteId])).rowCount) error('QUOTE_ALREADY_USED');
      if (!qr.rows[0].valid) error('QUOTE_EXPIRED');
      const q = qr.rows[0].snapshot as Quote;
      if (!(await db.query('SELECT id FROM stores WHERE id=$1 AND active FOR SHARE',[q.storeId])).rowCount) error('STORE_UNAVAILABLE');
      // Stable lock order prevents overlapping multi-line carts from deadlocking.
      for (const line of [...q.lines].sort((a,b)=>a.sku.localeCompare(b.sku))) {
        const p = await db.query('SELECT price_cents,weight_grams,active FROM products WHERE sku=$1 FOR SHARE',[line.sku]);
        if (!p.rowCount || !p.rows[0].active || p.rows[0].price_cents!==line.unitPriceCents || p.rows[0].weight_grams!==line.unitWeightGrams) error('REQUOTE_REQUIRED');
        const stock = await db.query('UPDATE inventory SET reserved=reserved+$3 WHERE store_id=$1 AND sku=$2 AND on_hand-reserved >= $3 RETURNING sku',[q.storeId,line.sku,line.quantity]);
        if (!stock.rowCount) error('OUT_OF_STOCK');
      }
      const id = randomUUID();
      const result = await db.query("INSERT INTO orders(id,customer_id,quote_id,idempotency_key,snapshot,status) VALUES($1,$2,$3,$4,$5,'awaiting_payment') RETURNING *",[id,actor.id,quoteId,key,q]);
      await event(db,id,actor,'order.created',{orderId:id});
      return order(result.rows[0]);
    });
  }
  async function getOrder(actor: Principal, id: string): Promise<ProductOrder> {
    const result = await pool.query('SELECT * FROM orders WHERE id=$1',[id]);
    if (!result.rowCount) error('ORDER_NOT_FOUND',404);
    const o = order(result.rows[0]);
    if (!((actor.role==='customer' && o.customerId===actor.id) || (actor.role==='operator' && actor.storeIds?.includes(o.quote.storeId)))) error('FORBIDDEN',403);
    return o;
  }
  async function transition(actor: Principal, id: string, expectedVersion: number, next: OrderStatus): Promise<ProductOrder> {
    return transaction(async db => {
      const result = await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id]);
      if (!result.rowCount) error('ORDER_NOT_FOUND',404);
      const o = order(result.rows[0]);
      const permitted = actor.role==='payment' ? next==='paid' : actor.role==='customer' ? o.customerId===actor.id && o.status==='awaiting_payment' && next==='cancelled' : actor.storeIds?.includes(o.quote.storeId) && next!=='paid';
      if (!permitted) error('FORBIDDEN',403);
      if (o.version!==expectedVersion) error('VERSION_CONFLICT');
      if(next==='paid' && new Date(result.rows[0].reservation_expires_at).getTime()<=Date.now()) error('RESERVATION_EXPIRED');
      const transitions: Record<OrderStatus, OrderStatus[]> = {awaiting_payment:['paid','cancelled'],paid:['preparing'],preparing:[o.quote.fulfilment==='store'?'ready_for_pickup':'shipped'],ready_for_pickup:['completed'],shipped:['completed'],completed:[],cancelled:[]};
      if (!transitions[o.status].includes(next)) error('INVALID_TRANSITION');
      if (next==='cancelled' || next==='shipped' || (next==='completed' && o.quote.fulfilment==='store')) {
        for (const line of [...o.quote.lines].sort((a,b)=>a.sku.localeCompare(b.sku))) {
          const changed = await db.query('UPDATE inventory SET reserved=reserved-$3,on_hand=on_hand-$4 WHERE store_id=$1 AND sku=$2 AND reserved >= $3 RETURNING sku',[o.quote.storeId,line.sku,line.quantity,next==='cancelled'?0:line.quantity]);
          if (!changed.rowCount) error('INVENTORY_INCONSISTENT');
        }
      }
      const updated = await db.query('UPDATE orders SET status=$2,version=version+1 WHERE id=$1 RETURNING *',[id,next]);
      await event(db,id,actor,'order.'+next,{orderId:id,previousStatus:o.status,version:o.version+1});
      return order(updated.rows[0]);
    });
  }
  async function expireReservations():Promise<number> {
    return transaction(async db=>{
      const pending=await db.query("SELECT * FROM orders WHERE status='awaiting_payment' AND reservation_expires_at<=now() ORDER BY reservation_expires_at LIMIT 100 FOR UPDATE SKIP LOCKED");
      for(const row of pending.rows){
        const o=order(row);
        for(const line of [...o.quote.lines].sort((a,b)=>a.sku.localeCompare(b.sku))){
          const changed=await db.query('UPDATE inventory SET reserved=reserved-$3 WHERE store_id=$1 AND sku=$2 AND reserved >= $3 RETURNING sku',[o.quote.storeId,line.sku,line.quantity]);
          if(!changed.rowCount)error('INVENTORY_INCONSISTENT');
        }
        await db.query("UPDATE orders SET status='cancelled',version=version+1 WHERE id=$1",[o.id]);
        await event(db,o.id,{id:'reservation-expiry-worker',role:'operator'},'order.cancelled',{orderId:o.id,reason:'payment_timeout',version:o.version+1});
      }
      return pending.rowCount??0;
    });
  }
  return { quote,placeOrder,getOrder,transition,expireReservations };
}
