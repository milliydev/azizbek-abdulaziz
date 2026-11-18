/* Serverless mode: the same API the Node server provides, kept in this browser's localStorage.
   Used automatically when the site is opened without the server (file://, Live Server, static hosting).
   Data lives only in this browser: accounts and orders are not shared between devices. */
(() => {
  'use strict';

  const KEY = 'naruto_local_db_v1';
  const SESSION = 'naruto_local_session';
  const SHIPPING = { fee: 7, freeFrom: 80 };

  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  function load() {
    let db = read(KEY, null);
    if (!db) {
      const seed = JSON.parse(JSON.stringify(window.SEED_DATA || { products: [], episodes: [], news: [] }));
      db = { ...seed, users: [], orders: [], messages: [], counter: 1000 };
      write(KEY, db);
    }
    return db;
  }
  const save = (db) => write(KEY, db);

  const rid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
  const clean = (s, max = 300) => String(s == null ? '' : s).trim().slice(0, max);
  const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };

  // ---- Password hashing (SHA-256 + per-user salt) ----
  function sha256Fallback(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [];
    const H = [];
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    for (let n = 2, c = 0; c < 64; n++) {
      let prime = true;
      for (let i = 2; i * i <= n; i++) if (n % i === 0) { prime = false; break; }
      if (prime) { if (c < 8) H[c] = frac(Math.sqrt(n)); K[c++] = frac(Math.cbrt(n)); }
    }
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, len * 8);
    view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    const W = new Uint32Array(64);
    for (let o = 0; o < padded.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
    }
    return H.map((v) => v.toString(16).padStart(8, '0')).join('');
  }
  async function hash(password, salt) {
    const input = `${salt}:${password}`;
    if (window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch { /* not a secure context */ }
    }
    return sha256Fallback(input);
  }

  // ---- Helpers mirroring server/orders.js ----
  const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone || '', address: u.address || '' });
  const currentUser = (db) => { const id = read(SESSION, null); return id ? db.users.find((u) => u.id === id) || null : null; };

  function priceItems(db, raw) {
    if (!Array.isArray(raw) || !raw.length) fail('cart_empty');
    const items = raw.slice(0, 50).map((r) => {
      const p = db.products.find((x) => x.id === String(r.id || r.productId));
      if (!p) fail('product_not_found');
      const qty = Math.max(1, Math.min(20, parseInt(r.qty, 10) || 1));
      return { productId: p.id, name: p.name, price: p.price, qty, image: p.image, size: clean(r.size, 10) || undefined };
    });
    const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    const shipping = subtotal >= SHIPPING.freeFrom || subtotal === 0 ? 0 : SHIPPING.fee;
    return { items, shipping, total: Math.round((subtotal + shipping) * 100) / 100 };
  }

  function normalizeCustomer(c = {}) {
    const customer = {
      name: clean(c.name, 120), phone: clean(c.phone, 40), email: clean(c.email, 160),
      address: clean(c.address, 400), city: clean(c.city, 120), comment: clean(c.comment, 500), location: null,
    };
    const lat = Number(c.location && c.location.lat);
    const lng = Number(c.location && c.location.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) customer.location = { lat, lng };
    if (!customer.name) fail('name_required');
    if (!/^[+\d][\d\s()-]{5,}$/.test(customer.phone)) fail('phone_required');
    if (!customer.address && !customer.location) fail('address_required');
    return customer;
  }

  const publicOrder = (o) => ({
    id: o.id, code: o.code, status: o.status, total: o.total, shipping: o.shipping || 0, items: o.items,
    createdAt: o.createdAt, history: o.history, source: o.source,
    payment: { method: o.payment.method, status: o.payment.status, brand: o.payment.brand, last4: o.payment.last4 },
    customer: { name: o.customer.name, city: o.customer.city, address: o.customer.address },
  });

  const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

  // ---- Router ----
  async function handle(fullPath, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const [path, qs] = fullPath.split('?');
    const query = new URLSearchParams(qs || '');
    const body = opts.body || {};
    const db = load();

    if (method === 'GET' && path === '/config') return { botUsername: null, currency: 'USD', shipping: SHIPPING, paymentMode: 'demo', stripePublishableKey: null, local: true };
    if (method === 'GET' && path === '/products') return db.products;
    if (method === 'GET' && path === '/episodes') return [...db.episodes].sort((a, b) => (a.season - b.season) || (a.number - b.number));
    if (method === 'GET' && path === '/news') return [...db.news].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (method === 'POST' && path === '/auth/register') {
      const email = String(body.email || '').toLowerCase().trim();
      const password = String(body.password || '');
      const name = clean(body.name, 120);
      if (!name) fail('name_required');
      if (!validEmail(email)) fail('invalid_email');
      if (password.length < 6) fail('password_short');
      if (db.users.some((u) => u.email === email)) fail('email_taken', 409);
      const salt = rid();
      const user = { id: rid(), email, name, salt, passwordHash: await hash(password, salt), createdAt: new Date().toISOString() };
      db.users.push(user); save(db); write(SESSION, user.id);
      return userOut(user);
    }
    if (method === 'POST' && path === '/auth/login') {
      const email = String(body.email || '').toLowerCase().trim();
      const user = db.users.find((u) => u.email === email);
      if (!user || (await hash(String(body.password || ''), user.salt)) !== user.passwordHash) fail('invalid_credentials', 401);
      write(SESSION, user.id);
      return userOut(user);
    }
    if (method === 'POST' && path === '/auth/logout') { try { localStorage.removeItem(SESSION); } catch { /* ignore */ } return { ok: true }; }

    if (path === '/me' || path === '/me/orders') {
      const u = currentUser(db);
      if (!u) fail('unauthorized', 401);
      if (path === '/me/orders') return db.orders.filter((o) => o.userId === u.id).reverse().map(publicOrder);
      if (method === 'PUT') {
        Object.assign(u, { name: clean(body.name, 120) || u.name, phone: clean(body.phone, 40), address: clean(body.address, 400) });
        save(db);
      }
      return userOut(u);
    }

    if (method === 'POST' && path === '/orders') {
      const { items, total, shipping } = priceItems(db, body.items);
      const customer = normalizeCustomer(body.customer);
      const p = body.payment || {};
      if (!/^\d{4}$/.test(String(p.last4 || ''))) fail('invalid_card');
      if (!p.cardholder || String(p.cardholder).trim().length < 2) fail('invalid_card');
      const u = currentUser(db);
      db.counter += 1;
      const at = new Date().toISOString();
      const order = {
        id: rid(), code: `NRT-${db.counter}`, source: 'web', customer, items, shipping, total,
        payment: { method: 'card_demo', status: 'paid', brand: clean(p.brand, 20) || 'card', last4: String(p.last4) },
        status: 'paid', history: [{ status: 'paid', at }], userId: u ? u.id : null, lang: body.lang || 'uz', createdAt: at,
      };
      items.forEach((it) => { const pr = db.products.find((x) => x.id === it.productId); if (pr && typeof pr.stock === 'number') pr.stock = Math.max(0, pr.stock - it.qty); });
      db.orders.push(order); save(db);
      return { ok: true, order: publicOrder(order) };
    }
    if (method === 'GET' && path === '/orders/track') {
      const code = String(query.get('code') || '').trim().toUpperCase();
      const phone = String(query.get('phone') || '').replace(/\D/g, '');
      const o = db.orders.find((x) => x.code === code);
      if (!o || !phone || o.customer.phone.replace(/\D/g, '').slice(-7) !== phone.slice(-7)) fail('not_found', 404);
      return publicOrder(o);
    }
    if (method === 'POST' && path === '/support') {
      const msg = { name: clean(body.name, 120), email: clean(body.email, 160), order: clean(body.order, 30), message: clean(body.message, 2000) };
      if (!msg.name || !msg.message || !validEmail(msg.email)) fail('invalid');
      db.messages.push({ id: rid(), createdAt: new Date().toISOString(), ...msg }); save(db);
      return { ok: true };
    }
    if (path === '/payments/intent') fail('stripe_required');
    fail('not_found', 404);
  }

  window.LocalAPI = { handle };
})();
