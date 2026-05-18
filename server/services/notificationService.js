/* ============================================
   server/services/notificationService.js
   PRD §6 — Email + SMS dispatch with DB persistence

   Real delivery uses `nodemailer` (email) and `twilio` (SMS).
   Both modules are loaded lazily — if either isn't installed
   or its env vars are missing, the service silently falls
   back to a console-log stub. The Notifications row is
   recorded either way, so retry/audit is always possible.
   ============================================ */

'use strict';

const { sql, query } = require('../config/db');

/* ── Lazy-loaded transport handles ────────────────────────────────── */

let mailer        = null;   // nodemailer transport
let mailerLoaded  = false;
let twilioClient  = null;
let twilioLoaded  = false;

function getMailer() {
  if (mailerLoaded) return mailer;
  mailerLoaded = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  try {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: parseInt(SMTP_PORT || '587', 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log('📧 Email transport ready:', SMTP_HOST);
    return mailer;
  } catch (err) {
    console.warn('📧 nodemailer not installed — email is in stub mode.');
    return null;
  }
}

function getTwilio() {
  if (twilioLoaded) return twilioClient;
  twilioLoaded = true;

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) return null;

  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('📱 SMS transport ready (Twilio).');
    return twilioClient;
  } catch (err) {
    console.warn('📱 twilio not installed — SMS is in stub mode.');
    return null;
  }
}

/* ── DB persistence ───────────────────────────────────────────────── */

async function recordNotification({ userID, type, title, message, isSent, sentAt }) {
  try {
    await query(
      `INSERT INTO Notifications (UserID, Type, Title, Message, IsSent, SentAt)
       VALUES (@userID, @type, @title, @message, @isSent, @sentAt)`,
      {
        userID:  { type: sql.Int,            value: userID },
        type:    { type: sql.NVarChar(20),   value: type },
        title:   { type: sql.NVarChar(200),  value: title },
        message: { type: sql.NVarChar(sql.MAX), value: message },
        isSent:  { type: sql.Bit,            value: isSent ? 1 : 0 },
        sentAt:  { type: sql.DateTime2,      value: isSent ? (sentAt || new Date()) : null },
      }
    );
  } catch (err) {
    console.warn('⚠️  Could not persist notification:', err.message);
  }
}

/* ── Public API ───────────────────────────────────────────────────── */

/**
 * Send an email. Persists a Notifications row regardless of delivery
 * outcome so the admin can audit/retry. Never throws — failures are logged.
 *
 * @param {object} args
 * @param {number} args.userID
 * @param {string} args.to      — recipient email
 * @param {string} args.subject
 * @param {string} args.text    — plain-text body
 * @param {string} [args.html]  — optional HTML body
 */
async function sendEmail({ userID, to, subject, text, html, replyTo }) {
  const transport = getMailer();
  let isSent = false;
  let sentAt = null;

  if (transport && to) {
    try {
      const from = process.env.SMTP_FROM || `Alajo Yankee <${process.env.SMTP_USER}>`;
      const mail = { from, to, subject, text, html: html || text };
      if (replyTo) mail.replyTo = replyTo;
      await transport.sendMail(mail);
      isSent = true;
      sentAt = new Date();
    } catch (err) {
      console.warn(`📧 Email send failed (${to}):`, err.message);
    }
  } else {
    // Stub mode — make it obvious in the logs
    console.log(`\n[NOTIFICATIONS · EMAIL · STUB]\n  to:      ${to}\n  subject: ${subject}\n  body:    ${text}\n`);
  }

  // Skip DB persist for admin-bound emails that have no associated user account
  // (e.g. contact-form notifications to the support inbox).
  if (userID) {
    await recordNotification({ userID, type: 'Email', title: subject, message: text, isSent, sentAt });
  }
}

/**
 * Send an SMS via Twilio. Same persistence + stub semantics as sendEmail.
 *
 * @param {object} args
 * @param {number} args.userID
 * @param {string} args.to       — recipient phone (E.164 ideally)
 * @param {string} args.title    — short label stored alongside body
 * @param {string} args.message
 */
async function sendSMS({ userID, to, title, message }) {
  const client = getTwilio();
  let isSent = false;
  let sentAt = null;

  if (client && to) {
    try {
      await client.messages.create({
        from: process.env.TWILIO_FROM,
        to,
        body: message,
      });
      isSent = true;
      sentAt = new Date();
    } catch (err) {
      console.warn(`📱 SMS send failed (${to}):`, err.message);
    }
  } else {
    console.log(`\n[NOTIFICATIONS · SMS · STUB]\n  to:    ${to}\n  title: ${title}\n  body:  ${message}\n`);
  }

  await recordNotification({ userID, type: 'SMS', title, message, isSent, sentAt });
}

/**
 * Convenience: dispatch the same message to email AND sms in parallel,
 * each one persisted as its own Notifications row.
 */
async function notifyUser({ user, subject, message, html }) {
  const tasks = [];
  if (user.email)         tasks.push(sendEmail({ userID: user.userID || user.UserID, to: user.email, subject, text: message, html }));
  if (user.phone)         tasks.push(sendSMS({   userID: user.userID || user.UserID, to: user.phone, title: subject, message }));
  await Promise.allSettled(tasks);
}

module.exports = { sendEmail, sendSMS, notifyUser };
