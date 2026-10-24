// Shared order logic for the website and the Telegram bot.
const db = require('./db');
const notify = require('./telegram/notify');

const clean = (s, max = 300) => String(s == null ? '' : s).trim().slice(0, max);

// Rebuild line items from the database so clients can never set their own prices.
function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('cart_empty');
  const items = [];
  for (const r of rawItems.slice(0, 50)) {
    const product = db.find('products', String(r.id || r.productId));
    if (!product) throw new Error('product_not_found');
    const qty = Math.max(1, Math.min(20, parseInt(r.qty, 10) || 1));
    items.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty,
      image: product.image,
      size: clean(r.size, 10) || undefined,
    });
  }
  const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const shipping = shippingFor(subtotal);
  return { items, subtotal, shipping, total: Math.round((subtotal + shipping) * 100) / 100 };
}

const SHIPPING = { fee: 7, freeFrom: 80 };
const shippingFor = (subtotal) => (subtotal >= SHIPPING.freeFrom || subtotal === 0 ? 0 : SHIPPING.fee);

function normalizeCustomer(c = {}) {
  const customer = {
    name: clean(c.name, 120),
    phone: clean(c.phone, 40),
    email: clean(c.email, 160),
    address: clean(c.address, 400),
    city: clean(c.city, 120),
    comment: clean(c.comment, 500),
    location: null,
  };
  const lat = Number(c.location && c.location.lat);
  const lng = Number(c.location && c.location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    customer.location = { lat, lng };
  }
  if (!customer.name) throw new Error('name_required');
  if (!/^[+\d][\d\s()-]{5,}$/.test(customer.phone)) throw new Error('phone_required');
  if (!customer.address && !customer.location) throw new Error('address_required');
  return customer;
}

async function createOrder({ customer, items, total, shipping = 0, payment, source, userId = null, tgUserId = null, lang = 'ru' }) {
  const order = db.insert('orders', {
    code: db.nextOrderCode(),
    source,
    customer,
    items,
    shipping,
    total,
    payment,
    status: payment.status === 'paid' ? 'paid' : 'pending',
    history: [{ status: payment.status === 'paid' ? 'paid' : 'pending', at: new Date().toISOString() }],
    userId,
    tgUserId,
    lang,
  });
  for (const it of items) {
    const p = db.find('products', it.productId);
    if (p && typeof p.stock === 'number') p.stock = Math.max(0, p.stock - it.qty);
  }
  db.save();
  notify.orderToAdmin(order).catch((e) => console.error('[notify] order', e.message));
  return order;
}

function publicOrder(o) {
  return {
    id: o.id, code: o.code, status: o.status, total: o.total, shipping: o.shipping || 0, items: o.items,
    createdAt: o.createdAt, history: o.history, source: o.source,
    payment: { method: o.payment.method, status: o.payment.status, brand: o.payment.brand, last4: o.payment.last4 },
    customer: { name: o.customer.name, city: o.customer.city, address: o.customer.address },
  };
}

module.exports = { SHIPPING, shippingFor, priceItems, normalizeCustomer, createOrder, publicOrder, clean };
