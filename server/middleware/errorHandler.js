/* ============================================
   server/middleware/errorHandler.js
   Global error handler for Express
   ============================================ */

'use strict';

function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Log error
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.message);
  if (isDev) console.error(err.stack);

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({
      message: 'Validation failed',
      errors:  err.errors,
    });
  }

  // SQL Server duplicate key
  if (err.number === 2627 || err.number === 2601) {
    return res.status(409).json({ message: 'A record with this information already exists.' });
  }

  // Default
  const status  = err.status || err.statusCode || 500;
  const message = (isDev || status < 500) ? err.message : 'An unexpected error occurred.';

  res.status(status).json({ message });
}

function notFound(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` });
}

module.exports = { errorHandler, notFound };
