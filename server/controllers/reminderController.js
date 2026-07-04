/* ============================================
   server/controllers/reminderController.js
   HTTP trigger for the contribution due-date reminder job.

   Lets an external scheduler (GitHub Actions cron, Azure WebJob, etc.) drive
   sendDueReminders() over HTTP instead of relying on the in-process timer.
   Guarded by a shared secret rather than JWT so a headless cron can call it
   without minting a user token. The job itself is idempotent (claims via the
   ContributionReminder ledger), so this endpoint is safe to call repeatedly
   and coexists with the in-process scheduler without double-sending.
   ============================================ */

'use strict';

const crypto = require('crypto');
const { sendDueReminders } = require('../services/reminderService');

/** Constant-time secret comparison that never leaks length. */
function secretsMatch(provided, configured) {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(configured)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Middleware: require a valid shared secret, supplied either as the
 * `x-reminder-secret` header or as `Authorization: Bearer <secret>`.
 * Returns 503 if the server has no secret configured (fail closed).
 */
function requireReminderSecret(req, res, next) {
  const configured = process.env.REMINDER_TRIGGER_SECRET;
  if (!configured) {
    return res.status(503).json({ message: 'Reminder trigger is not configured.' });
  }
  const bearer   = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = req.get('x-reminder-secret') || bearer;
  if (!provided || !secretsMatch(provided, configured)) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  return next();
}

/** Run the reminder job synchronously and return its per-type summary. */
async function runReminders(req, res, next) {
  try {
    const results = await sendDueReminders();
    res.json({ ok: true, results });
  } catch (err) {
    next(err);
  }
}

module.exports = { requireReminderSecret, runReminders };
