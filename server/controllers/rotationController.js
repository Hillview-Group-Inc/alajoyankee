/* ============================================
   server/controllers/rotationController.js
   GET /api/rotations/current — active rotations for the signed-in user
   GET /api/rotations/history — completed rotations
   ============================================ */

'use strict';

const { sql, query } = require('../config/db');

/**
 * One row per RotationDetailContribution the user owes.
 * Each row carries:
 *   - the contribution itself (RotationDetailContributionID, ContributionDueDate, ContributionDue)
 *   - the parent collection event (RotationDetailID, MemberCollectionDate, RecipientUserID, RecipientName, RecipientRank)
 *   - the rotation/pool/schedule context
 *
 * For a pool of N members, an active rotation produces N rows for each user.
 */
function buildSelect(statusClause) {
  return `
    SELECT
      r.RotationID,
      r.RotationName,
      r.Status                  AS RotationStatus,
      r.RotationStartDate,
      r.LastContributionDate,
      r.RotationEndDate,
      r.PoolID,
      ps.PoolSizeName,
      ps.PoolSizeValue,
      rs.RotationScheduleName,
      rs.ValueInDays,
      ca.Amount                 AS ContributionAmount,
      rdc.RotationDetailContributionID,
      rdc.RotationDetailID,
      rdc.Rank                  AS ContributorRank,
      rdc.ContributionDue,
      rdc.ContributionDueDate,
      rd.UserID                 AS RecipientUserID,
      rd.Rank                   AS RecipientRank,
      rd.MemberCollectionDate,
      recipient.FirstName + ' ' + recipient.LastName AS RecipientName
    FROM RotationDetailContribution rdc
    JOIN RotationDetail       rd ON rd.RotationDetailID = rdc.RotationDetailID
    JOIN Rotation             r  ON r.RotationID        = rdc.RotationID
    JOIN Users                recipient ON recipient.UserID = rd.UserID
    JOIN ContributionPool     cp ON cp.PoolID = r.PoolID
    JOIN PoolSize             ps ON ps.PoolSizeID = cp.PoolSizeID
    JOIN RotationSchedule     rs ON rs.RotationScheduleID = cp.RotationScheduleID
    JOIN ContributionAmount   ca ON ca.ContributionAmountID = cp.ContributionAmountID
    WHERE rdc.UserID = @userID
      AND r.Status ${statusClause}
    ORDER BY rdc.ContributionDueDate ASC
  `;
}

/* ══════════════════════════════════════════
   GET /api/rotations/current
   ══════════════════════════════════════════ */
async function getCurrent(req, res, next) {
  try {
    const result = await query(
      buildSelect("IN ('started','in-progress')"),
      { userID: { type: sql.Int, value: req.user.userID } }
    );
    res.json({ rotations: result.recordset });
  } catch (err) {
    next(err);
  }
}

/* ══════════════════════════════════════════
   GET /api/rotations/history
   ══════════════════════════════════════════ */
async function getHistory(req, res, next) {
  try {
    const result = await query(
      buildSelect("= 'completed'"),
      { userID: { type: sql.Int, value: req.user.userID } }
    );
    res.json({ rotations: result.recordset });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCurrent, getHistory };
