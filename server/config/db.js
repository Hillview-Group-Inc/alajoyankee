/* ============================================
   server/config/db.js
   SQL Server connection pool (mssql)
   ============================================ */

'use strict';

const sql    = require('mssql');
require('dotenv').config();

const config = {
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_NAME     || 'AlajoYankeeDB',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:              process.env.DB_ENCRYPT    !== 'false',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:     true,
    connectTimeout:       30000,
    requestTimeout:       30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Singleton pool
let pool = null;

async function getPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(config);
    console.log('✅ SQL Server connected:', process.env.DB_SERVER);
    return pool;
  } catch (err) {
    console.error('❌ SQL Server connection error:', err.message);
    throw err;
  }
}

// Named-parameter query helper with automatic sanitization
async function query(sqlStr, params = {}) {
  const p = await getPool();
  const req = p.request();
  for (const [key, { type, value }] of Object.entries(params)) {
    req.input(key, type, value);
  }
  return req.query(sqlStr);
}

module.exports = { sql, getPool, query };
