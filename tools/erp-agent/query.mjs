#!/usr/bin/env node
// Read-only query helper: runs every *.sql file in the "query" folder against ysoft (MySQL) and writes
// <name>.csv next to it. Only SELECT / SHOW / DESCRIBE statements are allowed; anything else is refused.
// Password comes from the ERP_MYSQL_PASSWORD environment variable, never from a file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const dir = path.join(HERE, 'query');
fs.mkdirSync(dir, { recursive: true });
const only = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql') && (!only || f === only));
if (!files.length) { console.log('query 文件夹里没有 .sql 文件'); process.exit(0); }

const mysql = await import('mysql2/promise');
const db = await mysql.createConnection({
  host: config.mysql.host, port: config.mysql.port ?? 3306, user: config.mysql.user,
  password: process.env.ERP_MYSQL_PASSWORD ?? '', database: config.mysql.database ?? 'ysoft',
  dateStrings: true, charset: config.mysql.charset ?? 'utf8mb4',
});
const cell = (v) => { if (v === null || v === undefined) return ''; const s = Buffer.isBuffer(v) ? v.toString('utf8') : String(v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
try {
  await db.query('SET SESSION TRANSACTION READ ONLY');
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').trim().replace(/;\s*$/, '');
    const head = sql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/, '').trim().split(/\s+/)[0]?.toUpperCase();
    const out = path.join(dir, f.replace(/\.sql$/i, '.csv'));
    if (!['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH'].includes(head) || sql.includes(';')) {
      fs.writeFileSync(out, `ERRORE;solo una SELECT per file\r\n`); console.log(`${f}: 拒绝（只允许一条只读查询）`); continue;
    }
    try {
      const t0 = Date.now();
      const [rows, fields] = await db.query(sql);
      const cols = (fields ?? []).map((x) => x.name);
      const lines = [cols.join(';'), ...rows.map((r) => cols.map((c) => cell(r[c])).join(';'))];
      fs.writeFileSync(out, '﻿' + lines.join('\r\n'));
      console.log(`${f}: ${rows.length} 行 → ${path.basename(out)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) { fs.writeFileSync(out, `ERRORE;${cell(e.message)}\r\n`); console.log(`${f}: 出错 ${e.message}`); }
  }
} finally { await db.end(); }
