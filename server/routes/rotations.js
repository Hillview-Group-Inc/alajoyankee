/* ============================================
   server/routes/rotations.js
   GET /api/rotations/current
   GET /api/rotations/history
   ============================================ */

'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getCurrent, getHistory } = require('../controllers/rotationController');

const router = express.Router();

router.get('/current', authenticateToken, getCurrent);
router.get('/history', authenticateToken, getHistory);

module.exports = router;
