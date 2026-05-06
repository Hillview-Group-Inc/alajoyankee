/* ============================================
   server/controllers/contactController.js
   Contact form submission & retrieval
   ============================================ */

'use strict';

const { validationResult } = require('express-validator');
const { sql, query }       = require('../config/db');

/* ══════════════════════════════════════════
   POST /api/contact
   Public endpoint — stores contact message
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

    const result = await query(
      `INSERT INTO ContactMessages (Name, Email, Phone, Message)
       OUTPUT INSERTED.MessageID, INSERTED.SubmittedAt
       VALUES (@name, @email, @phone, @message)`,
      {
        name:    { type: sql.NVarChar(200), value: name.trim()              },
        email:   { type: sql.NVarChar(255), value: email.trim().toLowerCase()},
        phone:   { type: sql.NVarChar(50),  value: (phone || '').trim()     },
        message: { type: sql.NVarChar(sql.MAX), value: message.trim()       },
      }
    );

    const row = result.recordset[0];
    res.status(201).json({
      message:   'Your message has been received. We\'ll be in touch shortly.',
      messageID: row.MessageID,
      submitted: row.SubmittedAt,
    });

  } catch (err) {
    next(err);
  }
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
