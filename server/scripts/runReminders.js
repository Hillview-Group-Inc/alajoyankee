/* ============================================
   server/scripts/runReminders.js
   One-shot runner for contribution due-date reminders.

   Runs the same job as the in-process scheduler, then exits. Use this to
   drive reminders from OS cron / Windows Task Scheduler, or to test manually:

     npm run reminders:run
   ============================================ */

'use strict';

require('dotenv').config();

const { sendDueReminders } = require('../services/reminderService');

(async () => {
  try {
    await sendDueReminders();
    console.log('✅ Reminder run complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Reminder run failed:', err);
    process.exit(1);
  }
})();
