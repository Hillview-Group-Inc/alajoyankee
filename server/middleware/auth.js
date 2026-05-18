/* ============================================
   server/middleware/auth.js
   JWT verification + role/scope middleware
   ============================================ */

'use strict';

const jwt = require('jsonwebtoken');
const { sql, query } = require('../config/db');

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

/**
 * Middleware: load coordinator scope onto req.user.
 *   - Admins: req.user.isAdmin = true, coordinatorPoolIDs = null (no filter applied downstream).
 *   - Members: coordinatorPoolIDs is an array of PoolIDs they coordinate (possibly empty).
 * Must be used AFTER authenticateToken.
 */
async function loadCoordinatorScope(req, res, next) {
  try {
    if (req.user && req.user.role === 'admin') {
      req.user.isAdmin = true;
      req.user.coordinatorPoolIDs = null;
      return next();
    }
    const r = await query(
      `SELECT PoolID FROM CoordinatorAssignment WHERE UserID = @uid`,
      { uid: { type: sql.Int, value: req.user.userID } }
    );
    req.user.isAdmin = false;
    req.user.coordinatorPoolIDs = r.recordset.map(x => x.PoolID);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: allow admin OR a coordinator with at least one assignment.
 * Must be used AFTER loadCoordinatorScope.
 */
function requireAdminOrCoordinator(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Access denied.' });
  if (req.user.isAdmin) return next();
  if (Array.isArray(req.user.coordinatorPoolIDs) && req.user.coordinatorPoolIDs.length > 0) return next();
  return res.status(403).json({ message: 'Access denied. Admin or coordinator privileges required.' });
}

module.exports = {
  authenticateToken,
  requireAdmin,
  loadCoordinatorScope,
  requireAdminOrCoordinator,
};
