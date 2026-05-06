/* ============================================
   server/controllers/authController.js
   Register & Login logic
   ============================================ */

'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { sql, query }       = require('../config/db');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = process.env.JWT_EXPIRES_IN || '7d';

/* ── Helper: generate JWT ── */
function signToken(user) {
  return jwt.sign(
    {
      userID: user.UserID,
      email:  user.Email,
      role:   user.Role || 'member',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/* ── Helper: safe user object (no hash) ── */
function safeUser(row) {
  return {
    userID:    row.UserID,
    firstName: row.FirstName,
    lastName:  row.LastName,
    email:     row.Email,
    role:      row.Role,
    createdAt: row.CreatedAt,
  };
}

/* ══════════════════════════════════════════
   POST /api/auth/register
   ══════════════════════════════════════════ */
async function register(req, res, next) {
  try {
    // Validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: 'Validation failed',
        errors:  errors.array(),
      });
    }

    const { firstName, lastName, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate
    const existing = await query(
      'SELECT UserID FROM Users WHERE Email = @email',
      { email: { type: sql.NVarChar(255), value: normalizedEmail } }
    );
    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user
    const result = await query(
      `INSERT INTO Users (FirstName, LastName, Email, PasswordHash, Role)
       OUTPUT INSERTED.UserID, INSERTED.FirstName, INSERTED.LastName,
              INSERTED.Email, INSERTED.Role, INSERTED.CreatedAt
       VALUES (@firstName, @lastName, @email, @passwordHash, 'member')`,
      {
        firstName:    { type: sql.NVarChar(100), value: firstName.trim() },
        lastName:     { type: sql.NVarChar(100), value: lastName.trim()  },
        email:        { type: sql.NVarChar(255), value: normalizedEmail   },
        passwordHash: { type: sql.NVarChar(255), value: passwordHash      },
      }
    );

    const newUser = result.recordset[0];
    const token   = signToken(newUser);

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: safeUser(newUser),
    });

  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   POST /api/auth/login
   ══════════════════════════════════════════ */
async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: 'Validation failed',
        errors:  errors.array(),
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // Fetch user
    const result = await query(
      `SELECT UserID, FirstName, LastName, Email, PasswordHash, Role, IsActive, CreatedAt
       FROM Users WHERE Email = @email`,
      { email: { type: sql.NVarChar(255), value: normalizedEmail } }
    );

    if (!result.recordset.length) {
      // Generic message prevents email enumeration
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.recordset[0];

    if (!user.IsActive) {
      return res.status(403).json({ message: 'This account has been deactivated. Please contact support.' });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.PasswordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.json({
      message: 'Signed in successfully.',
      token,
      user: safeUser(user),
    });

  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
