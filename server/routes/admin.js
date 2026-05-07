/* ============================================
   server/routes/admin.js
   All routes require authenticated user with role='admin'.
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const c = require('../controllers/adminController');

const router = express.Router();

// All routes inherit auth+admin
router.use(authenticateToken, requireAdmin);

/* Configuration */
router.get( '/config', c.listConfig);

router.post('/config/pool-sizes', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('value').isInt({ min: 2, max: 1000 }),
], c.createPoolSize);

router.post('/config/schedules', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('valueInDays').isInt({ min: 1, max: 365 }),
], c.createSchedule);

router.post('/config/amounts', [
  body('amount').isFloat({ gt: 0 }),
], c.createAmount);

router.patch('/config/pool-sizes/:id/active', [body('active').isBoolean()], c.togglePoolSize);
router.patch('/config/schedules/:id/active',  [body('active').isBoolean()], c.toggleSchedule);
router.patch('/config/amounts/:id/active',    [body('active').isBoolean()], c.toggleAmount);

/* Monitoring */
router.get('/pools',     c.listAllPools);
router.get('/rotations', c.listAllRotations);

module.exports = router;
