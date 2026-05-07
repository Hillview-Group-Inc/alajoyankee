/* ============================================
   server/controllers/paymentController.js
   PRD §3.5 / §6.4 — payment submission, history, admin verify
   ============================================ */

'use strict';

const { validationResult } = require('express-validator');
const { sql, query, txQuery, withTransaction } = require('../config/db');
const { notifyUser } = require('../services/notificationService');
const { renderEmail, renderText, esc } = require('../services/emailTemplates');

/* ══════════════════════════════════════════
   POST /api/payments/submit
   Body: { rotationDetailID, amount }
   Member submits a payment against a contribution they owe.
   The detail must belong to the signed-in user.
   Status starts as 'Pending' awaiting admin verification.
   ══════════════════════════════════════════ */
async function submit(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  }

  const userID            = req.user.userID;
  const rotationDetailID  = parseInt(req.body.rotationDetailID, 10);
  const amount            = Number(req.body.amount);

  try {
    // Look up the detail and verify ownership + amount
    const detail = await query(
      `SELECT rd.RotationDetailID, rd.RotationID, rd.UserID, rd.ContributionDue,
              rd.ContributionDueDate, r.Status AS RotationStatus
       FROM RotationDetail rd
       JOIN Rotation r ON r.RotationID = rd.RotationID
       WHERE rd.RotationDetailID = @rdID`,
      { rdID: { type: sql.Int, value: rotationDetailID } }
    );
    if (!detail.recordset.length) {
      return res.status(404).json({ message: 'Contribution not found.' });
    }
    const d = detail.recordset[0];
    if (d.UserID !== userID) {
      return res.status(403).json({ message: 'You can only submit payments for your own contributions.' });
    }
    if (d.RotationStatus === 'completed') {
      return res.status(409).json({ message: 'This rotation is already completed.' });
    }

    // Reject duplicate pending/verified payment for the same detail
    const existing = await query(
      `SELECT PaymentID FROM Payments
       WHERE RotationID = @rotID AND UserID = @userID AND Status IN ('Pending','Verified')
         AND CAST(PaymentDate AS DATE) = CAST(@dueDate AS DATE)`,
      {
        rotID:   { type: sql.Int,      value: d.RotationID },
        userID:  { type: sql.Int,      value: userID },
        dueDate: { type: sql.Date,     value: d.ContributionDueDate },
      }
    );
    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'A payment for this contribution is already on file.' });
    }

    // Insert payment
    const result = await query(
      `INSERT INTO Payments (RotationID, UserID, Amount, Status)
       OUTPUT INSERTED.PaymentID, INSERTED.PaymentDate, INSERTED.Status
       VALUES (@rotID, @userID, @amount, 'Pending')`,
      {
        rotID:  { type: sql.Int,           value: d.RotationID },
        userID: { type: sql.Int,           value: userID },
        amount: { type: sql.Decimal(18,2), value: amount },
      }
    );
    const inserted = result.recordset[0];

    res.status(201).json({
      message: 'Payment submitted. An admin will verify it shortly.',
      payment: {
        paymentID:   inserted.PaymentID,
        paymentDate: inserted.PaymentDate,
        amount,
        status:      inserted.Status,
        rotationDetailID,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   GET /api/payments/mine
   Returns the signed-in user's payment history.
   ══════════════════════════════════════════ */
async function getMine(req, res, next) {
  try {
    const result = await query(
      `SELECT
         p.PaymentID, p.RotationID, p.Amount, p.PaymentDate, p.Status, p.VerifiedBy,
         r.RotationName, r.RotationStartDate, r.RotationEndDate,
         ps.PoolSizeName, ca.Amount AS ContributionAmount
       FROM Payments p
       JOIN Rotation r           ON r.RotationID = p.RotationID
       JOIN ContributionPool cp  ON cp.PoolID = r.PoolID
       JOIN PoolSize ps          ON ps.PoolSizeID = cp.PoolSizeID
       JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
       WHERE p.UserID = @userID
       ORDER BY p.PaymentDate DESC`,
      { userID: { type: sql.Int, value: req.user.userID } }
    );

    // Aggregate verified total — used by dashboard "Total Saved"
    const totals = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN Status = 'Verified' THEN Amount END), 0) AS TotalVerified,
         COALESCE(SUM(CASE WHEN Status = 'Pending'  THEN Amount END), 0) AS TotalPending
       FROM Payments WHERE UserID = @userID`,
      { userID: { type: sql.Int, value: req.user.userID } }
    );

    res.json({
      payments:      result.recordset,
      totalVerified: Number(totals.recordset[0].TotalVerified),
      totalPending:  Number(totals.recordset[0].TotalPending),
    });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   GET /api/payments/pending  (admin)
   ══════════════════════════════════════════ */
async function getPending(req, res, next) {
  try {
    const result = await query(
      `SELECT
         p.PaymentID, p.RotationID, p.UserID, p.Amount, p.PaymentDate, p.Status,
         u.FirstName, u.LastName, u.Email, u.Phone,
         r.RotationName, ps.PoolSizeName, ca.Amount AS ContributionAmount
       FROM Payments p
       JOIN Users u              ON u.UserID = p.UserID
       JOIN Rotation r           ON r.RotationID = p.RotationID
       JOIN ContributionPool cp  ON cp.PoolID = r.PoolID
       JOIN PoolSize ps          ON ps.PoolSizeID = cp.PoolSizeID
       JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
       WHERE p.Status = 'Pending'
       ORDER BY p.PaymentDate ASC`
    );
    res.json({ payments: result.recordset });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   POST /api/payments/verify  (admin)
   Body: { paymentID, status: 'Verified' | 'Failed' }
   ══════════════════════════════════════════ */
async function verify(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  }

  const adminID   = req.user.userID;
  const paymentID = parseInt(req.body.paymentID, 10);
  const status    = req.body.status; // 'Verified' or 'Failed'

  try {
    // Run the verify + post-checks in a transaction so that a Verified payment
    // can immediately mark a rotation as completed if it was the last one.
    const result = await withTransaction(async (tx) => {
      // 1. Update the payment
      const upd = await txQuery(
        tx,
        `UPDATE Payments
           SET Status = @status, VerifiedBy = @adminID
           OUTPUT INSERTED.PaymentID, INSERTED.RotationID, INSERTED.UserID,
                  INSERTED.Amount, INSERTED.Status, INSERTED.PaymentDate
         WHERE PaymentID = @pID AND Status = 'Pending'`,
        {
          status:  { type: sql.NVarChar(20), value: status },
          adminID: { type: sql.Int,          value: adminID },
          pID:     { type: sql.Int,          value: paymentID },
        }
      );
      if (!upd.recordset.length) {
        const e = new Error('Payment not found or no longer pending.');
        e.status = 404;
        throw e;
      }
      const payment = upd.recordset[0];

      // 2. Fetch user (needed for notification + recipient phone/email)
      const userRow = await txQuery(
        tx,
        `SELECT UserID, FirstName, Email, Phone FROM Users WHERE UserID = @uID`,
        { uID: { type: sql.Int, value: payment.UserID } }
      );
      const user = userRow.recordset[0];

      // 3. If verified, mark the rotation in-progress at minimum, and check
      //    whether every member has now paid → mark Rotation completed.
      let rotationCompleted = false;
      if (status === 'Verified') {
        await txQuery(
          tx,
          `UPDATE Rotation SET Status = 'in-progress', UpdatedAt = SYSUTCDATETIME()
           WHERE RotationID = @rID AND Status = 'started'`,
          { rID: { type: sql.Int, value: payment.RotationID } }
        );

        // Compare verified payments vs. expected detail count
        const counts = await txQuery(
          tx,
          `SELECT
             (SELECT COUNT(*) FROM RotationDetail WHERE RotationID = @rID)                          AS Expected,
             (SELECT COUNT(*) FROM Payments WHERE RotationID = @rID AND Status = 'Verified')        AS Verified`,
          { rID: { type: sql.Int, value: payment.RotationID } }
        );
        const { Expected, Verified } = counts.recordset[0];
        if (Expected > 0 && Verified >= Expected) {
          await txQuery(
            tx,
            `UPDATE Rotation SET Status = 'completed', UpdatedAt = SYSUTCDATETIME()
             WHERE RotationID = @rID`,
            { rID: { type: sql.Int, value: payment.RotationID } }
          );
          await txQuery(
            tx,
            `UPDATE ContributionPool
               SET Status = 'completed', UpdatedAt = SYSUTCDATETIME()
             WHERE PoolID = (SELECT PoolID FROM Rotation WHERE RotationID = @rID)`,
            { rID: { type: sql.Int, value: payment.RotationID } }
          );
          rotationCompleted = true;
        }
      }

      return { payment, user, rotationCompleted };
    });

    /* Outside the transaction: send notifications (PRD §6.4 / §6.5) */
    const { payment, user, rotationCompleted } = result;

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    if (status === 'Verified') {
      const tplData = {
        accent:    'success',
        heading:   'Payment verified ✓',
        preheader: `Your $${Number(payment.Amount).toLocaleString()} contribution is on the books.`,
        greeting:  `Hi ${esc(user.FirstName)},`,
        intro: [
          `Your contribution has been verified. Thank you for keeping the rotation moving.`,
        ],
        rows: [
          ['Amount',  `<strong>$${Number(payment.Amount).toLocaleString()}</strong>`],
          ['Date',    fmtDate(payment.PaymentDate)],
          ['Status',  `<span style="color:#16a34a;font-weight:700;">${esc(payment.Status)}</span>`],
        ],
        ctaLabel: 'View payment history',
        ctaUrl:   `${baseUrl}/payments.html`,
        closing:  rotationCompleted ? `Your rotation has now completed — see the summary email arriving separately.` : '',
      };
      notifyUser({
        user,
        subject: 'Payment verified ✓',
        message: renderText(tplData),
        html:    renderEmail(tplData),
      }).catch(err => console.warn('Verify notification failed:', err.message));
    } else if (status === 'Failed') {
      const tplData = {
        accent:    'error',
        heading:   'Payment verification failed',
        preheader: `Action needed: your $${Number(payment.Amount).toLocaleString()} contribution couldn't be verified.`,
        greeting:  `Hi ${esc(user.FirstName)},`,
        intro: [
          `We were unable to verify your most recent contribution. Please reach out to support so we can resolve this together.`,
        ],
        rows: [
          ['Amount',  `<strong>$${Number(payment.Amount).toLocaleString()}</strong>`],
          ['Date submitted', fmtDate(payment.PaymentDate)],
          ['Status',  `<span style="color:#dc2626;font-weight:700;">${esc(payment.Status)}</span>`],
        ],
        ctaLabel: 'Contact support',
        ctaUrl:   `${baseUrl}/contact.html`,
        closing:  `Common reasons: amount mismatch, missing reference, or transfer not yet received. Replies to this email reach our team.`,
      };
      notifyUser({
        user,
        subject: 'Payment verification failed',
        message: renderText(tplData),
        html:    renderEmail(tplData),
      }).catch(err => console.warn('Failed-payment notification failed:', err.message));
    }

    if (rotationCompleted) {
      // Notify every rotation member with their summary
      sendRotationCompletedNotifications(payment.RotationID)
        .catch(err => console.warn('Rotation-completed notifications failed:', err.message));
    }

    res.json({
      message: `Payment ${status.toLowerCase()}.`,
      paymentID: payment.PaymentID,
      status:    payment.Status,
      rotationCompleted,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/* ── Helper: send rotation-completed summary to every member ── */
async function sendRotationCompletedNotifications(rotationID) {
  const rows = await query(
    `SELECT
       u.UserID, u.FirstName, u.Email, u.Phone,
       r.RotationName, r.RotationStartDate, r.RotationEndDate,
       ca.Amount AS ContributionAmount,
       (SELECT COUNT(*) FROM RotationDetail WHERE RotationID = r.RotationID) AS PoolSize
     FROM RotationDetail rd
     JOIN Users u             ON u.UserID = rd.UserID
     JOIN Rotation r          ON r.RotationID = rd.RotationID
     JOIN ContributionPool cp ON cp.PoolID = r.PoolID
     JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
     WHERE rd.RotationID = @rID`,
    { rID: { type: sql.Int, value: rotationID } }
  );

  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  await Promise.allSettled(rows.recordset.map(r => {
    const totalContributed = Number(r.ContributionAmount); // each member contributes once per rotation
    const totalReceived    = Number(r.ContributionAmount) * r.PoolSize;
    const tplData = {
      accent:    'gold',
      heading:   'Rotation completed 🎉',
      preheader: `${esc(r.RotationName)} · congratulations on completing the cycle.`,
      greeting:  `Hi ${esc(r.FirstName)},`,
      intro: [
        `Your rotation has just completed. Here's the summary.`,
      ],
      rows: [
        ['Rotation',          `<strong>${esc(r.RotationName)}</strong>`],
        ['Members in rotation', `${r.PoolSize}`],
        ['Started',           fmtDate(r.RotationStartDate)],
        ['Ended',             fmtDate(r.RotationEndDate)],
        ['Total contributed', `$${totalContributed.toLocaleString()}`],
        ['Total received pot', `<span style="color:#16a34a;font-weight:700;">$${totalReceived.toLocaleString()}</span>`],
      ],
      ctaLabel: 'Join another pool',
      ctaUrl:   `${baseUrl}/join-pool.html`,
      closing:  `Thank you for being part of the Alajo Yankee community. Ready for your next rotation?`,
    };
    return notifyUser({
      user:    { userID: r.UserID, email: r.Email, phone: r.Phone },
      subject: 'Rotation completed 🎉',
      message: renderText(tplData),
      html:    renderEmail(tplData),
    });
  }));
}

module.exports = { submit, getMine, getPending, verify };
