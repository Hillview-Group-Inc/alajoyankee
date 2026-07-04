/* ============================================
   server/routes/reminders.js
   External trigger for the daily contribution-reminder job.

   POST /api/reminders/run — guarded by REMINDER_TRIGGER_SECRET (shared secret,
   not JWT) so a headless scheduler (GitHub Actions cron, Azure WebJob) can fire
   it. The job is idempotent, so this is safe to call alongside the in-process
   scheduler.
   ============================================ */

'use strict';

const express = require('express');
const { requireReminderSecret, runReminders } = require('../controllers/reminderController');

const router = express.Router();

router.post('/run', requireReminderSecret, runReminders);

module.exports = router;
