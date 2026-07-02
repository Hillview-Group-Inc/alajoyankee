/* ============================================
   server/services/reminderService.js
   Contribution due-date reminders (email + SMS)

   Two time-triggered reminders per contribution, for OPEN rotations only
   (Status IN 'started','in-progress'):

     1. '3day'   — 3 days before the ContributionDueDate
     2. 'dueday' — on the ContributionDueDate itself

   Each reminder tells the member the Contribution Due (amount + date) and
   the Member to be paid (the recipient collecting on that date), and nudges
   them to log their payment in the app for admin verification. On a member's
   OWN collection date they instead get a "you collect the pot" note.

   Members who have already logged a payment (Pending/Verified) for a given
   date are skipped — the point of the reminder is to get them to pay.

   Idempotency: every reminder is "claimed" via an INSERT into
   ContributionReminder before it is sent. A duplicate-key means the reminder
   already went out (restart / repeated run), so it is skipped. This gives
   at-most-once delivery — a Notifications row (IsSent audit flag) is still
   written by notifyUser for every attempt, matching the rest of the app.
   ============================================ */

'use strict';

const { sql, query } = require('../config/db');
const { notifyUser } = require('./notificationService');
const { renderEmail, renderText, esc } = require('./emailTemplates');

const MS_PER_DAY = 86_400_000;

/* ── UTC date helpers (mirrors rotationEngine's UTC-midnight convention) ── */

function atUtcMidnight(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  return new Date(atUtcMidnight(date).getTime() + n * MS_PER_DAY);
}

// Format a DATE-only value. Anchored to UTC so a UTC-midnight value never
// slips to the previous calendar day when the server runs in a west-of-UTC zone.
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/* ── Per-type presentation (reuses existing named accents/colors) ── */

const REMINDERS = {
  '3day':   { accent: 'warning', when: 'in 3 days' },
  'dueday': { accent: 'gold',    when: 'today' },
};

/* ── Find contributions whose reminder is due but not yet sent ── */

async function fetchDueReminders(reminderType, targetDate) {
  const result = await query(
    `SELECT
       rdc.RotationDetailContributionID,
       rdc.RotationID,
       rdc.ContributionDue,
       rdc.ContributionDueDate,
       u.UserID    AS ContributorUserID,
       u.FirstName AS ContributorFirstName,
       u.Email     AS ContributorEmail,
       u.Phone     AS ContributorPhone,
       rd.UserID   AS RecipientUserID,
       rd.Rank     AS RecipientRank,
       recipient.FirstName + ' ' + recipient.LastName AS RecipientName,
       r.RotationName
     FROM RotationDetailContribution rdc
     JOIN Rotation       r         ON r.RotationID = rdc.RotationID
     JOIN RotationDetail rd        ON rd.RotationDetailID = rdc.RotationDetailID
     JOIN Users          u         ON u.UserID = rdc.UserID
     JOIN Users          recipient ON recipient.UserID = rd.UserID
     LEFT JOIN ContributionReminder cr
       ON cr.RotationDetailContributionID = rdc.RotationDetailContributionID
      AND cr.ReminderType = @type
     LEFT JOIN Payments p
       ON p.RotationID     = rdc.RotationID
      AND p.UserID         = rdc.UserID
      AND p.MemberToBePaid = rd.UserID
      AND p.Status IN ('Pending','Verified')
     WHERE r.Status IN ('started','in-progress')
       AND rdc.ContributionDueDate = @target
       AND cr.ContributionReminderID IS NULL
       -- Skip members who already logged a payment for this date, but always
       -- keep a member's own collection date (they don't pay themselves).
       AND (rdc.UserID = rd.UserID OR p.PaymentID IS NULL)`,
    {
      type:   { type: sql.NVarChar(10), value: reminderType },
      target: { type: sql.Date,         value: targetDate },
    }
  );
  return result.recordset;
}

/**
 * Reserve a reminder before sending it. Returns true if this call won the
 * INSERT (caller should send), false if it was already claimed / errored.
 */
async function claimReminder(rdcID, reminderType) {
  try {
    await query(
      `INSERT INTO ContributionReminder (RotationDetailContributionID, ReminderType)
       VALUES (@rdcID, @type)`,
      {
        rdcID: { type: sql.Int,         value: rdcID },
        type:  { type: sql.NVarChar(10), value: reminderType },
      }
    );
    return true;
  } catch (err) {
    // 2627/2601 = duplicate key → already claimed. Anything else: log + skip.
    if (err.number === 2627 || err.number === 2601) return false;
    console.warn('⚠️  Could not claim reminder:', err.message);
    return false;
  }
}

/* ── Build the email/SMS payload for one reminder ── */

function buildTemplate(row, reminderType) {
  const cfg        = REMINDERS[reminderType];
  const baseUrl    = process.env.PUBLIC_URL || 'http://localhost:3000';
  const amount     = Number(row.ContributionDue);
  const dueDateStr = fmtDate(row.ContributionDueDate);
  const isDueDay   = reminderType === 'dueday';
  const isOwnTurn  = row.ContributorUserID === row.RecipientUserID;

  // A member's own collection date — they receive, they don't pay.
  if (isOwnTurn) {
    const heading = isDueDay
      ? 'You collect the pot today 🎉'
      : 'You collect the pot in 3 days 🎉';
    const tplData = {
      accent:    cfg.accent,
      heading,
      preheader: `${row.RotationName} · it's your turn to receive the pot ${cfg.when}.`,
      greeting:  `Hi ${esc(row.ContributorFirstName)},`,
      intro: [
        isDueDay
          ? `Today is your collection date. You're the <strong>Member to be paid</strong> this cycle, so you receive the full pot from your pool.`
          : `In 3 days (${dueDateStr}) is your collection date. You're the <strong>Member to be paid</strong> this cycle, so you'll receive the full pot from your pool.`,
      ],
      rows: [
        ['Rotation',        `<strong>${esc(row.RotationName)}</strong>`],
        ['Collection date', `<span style="color:#d4a017;font-weight:700;">${dueDateStr}</span>`],
        ['You collect',     `<span style="color:#16a34a;font-weight:700;">the pot (rank #${row.RecipientRank})</span>`],
      ],
      ctaLabel: 'View dashboard',
      ctaUrl:   `${baseUrl}/dashboard.html`,
      closing:  `Once every member logs their payment and an admin verifies them, your payout completes. Sit tight!`,
    };
    return { subject: heading, tplData };
  }

  // Standard pay-and-log reminder.
  const heading = isDueDay ? 'Contribution due today' : 'Contribution due in 3 days';
  const tplData = {
    accent:    cfg.accent,
    heading,
    preheader: `${row.RotationName} · $${amount.toLocaleString()} due ${cfg.when} to ${row.RecipientName}.`,
    greeting:  `Hi ${esc(row.ContributorFirstName)},`,
    intro: [
      isDueDay
        ? `This is a reminder that your contribution is <strong>due today</strong>. Please make your payment and <strong>log it in the app</strong> so an admin can verify it.`
        : `This is a friendly reminder that your contribution is <strong>due in 3 days</strong> (${dueDateStr}). Please plan to make your payment and <strong>log it in the app</strong> for admin verification.`,
    ],
    rows: [
      ['Rotation',          `<strong>${esc(row.RotationName)}</strong>`],
      ['Contribution due',  `<strong>$${amount.toLocaleString()}</strong>`],
      ['Due date',          `<span style="color:#d97706;font-weight:700;">${dueDateStr}</span>`],
      ['Member to be paid', `${esc(row.RecipientName)} <span style="color:#6b7280;">(rank #${row.RecipientRank})</span>`],
    ],
    ctaLabel: 'Log your payment',
    ctaUrl:   `${baseUrl}/payments.html`,
    closing:  `Don't forget to log your payment in the app so an admin can verify it and keep the rotation moving.`,
  };
  return { subject: heading, tplData };
}

/* ── Process one reminder type for one target date ── */

async function runReminderType(reminderType, targetDate) {
  const rows = await fetchDueReminders(reminderType, targetDate);
  let sent = 0;

  for (const row of rows) {
    // Claim first (at-most-once), then dispatch.
    const claimed = await claimReminder(row.RotationDetailContributionID, reminderType);
    if (!claimed) continue;

    const { subject, tplData } = buildTemplate(row, reminderType);
    await notifyUser({
      user:    { userID: row.ContributorUserID, email: row.ContributorEmail, phone: row.ContributorPhone },
      subject,
      message: renderText(tplData),
      html:    renderEmail(tplData),
    }).catch(err => console.warn('🔔 Reminder notification failed:', err.message));
    sent++;
  }

  return { type: reminderType, candidates: rows.length, sent };
}

/**
 * Send all due reminders for the given moment (defaults to now):
 *   • '3day'   for contributions due in exactly 3 days
 *   • 'dueday' for contributions due today
 * Safe to call repeatedly — claimed reminders are never re-sent.
 */
async function sendDueReminders(now = new Date()) {
  const today        = atUtcMidnight(now);
  const threeDaysOut = addDays(today, 3);

  const results = [];
  results.push(await runReminderType('3day', threeDaysOut));
  results.push(await runReminderType('dueday', today));

  const summary = results.map(r => `${r.type} ${r.sent}/${r.candidates}`).join(', ');
  console.log(`🔔 Contribution reminders processed — ${summary}`);
  return results;
}

module.exports = { sendDueReminders, atUtcMidnight, addDays };
