import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { ProductError, type Principal } from './commerce';
const derive=promisify(scrypt);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function passwordHash(password:string):Promise<string> {
  if(typeof password!=='string' || password.length<12 || password.length>128) throw new ProductError('PASSWORD_LENGTH',400);
  const salt=randomBytes(16).toString('hex');
  const key=await derive(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verify(password:string,encoded:string) {
  const [,salt,key]=encoded.split(':');
  const actual=await derive(password,salt,64) as Buffer;
  const expected=Buffer.from(key,'hex');
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
export function createAuth(pool:Pool) {
  const dummy=passwordHash(randomBytes(32).toString('hex'));
  async function login(email:string,password:string,remoteAddress:string) {
    if(typeof email!=='string' || email.length>254 || typeof password!=='string' || password.length>128) throw new ProductError('INVALID_CREDENTIALS',401);
    const identity=hash(remoteAddress);
    const budget=await pool.query("INSERT INTO login_attempts VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(identity_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END, reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts",[identity]);
    if(budget.rows[0].attempts>20) throw new ProductError('RATE_LIMITED',429);
    const result=await pool.query('SELECT * FROM accounts WHERE email=$1 AND active',[email.trim().toLowerCase()]);
    const account=result.rows[0];
    const valid=await verify(password,account?.password_hash ?? await dummy);
    if(!account || !valid) throw new ProductError('INVALID_CREDENTIALS',401);
    const token=randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '8 hours')",[hash(token),account.id]);
    return {token,expiresIn:28800,account:{id:account.id,role:account.role}};
  }
  async function authenticate(token:string):Promise<Principal> {
    if(!token || token.length>128) throw new ProductError('UNAUTHENTICATED',401);
    const result=await pool.query('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active',[hash(token)]);
    if(!result.rowCount) throw new ProductError('UNAUTHENTICATED',401);
    const a=result.rows[0];return {id:a.id,role:a.role,storeIds:a.store_ids};
  }
  async function logout(token:string) { await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]); }
  return {login,authenticate,logout};
}
/** Account provisioning is a controlled operation; public registration awaits email verification. */
export async function provisionAccount(pool:Pool,email:string,password:string,role:'customer'|'operator',storeIds:string[]=[]) {
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) throw new ProductError('INVALID_EMAIL',400);
  const id=randomUUID();
  await pool.query('INSERT INTO accounts(id,email,password_hash,role,store_ids) VALUES($1,$2,$3,$4,$5)',[id,email.trim().toLowerCase(),await passwordHash(password),role,storeIds]);
  return id;
}
