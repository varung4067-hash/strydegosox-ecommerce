const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const COOKIE_NAME = 'sg_auth';

function cookieOptions() {
  const sameSite = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none';
  return {
    httpOnly: true,
    sameSite: ['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax',
    secure,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  };
}

function issueAuth(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

function clearAuth(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Enter a valid full name' });
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 160) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters' });

    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (adminEmail && email === adminEmail) {
      return res.status(409).json({ error: 'This email is reserved for the store administrator' });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'customer'
    });

    issueAuth(res, { sub: String(user._id), role: user.role, email: user.email });
    return res.status(201).json({ success: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Enter your email and password' });

    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');

    if (email === adminEmail && adminPassword && password === adminPassword) {
      issueAuth(res, { role: 'admin', email: adminEmail });
      return res.json({
        success: true,
        user: { id: 'admin', name: 'Administrator', email: adminEmail, role: 'admin' }
      });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.isActive === false) return res.status(403).json({ error: 'This account is disabled' });

    user.lastLoginAt = new Date();
    await user.save();
    issueAuth(res, { sub: String(user._id), role: user.role, email: user.email });
    return res.json({ success: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// Legacy endpoint retained for existing admin.html login code.
router.post('/admin/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');

  if (!email || !password || !configuredEmail || !configuredPassword) {
    return res.status(400).json({ error: 'Admin credentials are not configured' });
  }
  if (email !== configuredEmail || password !== configuredPassword) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  issueAuth(res, { role: 'admin', email: configuredEmail });
  return res.json({ success: true, admin: { email: configuredEmail } });
});

router.get('/me', async (req, res) => {
  try {
    const cookie = (req.headers.cookie || '')
      .split(';')
      .map(v => v.trim())
      .find(v => v.startsWith(COOKIE_NAME + '='));
    if (!cookie) return res.status(401).json({ error: 'Not authenticated' });

    const token = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role === 'admin') {
      return res.json({ user: { id: 'admin', name: 'Administrator', email: payload.email, role: 'admin' } });
    }

    const user = await User.findById(payload.sub).lean();
    if (!user || user.isActive === false) return res.status(401).json({ error: 'Account is not available' });
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
});

router.post('/logout', (req, res) => {
  clearAuth(res);
  res.json({ success: true });
});

module.exports = router;
