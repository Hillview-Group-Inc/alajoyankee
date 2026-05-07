/* ============================================
   server/routes/payments.js
   POST /api/payments/submit   — member submits a contribution payment
   GET  /api/payments/mine     — member's payment history
   GET  /api/payments/pending  — admin: pending payments queue
   POST /api/payments/verify   — admin: mark Verified or Failed
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { submit, getMine, getPending, verify } = require('../controllers/paymentController');

const router = express.Router();

const submitRules = [
  body('rotationDetailID')
    .exists().withMessage('rotationDetailID is required.')
    .isInt({ min: 1 }).withMessage('rotationDetailID is invalid.'),
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

router.post('/submit',  authenticateToken,                submitRules, submit);
router.get( '/mine',    authenticateToken,                              getMine);
router.get( '/pending', authenticateToken, requireAdmin,                getPending);
router.post('/verify',  authenticateToken, requireAdmin, verifyRules,   verify);

module.exports = router;
