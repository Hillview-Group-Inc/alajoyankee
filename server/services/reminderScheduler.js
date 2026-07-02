/* ============================================
   server/services/reminderScheduler.js
   In-process daily scheduler for contribution reminders.

   A self-arming setTimeout fires once per day at REMINDER_HOUR_UTC (default
   13:00 UTC ≈ 8am US Eastern) and runs reminderService.sendDueReminders().
   No external cron dependency. The same job can also be run on demand via
   `npm run reminders:run` (server/scripts/runReminders.js) if you'd rather
   drive it from OS cron / Windows Task Scheduler.

   Set REMINDERS_DISABLED=true to turn the in-process scheduler off (e.g. when
   an external scheduler owns it).
   ============================================ */

'use strict';

const { sendDueReminders } = require('./reminderService');

const HOUR_UTC = (() => {
  const h = parseInt(process.env.REMINDER_HOUR_UTC || '13', 10);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 13;
})();

let timer = null;

/** Milliseconds from `now` until the next HOUR_UTC:00:00. */
function msUntilNextRun(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + 86_400_000); // already passed today → tomorrow
  }
  return next.getTime() - now.getTime();
}

async function tick() {
  try {
    await sendDueReminders();
  } catch (err) {
    console.warn('🔔 Reminder job failed:', err.message);
  } finally {
    arm(); // re-schedule for the next day regardless of outcome
  }
}

function arm() {
  if (timer) clearTimeout(timer);
  const delay = msUntilNextRun();
  timer = setTimeout(tick, delay);
  if (timer.unref) timer.unref(); // don't keep the event loop alive on its own
  const hrs = Math.round((delay / 3_600_000) * 10) / 10;
  console.log(`🔔 Next contribution-reminder run in ~${hrs}h (daily at ${String(HOUR_UTC).padStart(2, '0')}:00 UTC).`);
}

function start() {
  if (process.env.REMINDERS_DISABLED === 'true') {
    console.log('🔔 Contribution reminders disabled (REMINDERS_DISABLED=true).');
    return;
  }
  arm();
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
}

module.exports = { start, stop, msUntilNextRun };
