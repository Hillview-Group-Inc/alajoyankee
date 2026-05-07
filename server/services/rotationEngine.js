/* ============================================
   server/services/rotationEngine.js
   PRD §4.2–4.3 — Rotation creation & date math
   ============================================ */

'use strict';

const { sql, txQuery } = require('../config/db');

/* ── Date helpers (UTC-based, midnight-anchored) ─────────────────────── */

const MS_PER_DAY = 86_400_000;
const DAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/** Strip a JS Date down to UTC midnight. */
function atUtcMidnight(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Add `n` days (can be negative) and return a new Date at UTC midnight. */
function addDays(date, n) {
  return new Date(atUtcMidnight(date).getTime() + n * MS_PER_DAY);
}

/**
 * Next occurrence of `targetDay` strictly AFTER `date`.
 * If `date` is already on `targetDay`, jumps a full week forward.
 */
function nextWeekday(date, targetDay) {
  const d = atUtcMidnight(date);
  const today = d.getUTCDay();
  const diff = ((targetDay - today + 7) % 7) || 7;
  return addDays(d, diff);
}

const nextMondayAfter = (date) => nextWeekday(date, DAY.MON);
const firstFridayAfter = (date) => nextWeekday(date, DAY.FRI);

/**
 * If `date` is already a Monday, return it; otherwise snap forward to the next Monday.
 * (PRD §4.2 step 2: "Always ensure it's a Monday".)
 */
function snapForwardToMonday(date) {
  const d = atUtcMidnight(date);
  return d.getUTCDay() === DAY.MON ? d : nextWeekday(d, DAY.MON);
}

/* ── Core rotation creation ──────────────────────────────────────────── */

/**
 * Compute rotation dates for a freshly-filled pool.
 * @param {Date} filledDate     — moment the pool reached capacity
 * @param {number} poolSize     — number of members (>=2)
 * @param {number} valueInDays  — RotationSchedule.ValueInDays
 * @returns {{ startDate, lastContributionDate, endDate }} — all at UTC midnight
 */
function computeRotationDates(filledDate, poolSize, valueInDays) {
  const startDate = nextMondayAfter(filledDate);
  const rawLast   = addDays(startDate, (poolSize - 1) * valueInDays);
  const lastContributionDate = snapForwardToMonday(rawLast);
  const endDate = firstFridayAfter(lastContributionDate);
  return { startDate, lastContributionDate, endDate };
}

/**
 * Per-member contribution due date.
 * PRD §4.3: ContributionDueDate = StartDate + (Rank - 1) * ValueInDays
 */
function computeDueDate(startDate, rank, valueInDays) {
  return addDays(startDate, (rank - 1) * valueInDays);
}

/**
 * Create the Rotation row + per-member RotationDetail rows for a filled pool.
 * Must be called inside an active SQL Server transaction.
 *
 * @param {sql.Transaction} tx
 * @param {object} args
 * @param {number} args.poolID
 * @param {number} args.poolSize       — PoolSize.PoolSizeValue
 * @param {number} args.valueInDays    — RotationSchedule.ValueInDays
 * @param {number} args.contributionAmount — ContributionAmount.Amount
 * @param {Array<{userID:number, rank:number}>} args.enrollments — sorted by rank ASC
 * @returns {Promise<{rotationID:number, startDate:Date, endDate:Date}>}
 */
async function createRotationForPool(tx, { poolID, poolSize, valueInDays, contributionAmount, enrollments }) {
  const filledDate = new Date();
  const { startDate, lastContributionDate, endDate } = computeRotationDates(filledDate, poolSize, valueInDays);

  const rotationName = `Rotation #${poolID} · ${startDate.toISOString().slice(0, 10)}`;

  const rotResult = await txQuery(
    tx,
    `INSERT INTO Rotation
       (RotationName, PoolID, Status, RotationStartDate, LastContributionDate, RotationEndDate)
     OUTPUT INSERTED.RotationID
     VALUES (@name, @poolID, 'started', @start, @last, @end)`,
    {
      name:    { type: sql.NVarChar(150), value: rotationName },
      poolID:  { type: sql.Int,           value: poolID },
      start:   { type: sql.Date,          value: startDate },
      last:    { type: sql.Date,          value: lastContributionDate },
      end:     { type: sql.Date,          value: endDate },
    }
  );
  const rotationID = rotResult.recordset[0].RotationID;

  for (const e of enrollments) {
    const dueDate = computeDueDate(startDate, e.rank, valueInDays);
    await txQuery(
      tx,
      `INSERT INTO RotationDetail
         (RotationID, PoolID, UserID, Rank, ContributionDue, ContributionDueDate)
       VALUES (@rotationID, @poolID, @userID, @rank, @amt, @due)`,
      {
        rotationID: { type: sql.Int,           value: rotationID },
        poolID:     { type: sql.Int,           value: poolID },
        userID:     { type: sql.Int,           value: e.userID },
        rank:       { type: sql.Int,           value: e.rank },
        amt:        { type: sql.Decimal(18,2), value: contributionAmount },
        due:        { type: sql.Date,          value: dueDate },
      }
    );
  }

  return { rotationID, startDate, lastContributionDate, endDate };
}

module.exports = {
  // Date helpers (exported for testing / reuse)
  addDays,
  nextMondayAfter,
  firstFridayAfter,
  snapForwardToMonday,
  computeRotationDates,
  computeDueDate,
  // Main entry point
  createRotationForPool,
};
