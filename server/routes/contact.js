/* ============================================
   server/routes/contact.js
   POST /api/contact
   GET  /api/messages  (authenticated)
   ============================================ */

'use strict';

const express  = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { submitContact, getMessages } = require('../controllers/contactController');

const router = express.Router();

/* ── Validation rules for contact form ── */
const contactRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 200 }).withMessage('Name must be 200 characters or fewer.'),

  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please enter a valid phone number.'),

  body('message')
    .trim()
    .notEmpty().withMessage('Message is required.')
    .isLength({ min: 10 }).withMessage('Message must be at least 10 characters.')
    .isLength({ max: 5000 }).withMessage('Message must be 5,000 characters or fewer.'),
];

/* ── Routes ── */
router.post('/',          contactRules,    submitContact);
router.get( '/messages',  authenticateToken, getMessages);

module.exports = router;
