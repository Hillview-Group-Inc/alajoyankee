/* ============================================
   server/controllers/adminController.js
   PRD §2.2 — admin: manage configurations, monitor pools/rotations
   All routes assume requireAdmin has already run.
   ============================================ */

'use strict';

const { validationResult } = require('express-validator');
const { sql, query } = require('../config/db');

/**
 * Build a safe SQL fragment that restricts to the caller's coordinator scope.
 * Returns either an empty string (admin / no filter needed) or
 * "AND <column> IN (1,2,3)" with integer-validated IDs.
 */
function scopeClause(req, column) {
  if (req.user && req.user.isAdmin) return '';
  const ids = (req.user && req.user.coordinatorPoolIDs) || [];
  const safe = ids.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0);
  if (!safe.length) return ` AND 1 = 0`; // no scope → return zero rows
  return ` AND ${column} IN (${safe.join(',')})`;
}

/* ══════════════════════════════════════════
   Configuration: Pool Sizes / Schedules / Amounts
   ══════════════════════════════════════════ */

async function listConfig(req, res, next) {
  try {
    const [sizes, schedules, amounts] = await Promise.all([
      query(`SELECT PoolSizeID, PoolSizeName, PoolSizeValue, IsActive, CreatedAt
             FROM PoolSize ORDER BY PoolSizeValue`),
      query(`SELECT RotationScheduleID, RotationScheduleName, ValueInDays, IsActive, CreatedAt
             FROM RotationSchedule ORDER BY ValueInDays`),
      query(`SELECT ContributionAmountID, Amount, IsActive, CreatedAt
             FROM ContributionAmount ORDER BY Amount`),
    ]);
    res.json({
      poolSizes: sizes.recordset,
      schedules: schedules.recordset,
      amounts:   amounts.recordset,
    });
  } catch (err) { next(err); }
}

async function createPoolSize(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  try {
    const { name, value } = req.body;
    const result = await query(
      `INSERT INTO PoolSize (PoolSizeName, PoolSizeValue)
       OUTPUT INSERTED.PoolSizeID, INSERTED.PoolSizeName, INSERTED.PoolSizeValue, INSERTED.IsActive
       VALUES (@name, @value)`,
      {
        name:  { type: sql.NVarChar(100), value: String(name).trim() },
        value: { type: sql.Int,           value: parseInt(value, 10) },
      }
    );
    res.status(201).json({ poolSize: result.recordset[0] });
  } catch (err) { next(err); }
}

async function createSchedule(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  try {
    const { name, valueInDays } = req.body;
    const result = await query(
      `INSERT INTO RotationSchedule (RotationScheduleName, ValueInDays)
       OUTPUT INSERTED.RotationScheduleID, INSERTED.RotationScheduleName, INSERTED.ValueInDays, INSERTED.IsActive
       VALUES (@name, @v)`,
      {
        name: { type: sql.NVarChar(100), value: String(name).trim() },
        v:    { type: sql.Int,           value: parseInt(valueInDays, 10) },
      }
    );
    res.status(201).json({ schedule: result.recordset[0] });
  } catch (err) { next(err); }
}

async function createAmount(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  try {
    const { amount } = req.body;
    const result = await query(
      `INSERT INTO ContributionAmount (Amount)
       OUTPUT INSERTED.ContributionAmountID, INSERTED.Amount, INSERTED.IsActive
       VALUES (@a)`,
      { a: { type: sql.Decimal(18,2), value: Number(amount) } }
    );
    res.status(201).json({ amount: result.recordset[0] });
  } catch (err) { next(err); }
}

/* Toggle IsActive. Body: { active: true|false } */
function setConfigActive(table, idColumn, idParam) {
  return async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
    try {
      const id = parseInt(req.params[idParam], 10);
      const active = !!req.body.active;
      const result = await query(
        `UPDATE ${table} SET IsActive = @a, UpdatedAt = SYSUTCDATETIME() WHERE ${idColumn} = @id`,
        {
          a:  { type: sql.Bit, value: active ? 1 : 0 },
          id: { type: sql.Int, value: id },
        }
      );
      if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Not found.' });
      res.json({ message: `Updated.`, id, active });
    } catch (err) { next(err); }
  };
}

/* ══════════════════════════════════════════
   Monitor: pools + rotations
   ══════════════════════════════════════════ */

async function listAllPools(req, res, next) {
  try {
    const result = await query(
      `SELECT
         cp.PoolID, cp.Status, cp.OpenDate, cp.FilledDate,
         ps.PoolSizeName, ps.PoolSizeValue,
         rs.RotationScheduleName, rs.ValueInDays,
         ca.Amount AS ContributionAmount,
         (SELECT COUNT(*) FROM ContributionPoolEnrollment x WHERE x.PoolID = cp.PoolID) AS MemberCount,
         r.RotationID, r.Status AS RotationStatus, r.RotationStartDate, r.RotationEndDate
       FROM ContributionPool cp
       JOIN PoolSize           ps ON ps.PoolSizeID = cp.PoolSizeID
       JOIN RotationSchedule   rs ON rs.RotationScheduleID = cp.RotationScheduleID
       JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
       LEFT JOIN Rotation       r ON r.PoolID = cp.PoolID
       WHERE 1 = 1${scopeClause(req, 'cp.PoolID')}
       ORDER BY cp.CreatedAt DESC`
    );
    res.json({ pools: result.recordset });
  } catch (err) { next(err); }
}

async function listAllRotations(req, res, next) {
  try {
    const result = await query(
      `SELECT
         r.RotationID, r.RotationName, r.Status,
         r.RotationStartDate, r.LastContributionDate, r.RotationEndDate,
         cp.PoolID, ps.PoolSizeName, ca.Amount AS ContributionAmount,
         (SELECT COUNT(*) FROM RotationDetail WHERE RotationID = r.RotationID) AS MemberCount,
         (SELECT COUNT(*) FROM Payments WHERE RotationID = r.RotationID AND Status = 'Verified') AS VerifiedPayments
       FROM Rotation r
       JOIN ContributionPool   cp ON cp.PoolID = r.PoolID
       JOIN PoolSize           ps ON ps.PoolSizeID = cp.PoolSizeID
       JOIN ContributionAmount ca ON ca.ContributionAmountID = cp.ContributionAmountID
       WHERE 1 = 1${scopeClause(req, 'r.PoolID')}
       ORDER BY r.CreatedAt DESC`
    );
    res.json({ rotations: result.recordset });
  } catch (err) { next(err); }
}

module.exports = {
  listConfig,
  createPoolSize,
  createSchedule,
  createAmount,
  togglePoolSize: setConfigActive('PoolSize',           'PoolSizeID',           'id'),
  toggleSchedule: setConfigActive('RotationSchedule',   'RotationScheduleID',   'id'),
  toggleAmount:   setConfigActive('ContributionAmount', 'ContributionAmountID', 'id'),
  listAllPools,
  listAllRotations,
};
