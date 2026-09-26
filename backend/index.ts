import { Pool } from 'pg';
import { createProductServer } from './api';
import { createProductCommerce } from './commerce';
async function main(){
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; no fixture fallback');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:20,connectionTimeoutMillis:5000});
if(!(await pool.query('SELECT version FROM schema_migrations WHERE version=1')).rowCount){await pool.end();throw new Error('Run db:migrate before starting the API');}
const server=createProductServer(pool);
const commerce=createProductCommerce(pool);
let expiring=false;
const expiry=setInterval(async()=>{if(expiring)return;expiring=true;try{await commerce.expireReservations();}catch{console.error('Reservation expiry failed');}finally{expiring=false;}},30000);
server.listen(Number(process.env.PORT??8887),process.env.HOST??'127.0.0.1',()=>console.log('Product API listening'));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{clearInterval(expiry);server.close(()=>void pool.end());});
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Startup failed');process.exitCode=1;});
