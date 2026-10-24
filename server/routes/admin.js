const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const notify = require('../telegram/notify');
const { sign, COOKIE, checkAdminCredentials, requireAdmin } = require('../auth');

const r = express.Router();

// ----- Uploads -----
const IMG = /^image\/(png|jpe?g|webp|gif)$/;
const VID = /^video\/(mp4|webm|quicktime|x-m4v)$/;
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const dir = path.join(config.uploadsDir, file.fieldname === 'video' ? 'videos' : 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'video') return cb(null, VID.test(file.mimetype));
    return cb(null, IMG.test(file.mimetype));
  },
}).fields([{ name: 'image', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

const fileUrl = (req, field) => {
  const f = req.files && req.files[field] && req.files[field][0];
  return f ? `/uploads/${field === 'video' ? 'videos' : 'images'}/${f.filename}` : null;
};
const removeUpload = (url) => {
  if (!url || !url.startsWith('/uploads/')) return;
  const full = path.resolve(config.uploadsDir, url.slice('/uploads/'.length));
  if (full.startsWith(path.resolve(config.uploadsDir))) fs.promises.unlink(full).catch(() => {});
};
const str = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);
const bi = (body, key, max) => ({ en: str(body[`${key}_en`], max), ru: str(body[`${key}_ru`], max) });

// ----- Auth -----
r.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const { email, password } = req.body || {};
  if (!checkAdminCredentials(email, password)) return res.status(401).json({ error: 'invalid_credentials' });
  res.cookie('admin_token', sign({ role: 'admin', email: config.adminEmail }, '12h'), { ...COOKIE, maxAge: 12 * 3600 * 1000 }).json({ ok: true, email: config.adminEmail });
});
r.post('/logout', (_req, res) => res.clearCookie('admin_token').json({ ok: true }));

r.use(requireAdmin);
r.get('/me', (req, res) => res.json({ email: req.admin.email }));

r.get('/stats', (_req, res) => {
  const o = db.all('orders');
  res.json({
    products: db.all('products').length,
    episodes: db.all('episodes').length,
    orders: o.length,
    revenue: Math.round(o.filter((x) => x.payment.status === 'paid').reduce((s, x) => s + x.total, 0) * 100) / 100,
    pending: o.filter((x) => ['pending', 'paid', 'processing'].includes(x.status)).length,
    users: db.all('users').length,
    messages: db.all('messages').length,
  });
});

// ----- Products -----
function productFrom(req, prev = {}) {
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price');
  const name = bi(req.body, 'name', 120);
  if (!name.en && !name.ru) throw new Error('name_required');
  if (!name.en) name.en = name.ru;
  if (!name.ru) name.ru = name.en;
  const image = fileUrl(req, 'image') || str(req.body.imageUrl, 500) || prev.image;
  if (!image) throw new Error('image_required');
  return {
    name, description: bi(req.body, 'description', 2000), price: Math.round(price * 100) / 100,
    category: ['clothing', 'accessories', 'collectibles'].includes(req.body.category) ? req.body.category : 'accessories',
    stock: Math.max(0, parseInt(req.body.stock, 10) || 0), popular: req.body.popular === 'true' || req.body.popular === 'on', image,
  };
}

r.get('/products', (_req, res) => res.json(db.all('products')));
r.post('/products', upload, (req, res) => {
  try { res.json(db.insert('products', productFrom(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});
r.put('/products/:id', upload, (req, res) => {
  const prev = db.find('products', req.params.id);
  if (!prev) return res.status(404).json({ error: 'not_found' });
  try {
    const data = productFrom(req, prev);
    if (data.image !== prev.image) removeUpload(prev.image);
    res.json(db.update('products', prev.id, data));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete('/products/:id', (req, res) => {
  const p = db.find('products', req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  removeUpload(p.image);
  db.remove('products', p.id);
  res.json({ ok: true });
});

// ----- Episodes -----
function episodeFrom(req, prev = {}) {
  const number = parseInt(req.body.number, 10);
  if (!Number.isFinite(number) || number < 1) throw new Error('invalid_number');
  const title = bi(req.body, 'title', 200);
  if (!title.en) title.en = title.ru || `Episode ${number}`;
  if (!title.ru) title.ru = title.en;
  const videoFile = fileUrl(req, 'video');
  const videoUrl = videoFile || str(req.body.videoUrl, 1000) || prev.videoUrl || '';
  return {
    number, season: Math.max(1, parseInt(req.body.season, 10) || 1), title,
    description: bi(req.body, 'description', 2000), duration: str(req.body.duration, 20),
    thumbnail: fileUrl(req, 'thumbnail') || str(req.body.thumbnailUrl, 500) || prev.thumbnail || '/img/hero.png',
    videoUrl, popular: req.body.popular === 'true' || req.body.popular === 'on',
    tgFileId: videoUrl === prev.videoUrl ? prev.tgFileId || null : null, // reset Telegram cache when the video changes
  };
}

r.get('/episodes', (_req, res) => res.json([...db.all('episodes')].sort((a, b) => (a.season - b.season) || (a.number - b.number))));
r.post('/episodes', upload, (req, res) => {
  try { res.json(db.insert('episodes', episodeFrom(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});
r.put('/episodes/:id', upload, (req, res) => {
  const prev = db.find('episodes', req.params.id);
  if (!prev) return res.status(404).json({ error: 'not_found' });
  try {
    const data = episodeFrom(req, prev);
    if (data.videoUrl !== prev.videoUrl) removeUpload(prev.videoUrl);
    if (data.thumbnail !== prev.thumbnail) removeUpload(prev.thumbnail);
    res.json(db.update('episodes', prev.id, data));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete('/episodes/:id', (req, res) => {
  const e = db.find('episodes', req.params.id);
  if (!e) return res.status(404).json({ error: 'not_found' });
  removeUpload(e.videoUrl); removeUpload(e.thumbnail);
  db.remove('episodes', e.id);
  res.json({ ok: true });
});

// ----- News -----
r.get('/news', (_req, res) => res.json(db.all('news')));
r.post('/news', upload, (req, res) => {
  const title = bi(req.body, 'title', 200);
  if (!title.en && !title.ru) return res.status(400).json({ error: 'title_required' });
  res.json(db.insert('news', { title, body: bi(req.body, 'body', 5000), image: fileUrl(req, 'image') || str(req.body.imageUrl, 500) || '/img/hero.png', date: new Date().toISOString() }));
});
r.put('/news/:id', upload, (req, res) => {
  const prev = db.find('news', req.params.id);
  if (!prev) return res.status(404).json({ error: 'not_found' });
  res.json(db.update('news', prev.id, { title: bi(req.body, 'title', 200), body: bi(req.body, 'body', 5000), image: fileUrl(req, 'image') || str(req.body.imageUrl, 500) || prev.image }));
});
r.delete('/news/:id', (req, res) => res.json({ ok: db.remove('news', req.params.id) }));

// ----- Orders -----
const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
r.get('/orders', (_req, res) => res.json([...db.all('orders')].reverse()));
r.patch('/orders/:id', (req, res) => {
  const o = db.find('orders', req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status' });
  o.status = status;
  o.history = [...(o.history || []), { status, at: new Date().toISOString() }];
  if (status === 'paid' && o.payment.status !== 'paid') o.payment.status = 'paid';
  db.save();
  notify.statusToCustomer(o);
  res.json(o);
});
r.delete('/orders/:id', (req, res) => res.json({ ok: db.remove('orders', req.params.id) }));

r.get('/messages', (_req, res) => res.json([...db.all('messages')].reverse()));
r.delete('/messages/:id', (req, res) => res.json({ ok: db.remove('messages', req.params.id) }));

module.exports = r;
