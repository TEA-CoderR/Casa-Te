import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

async function main() {
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const db = await pool.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(742601)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  if (!(await db.query('SELECT version FROM schema_migrations WHERE version=1')).rowCount) {
    await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
    await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
  }
  await db.query('COMMIT');
  console.log('Database migrations applied');
} catch (failure) { await db.query('ROLLBACK'); throw failure; }
finally { db.release(); await pool.end(); }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
