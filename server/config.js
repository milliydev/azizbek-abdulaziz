const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');

const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botEnabled: (process.env.BOT_ENABLED || 'true') !== 'false',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '',
  tgPaymentToken: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN || '',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || '',
  paymentMode: (process.env.PAYMENT_MODE || 'demo').toLowerCase(),
  stripeSecret: process.env.STRIPE_SECRET_KEY || '',
  stripePublishable: process.env.STRIPE_PUBLISHABLE_KEY || '',
  currency: (process.env.CURRENCY || 'USD').toUpperCase(),
  dataFile: path.join(ROOT, 'data', 'db.json'),
  publicDir: path.join(ROOT, 'public'),
  uploadsDir: path.join(ROOT, 'uploads'),
};

if (!config.jwtSecret) {
  config.jwtSecret = require('crypto').randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET is empty — using a random one (sessions reset on restart).');
}
if (!config.adminPassword) {
  console.warn('[config] ADMIN_PASSWORD is empty — admin login is disabled until you set it in .env');
}

module.exports = config;
