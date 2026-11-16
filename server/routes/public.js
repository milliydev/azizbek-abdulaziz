const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const orders = require('../orders');
const payments = require('../payments');
const bot = require('../telegram/bot');
const notify = require('../telegram/notify');
const { sign, bcrypt, COOKIE, optionalUser, requireUser } = require('../auth');

const r = express.Router();
const limiter = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });
const fail = (res, e, code = 400) => res.status(code).json({ error: e.message || String(e) });

r.get('/config', (_req, res) => {
  res.json({
    botUsername: bot.username(),
    currency: config.currency,
    shipping: orders.SHIPPING,
    paymentMode: config.paymentMode === 'stripe' && payments.getStripe() ? 'stripe' : 'demo',
    stripePublishableKey: config.paymentMode === 'stripe' ? config.stripePublishable : null,
  });
});

// ----- Catalog -----
r.get('/products', (req, res) => {
  const { category, q } = req.query;
  let list = db.all('products');
  if (category && category !== 'all') list = list.filter((p) => p.category === category);
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter((p) => `${p.name.en} ${p.name.ru}`.toLowerCase().includes(s));
  }
  res.json(list);
});
r.get('/products/:id', (req, res) => {
  const p = db.find('products', req.params.id);
  return p ? res.json(p) : res.status(404).json({ error: 'not_found' });
});

r.get('/episodes', (_req, res) => {
  res.json([...db.all('episodes')].sort((a, b) => (a.season - b.season) || (a.number - b.number)).map(({ tgFileId, ...e }) => e));
});
r.get('/episodes/:id', (req, res) => {
  const e = db.find('episodes', req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found' });
  const { tgFileId, ...rest } = e;
  res.json(rest);
});

r.get('/news', (_req, res) => {
  res.json([...db.all('news')].sort((a, b) => new Date(b.date) - new Date(a.date)));
});

// ----- Payments & orders -----
r.post('/payments/intent', limiter(60), async (req, res) => {
  try {
    const { total } = orders.priceItems(req.body.items);
    res.json(await payments.createIntent(total));
  } catch (e) { fail(res, e); }
});

r.post('/orders', limiter(30), optionalUser, async (req, res) => {
  try {
    const { items, total, shipping } = orders.priceItems(req.body.items);
    const customer = orders.normalizeCustomer(req.body.customer);
    const p = req.body.payment || {};
    let payment;
    if (p.mode === 'stripe') {
      const v = await payments.verifyIntent(String(p.paymentIntentId || ''), total);
      if (db.all('orders').some((o) => o.payment.ref === v.ref)) throw new Error('payment_already_used');
      payment = { method: 'stripe_card', status: 'paid', ...v };
    } else {
      if (config.paymentMode === 'stripe') throw new Error('stripe_required');
      const err = payments.validateDemoPayment(p);
      if (err) throw new Error(err);
      // Only brand + last 4 digits are stored. The full number/CVC never reach the server.
      payment = { method: 'card_demo', status: 'paid', brand: orders.clean(p.brand, 20) || 'card', last4: String(p.last4), cardholder: orders.clean(p.cardholder, 80) };
    }
    const order = await orders.createOrder({
      customer, items, total, shipping, payment, source: 'web', userId: req.user ? req.user.id : null, lang: ['en', 'ru', 'uz'].includes(req.body.lang) ? req.body.lang : 'ru',
    });
    res.json({ ok: true, order: orders.publicOrder(order) });
  } catch (e) { fail(res, e); }
});

// Track by order code + phone (no account needed)
r.get('/orders/track', limiter(60), (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  const o = db.all('orders').find((x) => x.code === code);
  if (!o || !phone || o.customer.phone.replace(/\D/g, '').slice(-7) !== phone.slice(-7)) return res.status(404).json({ error: 'not_found' });
  res.json(orders.publicOrder(o));
});

// ----- Support -----
r.post('/support', limiter(10), async (req, res) => {
  const msg = {
    name: orders.clean(req.body.name, 120), email: orders.clean(req.body.email, 160),
    order: orders.clean(req.body.order, 30), message: orders.clean(req.body.message, 2000),
  };
  if (!msg.name || !msg.message || !/^\S+@\S+\.\S+$/.test(msg.email)) return res.status(400).json({ error: 'invalid' });
  db.insert('messages', msg);
  notify.supportToAdmin(msg).catch((e) => console.error('[notify] support', e.message));
  res.json({ ok: true });
});

// ----- Customer accounts -----
const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone || '', address: u.address || '' });

r.post('/auth/register', limiter(20), async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const name = orders.clean(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < 6) return res.status(400).json({ error: 'password_short' });
  if (db.all('users').some((u) => u.email === email)) return res.status(409).json({ error: 'email_taken' });
  const user = db.insert('users', { email, name, passwordHash: await bcrypt.hash(password, 10) });
  res.cookie('user_token', sign({ role: 'user', id: user.id, email }), COOKIE).json(userOut(user));
});

r.post('/auth/login', limiter(20), async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = db.all('users').find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'invalid_credentials' });
  res.cookie('user_token', sign({ role: 'user', id: user.id, email }), COOKIE).json(userOut(user));
});

r.post('/auth/logout', (_req, res) => res.clearCookie('user_token').json({ ok: true }));

r.get('/me', requireUser, (req, res) => {
  const u = db.find('users', req.user.id);
  return u ? res.json(userOut(u)) : res.status(401).json({ error: 'unauthorized' });
});

r.put('/me', requireUser, (req, res) => {
  const u = db.update('users', req.user.id, {
    name: orders.clean(req.body.name, 120), phone: orders.clean(req.body.phone, 40), address: orders.clean(req.body.address, 400),
  });
  res.json(userOut(u));
});

r.get('/me/orders', requireUser, (req, res) => {
  res.json(db.all('orders').filter((o) => o.userId === req.user.id).reverse().map(orders.publicOrder));
});

module.exports = r;
