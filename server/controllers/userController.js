/* ============================================
   server/controllers/userController.js
   User profile & management
   ============================================ */

"use strict";

const { sql, query } = require("../config/db");

/* ══════════════════════════════════════════
   GET /api/users/profile
   Requires: authenticateToken
   ══════════════════════════════════════════ */
async function getProfile(req, res, next) {
  try {
    const result = await query(
      `SELECT UserID, FirstName, LastName, Email, Phone, Role, IsActive, LastLoginAt, CreatedAt, UpdatedAt
       FROM Users WHERE UserID = @userID AND IsActive = 1`,
      { userID: { type: sql.Int, value: req.user.userID } },
    );

    if (!result.recordset.length) {
      return res.status(404).json({ message: "User not found." });
    }

    const u = result.recordset[0];
    res.json({
      user: {
        userID: u.UserID,
        firstName: u.FirstName,
        lastName: u.LastName,
        email: u.Email,
        phone: u.Phone,
        role: u.Role,
        lastLoginAt: u.LastLoginAt,
        createdAt: u.CreatedAt,
        updatedAt: u.UpdatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile };
