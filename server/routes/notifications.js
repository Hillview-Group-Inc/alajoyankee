/* ============================================
   server/routes/notifications.js
   ============================================ */

'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { listMine } = require('../controllers/notificationController');

const router = express.Router();

router.get('/mine', authenticateToken, listMine);

module.exports = router;
