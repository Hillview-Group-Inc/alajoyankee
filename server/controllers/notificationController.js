/* ============================================
   server/controllers/notificationController.js
   GET /api/notifications/mine — list a user's notifications
   ============================================ */

'use strict';

const { sql, query } = require('../config/db');

async function listMine(req, res, next) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const result = await query(
      `SELECT TOP (@lim)
         NotificationID, Type, Title, Message, IsSent, SentAt, CreatedAt
       FROM Notifications
       WHERE UserID = @uID
       ORDER BY CreatedAt DESC`,
      {
        uID: { type: sql.Int, value: req.user.userID },
        lim: { type: sql.Int, value: limit },
      }
    );
    res.json({ notifications: result.recordset });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMine };
