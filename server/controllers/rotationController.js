/* ============================================
   server/controllers/rotationController.js
   GET /api/rotations/current — active rotations for the signed-in user
   GET /api/rotations/history — completed rotations
   ============================================ */

'use strict';

const { sql, query } = require('../config/db');

/**
 * Shape rotation rows joined with the user's RotationDetail entry.
 * One row per rotation; the user's RotationDetail is flattened into the row.
 */
function buildSelect(statusClause) {
  return `
    SELECT
      r.RotationID,
      r.RotationName,
      r.Status                AS RotationStatus,
      r.RotationStartDate,
      r.LastContributionDate,
      r.RotationEndDate,
      r.PoolID,
      ps.PoolSizeName,
      ps.PoolSizeValue,
      rs.RotationScheduleName,
      rs.ValueInDays,
      ca.Amount               AS ContributionAmount,
      rd.RotationDetailID,
      rd.Rank,
      rd.ContributionDue,
      rd.ContributionDueDate
    FROM RotationDetail   rd
    JOIN Rotation         r  ON r.RotationID = rd.RotationID
    JOIN ContributionPool cp ON cp.PoolID = r.PoolID
    JOIN PoolSize         ps ON ps.PoolSizeID = cp.PoolSizeID
    JOIN RotationSchedule rs ON rs.RotationScheduleID = cp.RotationScheduleID
    JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
    WHERE rd.UserID = @userID
      AND r.Status ${statusClause}
    ORDER BY rd.ContributionDueDate ASC
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
