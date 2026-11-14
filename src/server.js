const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const connectDatabase = require('./config/db');
const Order = require('./models/Order');
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const checkoutRoutes = require('./routes/checkout');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const codRoutes = require('./routes/cod');
const refundRoutes = require('./routes/refunds');
const { webhookHandler } = require('./routes/payments');
const { expireReservation } = require('./utils/orders');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
let server = null;
let cleanupTimer = null;
let cleanupRunning = false;
let shuttingDown = false;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
}
function normalizeOrigin(value) {
  if (!value) return null;
  try { return new URL(value).origin; }
  catch { throw new Error('Invalid URL configured: ' + value); }
}
function configuredOrigins() {
  return [process.env.PUBLIC_APP_URL, process.env.ADMIN_URL, process.env.STORE_URL, process.env.DEV_TUNNEL_ORIGIN]
    .filter(Boolean).map(normalizeOrigin).filter(Boolean);
}
function validateProductionConfig() {
  if (!IS_PRODUCTION) return;
  for (const key of [
    'MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
    'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
    'PUBLIC_APP_URL', 'ADMIN_URL', 'RESEND_API_KEY', 'EMAIL_FROM',
    'EMAIL_REPLY_TO', 'STORE_URL'
  ]) required(key);
  if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  if (process.env.RAZORPAY_WEBHOOK_SECRET.length < 32) throw new Error('RAZORPAY_WEBHOOK_SECRET must be at least 32 characters.');
  if (process.env.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
}
validateProductionConfig();

const allowedOrigins = IS_PRODUCTION ? configuredOrigins() : [
  'http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000',
  'http://127.0.0.1:5000', 'http://localhost:5500', 'http://127.0.0.1:5500',
  'http://localhost:5501', 'http://127.0.0.1:5501', ...configuredOrigins()
];

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com'],
      frameSrc: ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com'],
      formAction: ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'self'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use((req, res, next) => {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  const validIncoming = /^[A-Za-z0-9._:-]{1,100}$/.test(incoming);
  req.requestId = validIncoming ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('Blocked CORS origin:', origin);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'Idempotency-Key']
}));
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));
app.use('/api', rateLimit({
  windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false,
  handler(req, res) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.', requestId: req.requestId });
  }
}));
app.use('/api/admin', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

/* Preserve the raw body for Razorpay webhook signature validation. */
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), webhookHandler);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({
  ok: true, service: 'strydegosox-api', uptimeSeconds: Math.floor(process.uptime()),
  time: new Date().toISOString(), requestId: req.requestId
}));
app.get('/api/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({
    ok: ready, service: 'strydegosox-api', database: ready ? 'ready' : 'not-ready',
    time: new Date().toISOString(), requestId: req.requestId
  });
});

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/cod', codRoutes);
app.use('/api/admin/refunds', refundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found', path: req.originalUrl }));

if (process.env.SERVE_FRONTEND === 'true') {
  const frontendDir = path.join(__dirname, '../frontend');
  const adminDir = path.join(__dirname, '../admin');
  app.use('/admin', express.static(adminDir, {
    maxAge: IS_PRODUCTION ? '1d' : 0,
    setHeaders: (res, file) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }));
  app.get('/admin', (req, res) => res.sendFile(path.join(adminDir, 'admin.html')));
  app.use('/admin', (req, res) => res.status(404).send('Admin resource not found'));
  app.use(express.static(frontendDir, { maxAge: IS_PRODUCTION ? '1d' : 0 }));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error('[API ERROR]', { requestId: req.requestId, path: req.originalUrl, message: err.message });
  if (res.headersSent) return next(err);
  const status = ['ValidationError', 'CastError'].includes(err.name) ? 400 : (err.code === 11000 ? 409 : 500);
  return res.status(status).json({
    success: false,
    error: IS_PRODUCTION ? 'Something went wrong. Please try again.' : err.message,
    requestId: req.requestId
  });
});

async function cleanupExpiredReservations() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const orders = await Order.find({
      fulfillmentStatus: 'pending_payment',
      paymentStatus: { $in: ['pending', 'authorized'] },
      reservedUntil: { $lt: new Date(), $ne: null }
    }).select('_id').lean();
    for (const order of orders) {
      try { await expireReservation(order._id); }
      catch (error) { console.error('Reservation expiry failed:', String(order._id), error.message); }
    }
  } catch (error) { console.error('Reservation cleanup failed:', error.message); }
  finally { cleanupRunning = false; }
}
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Received ' + signal + '. Starting graceful shutdown.');
  if (cleanupTimer) clearInterval(cleanupTimer);
  const forceTimer = setTimeout(() => process.exit(1), 15000);
  forceTimer.unref();
  try {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceTimer);
    console.error('Shutdown error:', error.message);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', error => { console.error(error); shutdown('unhandledRejection'); });
process.on('uncaughtException', error => { console.error(error); shutdown('uncaughtException'); });

async function startServer() {
  try {
    await connectDatabase();
    await cleanupExpiredReservations();
    cleanupTimer = setInterval(cleanupExpiredReservations, 60000);
    cleanupTimer.unref();
    server = app.listen(PORT, () => console.log('StrydeGoSox API running on port ' + PORT));
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}
module.exports = app;
if (require.main === module) startServer();
