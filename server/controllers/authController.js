/* ============================================
   server/controllers/authController.js
   Register & Login logic
   ============================================ */

"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { validationResult } = require("express-validator");
const { sql, query } = require("../config/db");
const { notifyUser, sendEmail } = require("../services/notificationService");
const { renderEmail, renderText, esc } = require("../services/emailTemplates");

const RESET_TOKEN_TTL_MIN = 30; // PRD §3.2 — 15–30 mins

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

/* ── Helper: generate JWT ── */
function signToken(user) {
  return jwt.sign(
    {
      userID: user.UserID,
      email: user.Email,
      role: user.Role || "member",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

/* ── Helper: safe user object (no hash) ── */
function safeUser(row, extras = {}) {
  return {
    userID: row.UserID,
    firstName: row.FirstName,
    lastName: row.LastName,
    email: row.Email,
    phone: row.Phone || null,
    role: row.Role,
    createdAt: row.CreatedAt,
    isCoordinator: !!extras.isCoordinator,
  };
}

/* ── Helper: does this user coordinate at least one pool? ── */
async function isCoordinator(userID) {
  const r = await query(
    `SELECT TOP 1 1 AS Ok FROM CoordinatorAssignment WHERE UserID = @uid`,
    { uid: { type: sql.Int, value: userID } }
  );
  return r.recordset.length > 0;
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
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { firstName, lastName, email, phone, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = (phone || "").trim();

    // Check duplicate
    const existing = await query(
      "SELECT UserID FROM Users WHERE Email = @email",
      { email: { type: sql.NVarChar(255), value: normalizedEmail } },
    );
    if (existing.recordset.length > 0) {
      return res
        .status(409)
        .json({ message: "An account with this email already exists." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user
    const result = await query(
      `INSERT INTO Users (FirstName, LastName, Email, Phone, PasswordHash, Role)
       OUTPUT INSERTED.UserID, INSERTED.FirstName, INSERTED.LastName,
              INSERTED.Email, INSERTED.Phone, INSERTED.Role, INSERTED.CreatedAt
       VALUES (@firstName, @lastName, @email, @phone, @passwordHash, 'member')`,
      {
        firstName: { type: sql.NVarChar(100), value: firstName.trim() },
        lastName: { type: sql.NVarChar(100), value: lastName.trim() },
        email: { type: sql.NVarChar(255), value: normalizedEmail },
        phone: { type: sql.NVarChar(50), value: normalizedPhone || null },
        passwordHash: { type: sql.NVarChar(255), value: passwordHash },
      },
    );

    const newUser = result.recordset[0];
    const token = signToken(newUser);

    // PRD §6.1 — fire-and-forget welcome notification
    {
      const baseUrl = process.env.PUBLIC_URL || "http://localhost:3000";
      const tplData = {
        accent: "primary",
        heading: "Welcome to Alajo Yankee 🎉",
        preheader: "Your account is ready, let's build wealth together.",
        greeting: `Hi ${esc(newUser.FirstName)},`,
        intro: [
          `Your account is ready. <strong>Alajo Yankee</strong> is a community savings platform built on the West African Ajo/Susu tradition. Join a contribution pool, save together on a regular schedule, and take turns receiving the full pot.`,
        ],
        rows: [
          ["Account email", esc(newUser.Email)],
          [
            "Member since",
            new Date(newUser.CreatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          ],
          [
            "Account type",
            `<span style="color:#1a6b3c;font-weight:600;">Member</span>`,
          ],
        ],
        ctaLabel: "Open your dashboard",
        ctaUrl: `${baseUrl}/dashboard.html`,
        closing:
          "Questions? Reply to this email, our community team is here to help.",
      };
      notifyUser({
        user: {
          userID: newUser.UserID,
          email: newUser.Email,
          phone: newUser.Phone,
        },
        subject: "Welcome to Alajo Yankee 🎉",
        message: renderText(tplData),
        html: renderEmail(tplData),
      }).catch((err) =>
        console.warn("Welcome notification failed:", err.message),
      );
    }

    // New accounts can't have coordinator assignments yet — flag is always false.
    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: safeUser(newUser, { isCoordinator: false }),
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
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // Fetch user
    const result = await query(
      `SELECT UserID, FirstName, LastName, Email, Phone, PasswordHash, Role, IsActive, CreatedAt
       FROM Users WHERE Email = @email`,
      { email: { type: sql.NVarChar(255), value: normalizedEmail } },
    );

    if (!result.recordset.length) {
      // Generic message prevents email enumeration
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = result.recordset[0];

    if (!user.IsActive) {
      return res.status(403).json({
        message: "This account has been deactivated. Please contact support.",
      });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.PasswordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Stamp LastLoginAt — fire-and-forget so a slow update doesn't block sign-in
    query(
      `UPDATE Users SET LastLoginAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME() WHERE UserID = @userID`,
      { userID: { type: sql.Int, value: user.UserID } },
    ).catch((err) => console.warn("LastLoginAt update failed:", err.message));

    const token = signToken(user);
    const coordinator = await isCoordinator(user.UserID);

    res.json({
      message: "Signed in successfully.",
      token,
      user: safeUser(user, { isCoordinator: coordinator }),
    });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   POST /api/auth/forgot-password
   Body: { email }

   Always returns 200 to prevent email enumeration. If the email
   matches a real account, generates a reset token (random 32 bytes,
   stored hashed) and emails the reset link.
   ══════════════════════════════════════════ */
async function forgotPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ message: "Validation failed", errors: errors.array() });
    }

    const email = (req.body.email || "").trim().toLowerCase();

    const userRow = await query(
      `SELECT UserID, FirstName, Email FROM Users WHERE Email = @email AND IsActive = 1`,
      { email: { type: sql.NVarChar(255), value: email } },
    );

    // Always return the same message — even when no match — to avoid leaking which emails are registered.
    const genericResponse = {
      message: "If an account exists for that email, we've sent a reset link.",
    };

    if (!userRow.recordset.length) return res.json(genericResponse);

    const user = userRow.recordset[0];

    // Generate a token: keep the raw value for the email link, store its SHA-256 hash in the DB
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    // Best-effort: invalidate any prior unused tokens for this user
    await query(
      `UPDATE PasswordResetTokens SET Used = 1 WHERE UserID = @uID AND Used = 0`,
      { uID: { type: sql.Int, value: user.UserID } },
    );

    await query(
      `INSERT INTO PasswordResetTokens (UserID, Token, ExpiresAt)
       VALUES (@uID, @token, @exp)`,
      {
        uID: { type: sql.Int, value: user.UserID },
        token: { type: sql.NVarChar(255), value: tokenHash },
        exp: { type: sql.DateTime2, value: expiresAt },
      },
    );

    const baseUrl = process.env.PUBLIC_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password.html?token=${rawToken}`;

    {
      const tplData = {
        accent: "gold",
        heading: "Reset your password",
        preheader: `This link is valid for ${RESET_TOKEN_TTL_MIN} minutes.`,
        greeting: `Hi ${esc(user.FirstName)},`,
        intro: [
          `Someone requested a password reset for your account. If that was you, use the link below to choose a new password.`,
        ],
        rows: [
          ["Account", esc(user.Email)],
          [
            "Link expires in",
            `<strong>${RESET_TOKEN_TTL_MIN} minutes</strong>`,
          ],
          [
            "Single-use",
            `Yes — the link works once and is invalidated immediately after use.`,
          ],
        ],
        highlight: `<strong>Reset link:</strong><br/><a href="${esc(resetUrl)}" style="color:#1a6b3c;font-weight:600;">${esc(resetUrl)}</a>`,
        ctaLabel: "Reset password",
        ctaUrl: resetUrl,
        closing: `If you didn't request this, you can safely ignore this email — your current password still works.`,
      };
      sendEmail({
        userID: user.UserID,
        to: user.Email,
        subject: "Reset your Alajo Yankee password",
        text: renderText(tplData),
        html: renderEmail(tplData),
      }).catch((err) => console.warn("Reset email failed:", err.message));
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   POST /api/auth/reset-password
   Body: { token, password }
   ══════════════════════════════════════════ */
async function resetPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ message: "Validation failed", errors: errors.array() });
    }

    const { token, password } = req.body;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const found = await query(
      `SELECT prt.TokenID, prt.UserID, prt.ExpiresAt, prt.Used
       FROM PasswordResetTokens prt
       WHERE prt.Token = @hash`,
      { hash: { type: sql.NVarChar(255), value: tokenHash } },
    );

    if (!found.recordset.length) {
      return res.status(400).json({ message: "This reset link is invalid." });
    }
    const row = found.recordset[0];
    if (row.Used) {
      return res
        .status(400)
        .json({ message: "This reset link has already been used." });
    }
    if (new Date(row.ExpiresAt) < new Date()) {
      return res.status(400).json({
        message: "This reset link has expired. Please request a new one.",
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await query(
      `UPDATE Users SET PasswordHash = @hash, UpdatedAt = SYSUTCDATETIME() WHERE UserID = @uID`,
      {
        hash: { type: sql.NVarChar(255), value: passwordHash },
        uID: { type: sql.Int, value: row.UserID },
      },
    );

    await query(
      `UPDATE PasswordResetTokens SET Used = 1 WHERE TokenID = @tID`,
      { tID: { type: sql.Int, value: row.TokenID } },
    );

    res.json({
      message: "Password updated. You can now sign in with your new password.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, forgotPassword, resetPassword };
