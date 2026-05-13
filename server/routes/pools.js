/* ============================================
   server/routes/pools.js
   GET  /api/pools/options  — lookup data for enrollment form
   POST /api/pools/enroll   — join (or create) a pool
   GET  /api/pools/active   — signed-in user's active pools
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getOptions, enroll, getMyActivePools } = require('../controllers/poolController');

const router = express.Router();

const enrollRules = [
  body('poolSizeID')
    .exists().withMessage('Pool size is required.')
    .isInt({ min: 1 }).withMessage('Pool size is invalid.'),

  body('rotationScheduleID')
    .exists().withMessage('Rotation schedule is required.')
    .isInt({ min: 1 }).withMessage('Rotation schedule is invalid.'),

  body('contributionAmountID')
    .exists().withMessage('Contribution amount is required.')
    .isInt({ min: 1 }).withMessage('Contribution amount is invalid.'),
];

router.get( '/options', authenticateToken, getOptions);
router.post('/enroll',  authenticateToken, enrollRules, enroll);
router.get( '/active',  authenticateToken, getMyActivePools);

module.exports = router;
