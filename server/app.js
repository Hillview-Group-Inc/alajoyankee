/* ============================================
   server/app.js
   Alajo Yankee · Express Application
   ============================================ */

'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const contactRoutes  = require('./routes/contact');
const poolRoutes     = require('./routes/pools');
const rotationRoutes = require('./routes/rotations');
const paymentRoutes  = require('./routes/payments');
const adminRoutes        = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const reminderScheduler  = require('./services/reminderScheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════════
   SECURITY MIDDLEWARE
   ════════════════════════════════════════════ */

// Helmet — sets secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc:   ["'self'"],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'"],
    },
  },
}));

// CORS
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Same-origin requests (frontend served from this same Express app) carry an
// Origin header but don't need a CORS check. We compare Origin's host to the
// request's Host header so the deployed Azure hostname doesn't need to be
// hard-coded in CORS_ORIGINS.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (_) {
    return false;
  }
}

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error(`CORS: origin "${origin}" not allowed.`);
      err.status = 403;
      callback(err);
    }
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.use((req, res, next) => {
  if (isSameOrigin(req)) return next();
  return corsMiddleware(req, res, next);
});

/* ════════════════════════════════════════════
   RATE LIMITING
   ════════════════════════════════════════════ */
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX        || '100',   10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests. Please try again later.' },
});
app.use('/api/', globalLimiter);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { message: 'Too many authentication attempts. Please wait 15 minutes.' },
});
app.use('/api/auth/', authLimiter);

/* ════════════════════════════════════════════
   GENERAL MIDDLEWARE
   ════════════════════════════════════════════ */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

/* ════════════════════════════════════════════
   HEALTH CHECK
   ════════════════════════════════════════════ */
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
    version:   require('../package.json').version,
  });
});

/* ════════════════════════════════════════════
   API ROUTES
   ════════════════════════════════════════════ */
app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/contact',   contactRoutes);
app.use('/api/messages',  contactRoutes); // alias: GET /api/messages → contactRoutes
app.use('/api/pools',     poolRoutes);
app.use('/api/rotations', rotationRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/notifications', notificationRoutes);

/* ════════════════════════════════════════════
   SERVE STATIC FRONTEND
   ════════════════════════════════════════════ */
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir, {
  maxAge:   process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag:     true,
  index:    'index.html',
}));

// SPA fallback — serve index.html for unknown routes
app.get('*', (req, res, next) => {
  // Don't fall back API routes
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

/* ════════════════════════════════════════════
   ERROR HANDLING
   ════════════════════════════════════════════ */
app.use(notFound);
app.use(errorHandler);

/* ════════════════════════════════════════════
   START SERVER
   ════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         Alajo Yankee Server v2.0          ║
╠═══════════════════════════════════════════╣
║  🚀  Running on   http://localhost:${PORT}   ║
║  🌍  Environment: ${(process.env.NODE_ENV || 'development').padEnd(14)} ║
║  🔒  JWT auth:    enabled                 ║
║  🗄️   DB:         SQL Server              ║
╚═══════════════════════════════════════════╝
  `);

  // Start the daily contribution-reminder job (3-days-before + day-of).
  reminderScheduler.start();
});

module.exports = app;
