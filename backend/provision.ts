import { Pool } from 'pg';
import { provisionAccount } from './auth';
async function main(){
if(!process.env.DATABASE_URL || !process.env.ACCOUNT_EMAIL || !process.env.ACCOUNT_PASSWORD) throw new Error('Set DATABASE_URL, ACCOUNT_EMAIL and ACCOUNT_PASSWORD in the environment');
const role=process.env.ACCOUNT_ROLE;
if(role!=='customer' && role!=='operator') throw new Error('ACCOUNT_ROLE must be customer or operator');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
  const stores=process.env.ACCOUNT_STORE_IDS?.split(',').map(s=>s.trim()).filter(Boolean)??[];
  if(role==='operator' && !stores.length) throw new Error('Operators require explicit ACCOUNT_STORE_IDS');
  console.log('Account created:',await provisionAccount(pool,process.env.ACCOUNT_EMAIL,process.env.ACCOUNT_PASSWORD,role,stores));
}finally{await pool.end();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Provisioning failed');process.exitCode=1;});
