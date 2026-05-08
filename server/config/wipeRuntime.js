/* ============================================
   server/config/wipeRuntime.js
   Run via: npm run db:wipe-runtime

   ⚠️  DESTRUCTIVE — deletes all rows from the pool/rotation/payment
   runtime tables. Leaves Users, lookup tables (PoolSize, Schedule,
   Amount), ContactMessages, Notifications, RefreshTokens, and
   PasswordResetTokens untouched.

   Used after schema changes that alter the meaning of existing
   rotation rows. Safe to run on a fresh DB (will no-op on missing
   tables).
   ============================================ */

'use strict';

require('dotenv').config();
const { getPool } = require('./db');

const STATEMENTS = [
  // Order matters — children before parents to satisfy FKs.
  "DELETE FROM Payments",
  "DELETE FROM RotationDetailContribution",
  "DELETE FROM RotationDetail",
  "DELETE FROM Rotation",
  "DELETE FROM ContributionPoolEnrollment",
  "DELETE FROM ContributionPool",
];

// Optional: reseed identity counters so new IDs start at 1 (dev convenience).
const RESEED = [
  "Payments",
  "RotationDetailContribution",
  "RotationDetail",
  "Rotation",
  "ContributionPoolEnrollment",
  "ContributionPool",
];

async function run() {
  console.log('🧹  Wiping runtime tables (pool / rotation / payment data)...');
  const pool = await getPool();

  for (const stmt of STATEMENTS) {
    try {
      const r = await pool.request().query(stmt);
      const rows = (r.rowsAffected && r.rowsAffected[0]) || 0;
      console.log(`  ✓ ${stmt.padEnd(48)} (${rows} row${rows === 1 ? '' : 's'})`);
    } catch (err) {
      // Missing table on a freshly-installed DB — fine.
      if (/Invalid object name|does not exist/i.test(err.message)) {
        console.log(`  ⤳ skipped (table missing): ${stmt}`);
      } else {
        throw err;
      }
    }
  }

  for (const table of RESEED) {
    try {
      await pool.request().query(`DBCC CHECKIDENT ('${table}', RESEED, 0) WITH NO_INFOMSGS`);
      console.log(`  ✓ identity reset: ${table}`);
    } catch (_) {
      // CHECKIDENT can fail if the table doesn't exist or is empty on some
      // SQL Server editions — not worth surfacing.
    }
  }

  console.log('✅  Done. Lookup tables and user accounts untouched.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌  Wipe failed:', err.message);
  process.exit(1);
});
