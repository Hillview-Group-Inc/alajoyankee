/* ============================================
   server/routes/auth.js
   POST /api/auth/register
   POST /api/auth/login
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');

const router = express.Router();

/* ── Validation rules ── */
const registerRules = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ max: 100 }).withMessage('First name must be 100 characters or fewer.'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ max: 100 }).withMessage('Last name must be 100 characters or fewer.'),

  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required.')
    .isLength({ max: 255 }).withMessage('Email must be 255 characters or fewer.')
    .normalizeEmail(),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please enter a valid phone number.')
    .isLength({ max: 50 }).withMessage('Phone must be 50 characters or fewer.'),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .isLength({ max: 128 }).withMessage('Password must be 128 characters or fewer.'),
];

const loginRules = [
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),
];

const forgotRules = [
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),
];

const resetRules = [
  body('token')
    .isLength({ min: 32 }).withMessage('Reset token is invalid.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .isLength({ max: 128 }).withMessage('Password must be 128 characters or fewer.'),
];

/* ── Routes ── */
router.post('/register',        registerRules, register);
router.post('/login',           loginRules,    login);
router.post('/forgot-password', forgotRules,   forgotPassword);
router.post('/reset-password',  resetRules,    resetPassword);

module.exports = router;
