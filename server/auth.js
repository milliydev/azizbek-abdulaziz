const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('./config');

const COOKIE = { httpOnly: true, sameSite: 'lax', secure: config.publicUrl.startsWith('https'), maxAge: 7 * 24 * 3600 * 1000 };

const sign = (payload, ttl = '7d') => jwt.sign(payload, config.jwtSecret, { expiresIn: ttl });
const verify = (token) => { try { return jwt.verify(token, config.jwtSecret); } catch { return null; } };

// Constant-time comparison of the configured admin password
function checkAdminCredentials(email, password) {
  if (!config.adminPassword) return false;
  const e = String(email || '').toLowerCase().trim();
  if (e !== config.adminEmail) return false;
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const t = verify(req.cookies.admin_token);
  if (!t || t.role !== 'admin' || t.email !== config.adminEmail) return res.status(401).json({ error: 'unauthorized' });
  req.admin = t;
  next();
}

function optionalUser(req, _res, next) {
  const t = verify(req.cookies.user_token);
  if (t && t.role === 'user') req.user = t;
  next();
}

function requireUser(req, res, next) {
  optionalUser(req, res, () => (req.user ? next() : res.status(401).json({ error: 'unauthorized' })));
}

module.exports = { COOKIE, sign, verify, bcrypt, checkAdminCredentials, requireAdmin, requireUser, optionalUser };
