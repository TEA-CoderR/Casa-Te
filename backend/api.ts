import { createServer, type IncomingMessage } from 'node:http';
import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { createAuth } from './auth';
import { createProductCommerce, ProductError } from './commerce';

async function body(req:IncomingMessage) {
  if(!req.headers['content-type']?.startsWith('application/json')) throw new ProductError('JSON_REQUIRED',415);
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>32768) throw new ProductError('BODY_TOO_LARGE',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new ProductError('INVALID_JSON',400);}
}
export function createProductServer(pool:Pool) {
  const auth=createAuth(pool),commerce=createProductCommerce(pool);
  const server=createServer(async(req,res)=>{
    const requestId=crypto.randomUUID();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Request-ID',requestId);
    const send=(status:number,data:unknown)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    try {
      const path=new URL(req.url??'/', 'http://localhost').pathname;
      const assets:Record<string,[string,string]>={'/operations':['index.html','text/html; charset=utf-8'],'/operations/app.js':['app.js','text/javascript; charset=utf-8'],'/operations/app.css':['app.css','text/css; charset=utf-8']};
      if(req.method==='GET' && assets[path]) {
        const [file,type]=assets[path];
        res.setHeader('Content-Type',type);
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.writeHead(200);res.end(await readFile(new URL('./public/'+file,import.meta.url)));return;
      }
      if(path==='/health' && req.method==='GET'){await pool.query('SELECT 1');return send(200,{status:'ok'});}
      if(path==='/v2/auth/login' && req.method==='POST') {
        const b=await body(req);return send(200,await auth.login(b?.email,b?.password,req.socket.remoteAddress??'unknown'));
      }
      const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]??'';
      const actor=await auth.authenticate(token);
      if(path==='/v2/auth/logout' && req.method==='POST'){await auth.logout(token);return send(200,{ok:true});}
      if(path==='/v2/products' && req.method==='GET') {
        const rows=await pool.query('SELECT sku,name,price_cents AS "priceCents",weight_grams AS "weightGrams" FROM products WHERE active ORDER BY sku LIMIT 100');return send(200,{products:rows.rows});
      }
      if(path==='/v2/stores' && req.method==='GET'){return send(200,{stores:(await pool.query('SELECT id,name FROM stores WHERE active ORDER BY id')).rows});}
      if(path==='/v2/quotes' && req.method==='POST') return send(201,{quote:await commerce.quote(actor,await body(req))});
      if(path==='/v2/orders' && req.method==='POST') {const b=await body(req);return send(201,{order:await commerce.placeOrder(actor,b?.quoteId,req.headers['idempotency-key'] as string)});}
      if(path==='/v2/orders' && req.method==='GET') {
        const rows=actor.role==='customer' ? await pool.query('SELECT id FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor.id]) : await pool.query("SELECT id FROM orders WHERE snapshot->>'storeId'=ANY($1::text[]) ORDER BY created_at DESC LIMIT 100",[actor.storeIds??[]]);
        return send(200,{orders:await Promise.all(rows.rows.map(r=>commerce.getOrder(actor,r.id)))});
      }
      const match=path.match(/^\/v2\/orders\/([0-9a-f-]{36})(\/status)?$/i);
      if(match && !match[2] && req.method==='GET') return send(200,{order:await commerce.getOrder(actor,match[1])});
      if(match?.[2] && req.method==='PATCH') {const b=await body(req);return send(200,{order:await commerce.transition(actor,match[1],b?.version,b?.status)});}
      send(404,{error:'NOT_FOUND',requestId});
    } catch(failure) {
      if(failure instanceof ProductError) send(failure.status,{error:failure.code,requestId});
      else {console.error(JSON.stringify({requestId,error:failure instanceof Error?failure.name:'UnknownError'}));send(500,{error:'INTERNAL_ERROR',requestId});}
    }
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  return server;
}
