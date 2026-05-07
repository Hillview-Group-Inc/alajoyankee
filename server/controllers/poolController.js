/* ============================================
   server/controllers/poolController.js
   PRD §4.1 — Pool enrollment with race-safe transaction
   ============================================ */

'use strict';

const { validationResult } = require('express-validator');
const { sql, query, txQuery, withTransaction } = require('../config/db');
const { createRotationForPool } = require('../services/rotationEngine');
const { notifyUser } = require('../services/notificationService');
const { renderEmail, renderText, esc } = require('../services/emailTemplates');

/* ══════════════════════════════════════════
   GET /api/pools/options
   Returns active lookup data for the enrollment form.
   ══════════════════════════════════════════ */
async function getOptions(req, res, next) {
  try {
    const [sizes, schedules, amounts] = await Promise.all([
      query(`SELECT PoolSizeID, PoolSizeName, PoolSizeValue
             FROM PoolSize WHERE IsActive = 1 ORDER BY PoolSizeValue`),
      query(`SELECT RotationScheduleID, RotationScheduleName, ValueInDays
             FROM RotationSchedule WHERE IsActive = 1 ORDER BY ValueInDays`),
      query(`SELECT ContributionAmountID, Amount
             FROM ContributionAmount WHERE IsActive = 1 ORDER BY Amount`),
    ]);

    res.json({
      poolSizes: sizes.recordset,
      schedules: schedules.recordset,
      amounts:   amounts.recordset,
    });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   POST /api/pools/enroll
   Body: { poolSizeID, rotationScheduleID, contributionAmountID }
   ══════════════════════════════════════════ */
async function enroll(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  }

  const userID                = req.user.userID;
  const poolSizeID            = parseInt(req.body.poolSizeID, 10);
  const rotationScheduleID    = parseInt(req.body.rotationScheduleID, 10);
  const contributionAmountID  = parseInt(req.body.contributionAmountID, 10);

  try {
    const result = await withTransaction(async (tx) => {

      // 1. Validate the lookup IDs are real & active, and grab the values we need
      const lookups = await txQuery(
        tx,
        `SELECT
           ps.PoolSizeValue,
           rs.ValueInDays,
           ca.Amount
         FROM PoolSize           ps
         CROSS JOIN RotationSchedule rs
         CROSS JOIN ContributionAmount ca
         WHERE ps.PoolSizeID = @psID           AND ps.IsActive = 1
           AND rs.RotationScheduleID = @rsID   AND rs.IsActive = 1
           AND ca.ContributionAmountID = @caID AND ca.IsActive = 1`,
        {
          psID: { type: sql.Int, value: poolSizeID },
          rsID: { type: sql.Int, value: rotationScheduleID },
          caID: { type: sql.Int, value: contributionAmountID },
        }
      );
      if (!lookups.recordset.length) {
        const e = new Error('Invalid pool configuration.');
        e.status = 400;
        throw e;
      }
      const { PoolSizeValue, ValueInDays, Amount } = lookups.recordset[0];

      // 2. PRD edge case: prevent duplicate enrollment in any active matching pool
      const dup = await txQuery(
        tx,
        `SELECT cpe.ContributionPoolEnrollmentID
         FROM ContributionPoolEnrollment cpe
         JOIN ContributionPool cp ON cp.PoolID = cpe.PoolID
         WHERE cpe.UserID = @userID
           AND cp.PoolSizeID = @psID
           AND cp.RotationScheduleID = @rsID
           AND cp.ContributionAmountID = @caID
           AND cp.Status IN ('open','filled')`,
        {
          userID: { type: sql.Int, value: userID },
          psID:   { type: sql.Int, value: poolSizeID },
          rsID:   { type: sql.Int, value: rotationScheduleID },
          caID:   { type: sql.Int, value: contributionAmountID },
        }
      );
      if (dup.recordset.length > 0) {
        const e = new Error('You are already enrolled in a pool with these settings.');
        e.status = 409;
        throw e;
      }

      // 3. Find an open pool matching params (PRD §4.1 step 2)
      let poolID;
      const found = await txQuery(
        tx,
        `SELECT PoolID FROM ContributionPool
         WHERE PoolSizeID = @psID
           AND RotationScheduleID = @rsID
           AND ContributionAmountID = @caID
           AND Status = 'open'`,
        {
          psID: { type: sql.Int, value: poolSizeID },
          rsID: { type: sql.Int, value: rotationScheduleID },
          caID: { type: sql.Int, value: contributionAmountID },
        }
      );

      if (found.recordset.length > 0) {
        poolID = found.recordset[0].PoolID;
      } else {
        // 4. Create new pool (PRD §4.1 step 4)
        const created = await txQuery(
          tx,
          `INSERT INTO ContributionPool
             (PoolSizeID, RotationScheduleID, ContributionAmountID, Status)
           OUTPUT INSERTED.PoolID
           VALUES (@psID, @rsID, @caID, 'open')`,
          {
            psID: { type: sql.Int, value: poolSizeID },
            rsID: { type: sql.Int, value: rotationScheduleID },
            caID: { type: sql.Int, value: contributionAmountID },
          }
        );
        poolID = created.recordset[0].PoolID;
      }

      // 5. Compute next rank (PRD §4.1 step 3)
      const rankRow = await txQuery(
        tx,
        `SELECT COUNT(*) AS Cnt FROM ContributionPoolEnrollment WHERE PoolID = @poolID`,
        { poolID: { type: sql.Int, value: poolID } }
      );
      const nextRank = rankRow.recordset[0].Cnt + 1;

      // Defensive — should never trigger thanks to SERIALIZABLE, but worth the guard
      if (nextRank > PoolSizeValue) {
        const e = new Error('This pool just filled. Please try enrolling again — a new pool will be created.');
        e.status = 409;
        throw e;
      }

      // 6. Insert enrollment (PRD §4.1 step 5)
      await txQuery(
        tx,
        `INSERT INTO ContributionPoolEnrollment (PoolID, UserID, Rank)
         VALUES (@poolID, @userID, @rank)`,
        {
          poolID: { type: sql.Int, value: poolID },
          userID: { type: sql.Int, value: userID },
          rank:   { type: sql.Int, value: nextRank },
        }
      );

      // 7. If pool just filled, mark filled + create rotation (PRD §4.1 step 6, §4.2)
      let rotationID = null;
      let rotationDates = null;
      if (nextRank === PoolSizeValue) {
        await txQuery(
          tx,
          `UPDATE ContributionPool
             SET Status = 'filled', FilledDate = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
           WHERE PoolID = @poolID`,
          { poolID: { type: sql.Int, value: poolID } }
        );

        // Fetch all enrollments to seed RotationDetail rows
        const rows = await txQuery(
          tx,
          `SELECT UserID, Rank FROM ContributionPoolEnrollment
           WHERE PoolID = @poolID ORDER BY Rank`,
          { poolID: { type: sql.Int, value: poolID } }
        );
        const enrollments = rows.recordset.map(r => ({ userID: r.UserID, rank: r.Rank }));

        const rotation = await createRotationForPool(tx, {
          poolID,
          poolSize: PoolSizeValue,
          valueInDays: ValueInDays,
          contributionAmount: Amount,
          enrollments,
        });
        rotationID = rotation.rotationID;
        rotationDates = {
          startDate:            rotation.startDate,
          lastContributionDate: rotation.lastContributionDate,
          endDate:              rotation.endDate,
        };
      }

      return {
        poolID,
        rank: nextRank,
        poolSize: PoolSizeValue,
        filled: nextRank === PoolSizeValue,
        rotationID,
        rotationDates,
      };
    });

    // PRD §6.2 — pool-enrollment notification (to the new member)
    sendEnrollmentNotification({ userID, poolID: result.poolID })
      .catch(err => console.warn('Pool-enrollment notification failed:', err.message));

    // PRD §6.3 — rotation-start notifications (broadcast to all members)
    if (result.filled && result.rotationID) {
      sendRotationStartNotifications(result.rotationID)
        .catch(err => console.warn('Rotation-start notifications failed:', err.message));
    }

    res.status(201).json({
      message: result.filled
        ? 'You\'re enrolled — and the pool just filled. The rotation has started!'
        : `You're enrolled. Position #${result.rank} of ${result.poolSize}.`,
      ...result,
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}

/* ══════════════════════════════════════════
   GET /api/pools/active
   Returns the signed-in user's active enrollments.
   ══════════════════════════════════════════ */
async function getMyActivePools(req, res, next) {
  try {
    const result = await query(
      `SELECT
         cpe.ContributionPoolEnrollmentID AS EnrollmentID,
         cpe.PoolID,
         cpe.Rank,
         cpe.CreatedAt                     AS EnrolledAt,
         cp.Status                         AS PoolStatus,
         cp.OpenDate,
         cp.FilledDate,
         ps.PoolSizeName,
         ps.PoolSizeValue,
         rs.RotationScheduleName,
         rs.ValueInDays,
         ca.Amount                         AS ContributionAmount,
         (SELECT COUNT(*) FROM ContributionPoolEnrollment x WHERE x.PoolID = cp.PoolID) AS MemberCount,
         r.RotationID,
         r.RotationName,
         r.Status                          AS RotationStatus,
         r.RotationStartDate,
         r.RotationEndDate
       FROM ContributionPoolEnrollment cpe
       JOIN ContributionPool   cp ON cp.PoolID = cpe.PoolID
       JOIN PoolSize           ps ON ps.PoolSizeID = cp.PoolSizeID
       JOIN RotationSchedule   rs ON rs.RotationScheduleID = cp.RotationScheduleID
       JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
       LEFT JOIN Rotation       r ON r.PoolID = cp.PoolID
       WHERE cpe.UserID = @userID
         AND cp.Status IN ('open','filled')
       ORDER BY cpe.CreatedAt DESC`,
      { userID: { type: sql.Int, value: req.user.userID } }
    );

    res.json({ pools: result.recordset });
  } catch (err) {
    next(err);
  }
}

/* ── Notification helpers (run after the transaction commits) ── */

async function sendEnrollmentNotification({ userID, poolID }) {
  const rows = await query(
    `SELECT u.UserID, u.FirstName, u.Email, u.Phone,
            ps.PoolSizeName, ps.PoolSizeValue,
            rs.RotationScheduleName, rs.ValueInDays,
            ca.Amount, cpe.Rank,
            (SELECT COUNT(*) FROM ContributionPoolEnrollment x WHERE x.PoolID = cp.PoolID) AS MemberCount
     FROM ContributionPoolEnrollment cpe
     JOIN ContributionPool   cp ON cp.PoolID = cpe.PoolID
     JOIN PoolSize           ps ON ps.PoolSizeID = cp.PoolSizeID
     JOIN RotationSchedule   rs ON rs.RotationScheduleID = cp.RotationScheduleID
     JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
     JOIN Users              u  ON u.UserID = cpe.UserID
     WHERE cpe.UserID = @uID AND cpe.PoolID = @pID`,
    {
      uID: { type: sql.Int, value: userID },
      pID: { type: sql.Int, value: poolID },
    }
  );
  if (!rows.recordset.length) return;
  const r = rows.recordset[0];

  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const filledLabel = r.MemberCount === r.PoolSizeValue
    ? `<span style="color:#16a34a;font-weight:600;">${r.MemberCount}/${r.PoolSizeValue} (filled)</span>`
    : `${r.MemberCount}/${r.PoolSizeValue} (waiting for ${r.PoolSizeValue - r.MemberCount} more)`;

  const tplData = {
    accent:    'primary',
    heading:   `You're enrolled — ${r.PoolSizeName}`,
    preheader: `Position #${r.Rank} of ${r.PoolSizeValue}`,
    greeting:  `Hi ${esc(r.FirstName)},`,
    intro: [
      `You've joined a contribution pool. We'll notify you again as soon as the pool fills and the rotation starts.`,
    ],
    rows: [
      ['Pool size',           `${esc(r.PoolSizeName)} <span style="color:#6b7280;">(${r.PoolSizeValue} members)</span>`],
      ['Rotation schedule',   `${esc(r.RotationScheduleName)} <span style="color:#6b7280;">· every ${r.ValueInDays} days</span>`],
      ['Contribution amount', `<strong>$${Number(r.Amount).toLocaleString()}</strong>`],
      ['Your rank',           `<strong>#${r.Rank}</strong> of ${r.PoolSizeValue}`],
      ['Members so far',      filledLabel],
    ],
    ctaLabel: 'View dashboard',
    ctaUrl:   `${baseUrl}/dashboard.html`,
    closing:  `Tip: position #${r.Rank} means you'll receive your payout after ${r.Rank - 1} other ${r.Rank - 1 === 1 ? 'member has' : 'members have'} taken their turn.`,
  };

  await notifyUser({
    user:    { userID: r.UserID, email: r.Email, phone: r.Phone },
    subject: `You're enrolled — ${r.PoolSizeName}`,
    message: renderText(tplData),
    html:    renderEmail(tplData),
  });
}

async function sendRotationStartNotifications(rotationID) {
  const rows = await query(
    `SELECT u.UserID, u.FirstName, u.Email, u.Phone,
            r.RotationName, r.RotationStartDate, r.RotationEndDate,
            rd.ContributionDue, rd.ContributionDueDate, rd.Rank
     FROM RotationDetail rd
     JOIN Rotation r ON r.RotationID = rd.RotationID
     JOIN Users    u ON u.UserID = rd.UserID
     WHERE rd.RotationID = @rID`,
    { rID: { type: sql.Int, value: rotationID } }
  );

  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  await Promise.allSettled(rows.recordset.map(r => {
    const tplData = {
      accent:    'success',
      heading:   'Your rotation has started 🚀',
      preheader: `${esc(r.RotationName)} · your due date is ${fmtDate(r.ContributionDueDate)}`,
      greeting:  `Hi ${esc(r.FirstName)},`,
      intro: [
        `The pool is full and your rotation has officially started. Here are the dates and amounts to keep in mind.`,
      ],
      rows: [
        ['Rotation',          `<strong>${esc(r.RotationName)}</strong>`],
        ['Rotation start',    fmtDate(r.RotationStartDate)],
        ['Rotation end',      fmtDate(r.RotationEndDate)],
        ['Your rank',         `<strong>#${r.Rank}</strong>`],
        ['Your contribution', `<strong>$${Number(r.ContributionDue).toLocaleString()}</strong>`],
        ['Your due date',     `<span style="color:#d4a017;font-weight:600;">${fmtDate(r.ContributionDueDate)}</span>`],
      ],
      ctaLabel: 'Submit a payment',
      ctaUrl:   `${baseUrl}/payments.html`,
      closing:  `Submit your payment any time before your due date. An admin will verify it and the rotation moves forward.`,
    };
    return notifyUser({
      user:    { userID: r.UserID, email: r.Email, phone: r.Phone },
      subject: 'Your rotation has started 🚀',
      message: renderText(tplData),
      html:    renderEmail(tplData),
    });
  }));
}

module.exports = { getOptions, enroll, getMyActivePools };
