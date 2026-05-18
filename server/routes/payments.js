/* ============================================
   server/routes/payments.js
   POST /api/payments/submit   — member submits a contribution payment
   GET  /api/payments/mine     — member's payment history
   GET  /api/payments/pending  — admin or coordinator: pending payments queue (scoped)
   POST /api/payments/verify   — admin or coordinator: mark Verified or Failed (scoped)
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const {
  authenticateToken,
  loadCoordinatorScope,
  requireAdminOrCoordinator,
} = require('../middleware/auth');
const { submit, getMine, getPending, verify } = require('../controllers/paymentController');

const router = express.Router();

const submitRules = [
  body('rotationDetailContributionID')
    .exists().withMessage('rotationDetailContributionID is required.')
    .isInt({ min: 1 }).withMessage('rotationDetailContributionID is invalid.'),
  body('amount')
    .exists().withMessage('amount is required.')
    .isFloat({ gt: 0 }).withMessage('amount must be greater than zero.'),
];

const verifyRules = [
  body('paymentID')
    .exists().withMessage('paymentID is required.')
    .isInt({ min: 1 }).withMessage('paymentID is invalid.'),
  body('status')
    .exists().withMessage('status is required.')
    .isIn(['Verified', 'Failed']).withMessage('status must be Verified or Failed.'),
];

router.post('/submit',  authenticateToken,                                                       submitRules, submit);
router.get( '/mine',    authenticateToken,                                                                    getMine);
router.get( '/pending', authenticateToken, loadCoordinatorScope, requireAdminOrCoordinator,                   getPending);
router.post('/verify',  authenticateToken, loadCoordinatorScope, requireAdminOrCoordinator,      verifyRules, verify);

module.exports = router;
