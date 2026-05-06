/* ============================================
   server/routes/users.js
   GET /api/users/profile
   ============================================ */

'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getProfile }        = require('../controllers/userController');

const router = express.Router();

router.get('/profile', authenticateToken, getProfile);

module.exports = router;
