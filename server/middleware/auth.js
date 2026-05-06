/* ============================================
   server/middleware/auth.js
   JWT verification middleware
   ============================================ */

'use strict';

const jwt = require('jsonwebtoken');

/**
 * Middleware: verify JWT from Authorization header.
 * Attaches decoded user to req.user on success.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
    return res.status(403).json({ message: 'Invalid token.' });
  }
}

/**
 * Middleware: require admin role.
 * Must be used AFTER authenticateToken.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin };
