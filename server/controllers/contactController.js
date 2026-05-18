/* ============================================
   server/controllers/contactController.js
   Contact form submission & retrieval
   ============================================ */

'use strict';

const { validationResult } = require('express-validator');
const { sql, query }       = require('../config/db');
const { sendEmail }        = require('../services/notificationService');
const { renderEmail, renderText, esc } = require('../services/emailTemplates');

const ADMIN_NOTIFY_EMAIL = process.env.CONTACT_NOTIFY_EMAIL || 'service@hillviewgroupinc.com';

/* ══════════════════════════════════════════
   POST /api/contact
   Public endpoint — stores contact message and notifies the admin inbox.
   ══════════════════════════════════════════ */
async function submitContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: 'Validation failed',
        errors:  errors.array(),
      });
    }

    const { name, email, phone, message } = req.body;
    const cleanName    = name.trim();
    const cleanEmail   = email.trim().toLowerCase();
    const cleanPhone   = (phone || '').trim();
    const cleanMessage = message.trim();

    const result = await query(
      `INSERT INTO ContactMessages (Name, Email, Phone, Message)
       OUTPUT INSERTED.MessageID, INSERTED.SubmittedAt
       VALUES (@name, @email, @phone, @message)`,
      {
        name:    { type: sql.NVarChar(200),     value: cleanName    },
        email:   { type: sql.NVarChar(255),     value: cleanEmail   },
        phone:   { type: sql.NVarChar(50),      value: cleanPhone   },
        message: { type: sql.NVarChar(sql.MAX), value: cleanMessage },
      }
    );

    const row = result.recordset[0];

    // Fire-and-forget admin notification — never block the response on email delivery.
    sendAdminContactEmail({
      name:        cleanName,
      email:       cleanEmail,
      phone:       cleanPhone,
      message:     cleanMessage,
      messageID:   row.MessageID,
      submittedAt: row.SubmittedAt,
    }).catch(err => console.warn('Contact-form admin email failed:', err.message));

    res.status(201).json({
      message:   'Your message has been received. We\'ll be in touch shortly.',
      messageID: row.MessageID,
      submitted: row.SubmittedAt,
    });

  } catch (err) {
    next(err);
  }
}

/* ── Helper: branded notification to the support inbox ── */
async function sendAdminContactEmail({ name, email, phone, message, messageID, submittedAt }) {
  const baseUrl  = process.env.PUBLIC_URL || 'http://localhost:3000';
  const fmtWhen  = new Date(submittedAt).toLocaleString('en-US', {
    year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short',
  });

  // Preserve line breaks in the message body for the HTML view.
  const messageHtml = esc(message).replace(/\r?\n/g, '<br/>');

  const tplData = {
    accent:    'primary',
    heading:   'New contact-form message',
    preheader: `${name} sent a message via the Alajo Yankee contact form.`,
    greeting:  `Hi team,`,
    intro: [
      `A new message just came in through the <strong>Contact</strong> page on alajoyankee.com.`,
    ],
    rows: [
      ['From',         `<strong>${esc(name)}</strong>`],
      ['Email',        `<a href="mailto:${esc(email)}" style="color:#1a6b3c;font-weight:600;text-decoration:none;">${esc(email)}</a>`],
      ['Phone',        phone ? esc(phone) : '<span style="color:#6b7280;">Not provided</span>'],
      ['Submitted',    esc(fmtWhen)],
      ['Message ID',   `#${messageID}`],
    ],
    highlight: `<strong style="display:block;margin-bottom:6px;color:#1a6b3c;">Message</strong>${messageHtml}`,
    ctaLabel:  'Open admin messages',
    ctaUrl:    `${baseUrl}/dashboard.html`,
    closing:   `Reply directly to this email to respond to ${esc(name)} — their address is set as the Reply-To.`,
  };

  await sendEmail({
    userID:  null, // admin-bound, no user account behind it
    to:      ADMIN_NOTIFY_EMAIL,
    subject: `New contact form submission · ${name}`,
    text:    renderText(tplData),
    html:    renderEmail(tplData),
    replyTo: email,
  });
}

/* ══════════════════════════════════════════
   GET /api/messages
   Requires: authenticateToken (+ admin for full list)
   ══════════════════════════════════════════ */
async function getMessages(req, res, next) {
  try {
    const page     = Math.max(1, parseInt(req.query.page  || '1',   10));
    const pageSize = Math.min(100, parseInt(req.query.size || '50',  10));
    const offset   = (page - 1) * pageSize;

    const result = await query(
      `SELECT MessageID, Name, Email, Phone, Message, IsRead, SubmittedAt
       FROM ContactMessages
       ORDER BY SubmittedAt DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
      {
        offset:   { type: sql.Int, value: offset   },
        pageSize: { type: sql.Int, value: pageSize  },
      }
    );

    const countResult = await query('SELECT COUNT(*) AS Total FROM ContactMessages', {});
    const total = countResult.recordset[0].Total;

    res.json({
      messages: result.recordset,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitContact, getMessages };
