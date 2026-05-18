/* ============================================
   server/routes/admin.js
   Configuration routes require role='admin'.
   Pool/Rotation read routes are open to admins and coordinators
   (coordinators see only their assigned pools — filtered in controllers).
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const {
  authenticateToken,
  requireAdmin,
  loadCoordinatorScope,
  requireAdminOrCoordinator,
} = require('../middleware/auth');
const c = require('../controllers/adminController');

const router = express.Router();

// Every route requires a valid JWT.
router.use(authenticateToken);

/* Configuration — admin only */
router.get( '/config', requireAdmin, c.listConfig);

router.post('/config/pool-sizes', requireAdmin, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('value').isInt({ min: 2, max: 1000 }),
], c.createPoolSize);

router.post('/config/schedules', requireAdmin, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('valueInDays').isInt({ min: 1, max: 365 }),
], c.createSchedule);

router.post('/config/amounts', requireAdmin, [
  body('amount').isFloat({ gt: 0 }),
], c.createAmount);

router.patch('/config/pool-sizes/:id/active', requireAdmin, [body('active').isBoolean()], c.togglePoolSize);
router.patch('/config/schedules/:id/active',  requireAdmin, [body('active').isBoolean()], c.toggleSchedule);
router.patch('/config/amounts/:id/active',    requireAdmin, [body('active').isBoolean()], c.toggleAmount);

/* Monitoring — admins see all, coordinators see only their assigned pools */
router.get('/pools',     loadCoordinatorScope, requireAdminOrCoordinator, c.listAllPools);
router.get('/rotations', loadCoordinatorScope, requireAdminOrCoordinator, c.listAllRotations);

module.exports = router;
