// Telegram bot: shop with cart & checkout, episode streaming, deep links from the website.
const config = require('../config');
const db = require('../db');
const tg = require('./api');
const { esc, money } = require('./notify');
const orders = require('../orders');

let botInfo = null;
let running = false;
const MAX_UPLOAD = 50 * 1024 * 1024; // Bot API upload limit

const T = {
  ru: {
    welcome: (n) => `🍥 <b>Привет, ${esc(n)}!</b>\n\nДобро пожаловать в <b>Naruto Anime &amp; Shop</b>.\n\n🛍 Магазин — одежда, аксессуары и атрибутика\n🎬 Серии — смотрите прямо здесь\n🛒 Корзина и оформление заказа\n\nВыберите раздел в меню ниже 👇`,
    menu: ['🛍 Магазин', '🎬 Серии', '🛒 Корзина', '📦 Мои заказы', '🌐 Язык: RU'],
    cats: '🛍 <b>Каталог</b>\nВыберите категорию:',
    catNames: { clothing: '👕 Одежда', accessories: '🎒 Аксессуары', collectibles: '🏮 Атрибутика', all: '✨ Все товары' },
    empty: 'Здесь пока пусто.',
    pick: 'Выберите товар:',
    add: '🛒 В корзину', buy: '⚡ Купить сейчас', back: '⬅️ Назад', site: '🌐 На сайте',
    added: '✅ Добавлено в корзину', price: 'Цена', stock: 'В наличии',
    cart: '🛒 <b>Ваша корзина</b>', cartEmpty: '🛒 Корзина пуста. Загляните в магазин!',
    total: 'Итого', shipping: 'Доставка', free: 'бесплатно', checkout: '✅ Оформить заказ', clear: '🗑 Очистить', cleared: 'Корзина очищена',
    askName: '👤 Как вас зовут? Напишите имя и фамилию.',
    askPhone: '📞 Отправьте номер телефона кнопкой ниже или напишите его.',
    sharePhone: '📱 Отправить номер', badPhone: 'Не похоже на номер телефона. Попробуйте ещё раз, например +998901234567',
    askAddress: '📍 Отправьте геолокацию кнопкой ниже или напишите адрес доставки (город, улица, дом).',
    shareLoc: '📍 Отправить геолокацию', locSaved: '📍 Геолокация получена.',
    askAddrAfterLoc: 'Добавьте уточнение к адресу (подъезд, квартира) или нажмите «Пропустить».', skip: 'Пропустить',
    confirm: '🧾 <b>Проверьте заказ</b>', payCard: '💳 Оплатить картой', payCod: '💵 Оплата при получении', cancel: '✖️ Отмена',
    cancelled: 'Оформление отменено.', invoiceTitle: 'Заказ Naruto Shop', invoiceDesc: 'Оплата заказа в Naruto Anime & Shop',
    done: (c) => `🎉 <b>Спасибо! Заказ ${esc(c)} оформлен.</b>\nМы свяжемся с вами для подтверждения доставки.`,
    eps: '🎬 <b>Серии</b>\nВыберите серию:', ep: 'Серия', sending: '⏳ Отправляю серию…',
    tooBig: 'Файл слишком большой для Telegram — смотрите эту серию на сайте:', watchSite: '▶️ Смотреть на сайте',
    noVideo: 'Видео для этой серии ещё не загружено.', next: 'Далее ➡️', prev: '⬅️ Назад',
    myOrders: '📦 <b>Ваши заказы</b>', noOrders: 'У вас пока нет заказов.',
    status: { pending: 'ожидает оплаты', paid: 'оплачен', processing: 'собирается', shipped: 'отправлен', delivered: 'доставлен', cancelled: 'отменён' },
    lang: 'Язык переключён на русский 🇷🇺', unknown: 'Не понял 🤔 Воспользуйтесь меню ниже.',
    notFound: 'Не найдено.', outOfStock: 'Нет в наличии',
  },
  en: {
    welcome: (n) => `🍥 <b>Hi, ${esc(n)}!</b>\n\nWelcome to <b>Naruto Anime &amp; Shop</b>.\n\n🛍 Shop — clothing, accessories and collectibles\n🎬 Episodes — watch right here\n🛒 Cart and checkout\n\nPick a section below 👇`,
    menu: ['🛍 Shop', '🎬 Episodes', '🛒 Cart', '📦 My orders', '🌐 Language: EN'],
    cats: '🛍 <b>Catalog</b>\nChoose a category:',
    catNames: { clothing: '👕 Clothing', accessories: '🎒 Accessories', collectibles: '🏮 Collectibles', all: '✨ All products' },
    empty: 'Nothing here yet.',
    pick: 'Choose a product:',
    add: '🛒 Add to cart', buy: '⚡ Buy now', back: '⬅️ Back', site: '🌐 On website',
    added: '✅ Added to cart', price: 'Price', stock: 'In stock',
    cart: '🛒 <b>Your cart</b>', cartEmpty: '🛒 Your cart is empty. Visit the shop!',
    total: 'Total', shipping: 'Delivery', free: 'free', checkout: '✅ Checkout', clear: '🗑 Clear', cleared: 'Cart cleared',
    askName: '👤 What is your full name?',
    askPhone: '📞 Share your phone number with the button below or type it.',
    sharePhone: '📱 Share phone', badPhone: "That doesn't look like a phone number. Try again, e.g. +998901234567",
    askAddress: '📍 Share your location with the button below or type your delivery address.',
    shareLoc: '📍 Share location', locSaved: '📍 Location received.',
    askAddrAfterLoc: 'Add address details (entrance, apartment) or tap "Skip".', skip: 'Skip',
    confirm: '🧾 <b>Review your order</b>', payCard: '💳 Pay by card', payCod: '💵 Cash on delivery', cancel: '✖️ Cancel',
    cancelled: 'Checkout cancelled.', invoiceTitle: 'Naruto Shop order', invoiceDesc: 'Payment for your Naruto Anime & Shop order',
    done: (c) => `🎉 <b>Thank you! Order ${esc(c)} is placed.</b>\nWe will contact you to confirm delivery.`,
    eps: '🎬 <b>Episodes</b>\nChoose an episode:', ep: 'Episode', sending: '⏳ Sending the episode…',
    tooBig: 'This file is too large for Telegram — watch the episode on the website:', watchSite: '▶️ Watch on website',
    noVideo: 'No video uploaded for this episode yet.', next: 'Next ➡️', prev: '⬅️ Back',
    myOrders: '📦 <b>Your orders</b>', noOrders: 'You have no orders yet.',
    status: { pending: 'awaiting payment', paid: 'paid', processing: 'being prepared', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' },
    lang: 'Language switched to English 🇬🇧', unknown: "Didn't get that 🤔 Use the menu below.",
    notFound: 'Not found.', outOfStock: 'Out of stock',
  },
};

const L = (u) => T[u.lang] || T.ru;
const nm = (obj, u) => (obj && (obj[u.lang] || obj.ru || obj.en)) || '';
const siteOk = () => !/\/\/(localhost|127\.|0\.0\.0\.0)/.test(config.publicUrl);
const siteBtn = (text, hash) => (siteOk() ? [{ text, url: `${config.publicUrl}/#/${hash}` }] : null);

const send = (chat, text, extra = {}) => tg.call('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const mainKb = (u) => {
  const m = L(u).menu;
  return { keyboard: [[{ text: m[0] }, { text: m[1] }], [{ text: m[2] }, { text: m[3] }], [{ text: m[4] }]], resize_keyboard: true, is_persistent: true };
};
const allMenus = (i) => [T.ru.menu[i], T.en.menu[i]];

// ---------- Shop ----------
async function showCategories(chat, u) {
  const t = L(u);
  const rows = ['clothing', 'accessories', 'collectibles', 'all'].map((c) => [{ text: t.catNames[c], callback_data: `cat:${c}` }]);
  await send(chat, t.cats, { reply_markup: { inline_keyboard: rows } });
}

async function showCategory(chat, u, cat) {
  const t = L(u);
  const list = db.all('products').filter((p) => cat === 'all' || p.category === cat);
  if (!list.length) return send(chat, t.empty);
  const rows = list.map((p) => [{ text: `${nm(p.name, u)} — ${money(p.price)}`, callback_data: `p:${p.id}` }]);
  rows.push([{ text: t.back, callback_data: 'shop' }]);
  await send(chat, `${t.catNames[cat] || ''}\n${t.pick}`, { reply_markup: { inline_keyboard: rows } });
}

async function showProduct(chat, u, id) {
  const t = L(u);
  const p = db.find('products', id);
  if (!p) return send(chat, t.notFound);
  const caption = [
    `<b>${esc(nm(p.name, u))}</b>`,
    '',
    esc(nm(p.description, u)),
    '',
    `💰 <b>${t.price}:</b> ${money(p.price)}`,
    p.stock > 0 ? `📦 ${t.stock}: ${p.stock}` : `❌ ${t.outOfStock}`,
  ].join('\n');
  const kb = [];
  if (p.stock > 0) kb.push([{ text: t.add, callback_data: `add:${p.id}` }, { text: t.buy, callback_data: `buy:${p.id}` }]);
  const sb = siteBtn(t.site, `product/${p.id}`);
  kb.push([{ text: t.back, callback_data: `cat:${p.category}` }, ...(sb || [])]);
  try {
    await tg.sendFile('sendPhoto', 'photo', p.image, { chat_id: chat, caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
  } catch (e) {
    console.error('[bot] photo:', e.message);
    await send(chat, caption, { reply_markup: { inline_keyboard: kb } });
  }
}

function cartLines(u) {
  const lines = [];
  let total = 0;
  for (const c of u.cart) {
    const p = db.find('products', c.id);
    if (!p) continue;
    total += p.price * c.qty;
    lines.push({ p, qty: c.qty });
  }
  const subtotal = Math.round(total * 100) / 100;
  const shipping = orders.shippingFor(subtotal);
  return { lines, subtotal, shipping, total: Math.round((subtotal + shipping) * 100) / 100 };
}

async function showCart(chat, u) {
  const t = L(u);
  u.cart = u.cart.filter((c) => db.find('products', c.id));
  const { lines, total, shipping } = cartLines(u);
  if (!lines.length) return send(chat, t.cartEmpty, { reply_markup: { inline_keyboard: [[{ text: L(u).menu[0], callback_data: 'shop' }]] } });
  const text = [t.cart, '', ...lines.map(({ p, qty }, i) => `${i + 1}. ${esc(nm(p.name, u))} × ${qty} — ${money(p.price * qty)}`), '', `🚚 ${t.shipping}: ${shipping ? money(shipping) : t.free}`, `💰 <b>${t.total}: ${money(total)}</b>`].join('\n');
  const kb = lines.map(({ p, qty }) => [
    { text: '➖', callback_data: `dec:${p.id}` },
    { text: `${nm(p.name, u).slice(0, 18)} (${qty})`, callback_data: `p:${p.id}` },
    { text: '➕', callback_data: `inc:${p.id}` },
  ]);
  kb.push([{ text: t.checkout, callback_data: 'checkout' }], [{ text: t.clear, callback_data: 'clear' }]);
  await send(chat, text, { reply_markup: { inline_keyboard: kb } });
}

function addToCart(u, id, delta = 1) {
  const item = u.cart.find((c) => c.id === id);
  if (item) item.qty = Math.max(0, Math.min(20, item.qty + delta));
  else if (delta > 0) u.cart.push({ id, qty: delta });
  u.cart = u.cart.filter((c) => c.qty > 0);
  db.save();
}

// ---------- Checkout ----------
async function startCheckout(chat, u) {
  const t = L(u);
  if (!cartLines(u).lines.length) return send(chat, t.cartEmpty);
  u.state = 'name';
  u.draft = {};
  db.save();
  await send(chat, t.askName, { reply_markup: { keyboard: [[{ text: t.cancel }]], resize_keyboard: true, one_time_keyboard: true } });
}

async function askPhone(chat, u) {
  const t = L(u);
  u.state = 'phone';
  db.save();
  await send(chat, t.askPhone, { reply_markup: { keyboard: [[{ text: t.sharePhone, request_contact: true }], [{ text: t.cancel }]], resize_keyboard: true, one_time_keyboard: true } });
}

async function askAddress(chat, u) {
  const t = L(u);
  u.state = 'address';
  db.save();
  await send(chat, t.askAddress, { reply_markup: { keyboard: [[{ text: t.shareLoc, request_location: true }], [{ text: t.cancel }]], resize_keyboard: true, one_time_keyboard: true } });
}

async function showConfirm(chat, u) {
  const t = L(u);
  u.state = 'confirm';
  db.save();
  const { lines, total, shipping } = cartLines(u);
  const d = u.draft;
  const text = [
    t.confirm, '',
    ...lines.map(({ p, qty }) => `• ${esc(nm(p.name, u))} × ${qty} — ${money(p.price * qty)}`),
    '', `🚚 ${t.shipping}: ${shipping ? money(shipping) : t.free}`, `💰 <b>${t.total}: ${money(total)}</b>`, '',
    `👤 ${esc(d.name)}`, `📞 ${esc(d.phone)}`,
    d.address ? `📍 ${esc(d.address)}` : null,
    d.location ? `🗺 ${d.location.lat.toFixed(5)}, ${d.location.lng.toFixed(5)}` : null,
  ].filter((x) => x !== null).join('\n');
  const kb = [];
  if (config.tgPaymentToken) kb.push([{ text: t.payCard, callback_data: 'pay:card' }]);
  kb.push([{ text: t.payCod, callback_data: 'pay:cod' }], [{ text: t.cancel, callback_data: 'cancel' }]);
  await send(chat, '✅', { reply_markup: mainKb(u) });
  await send(chat, text, { reply_markup: { inline_keyboard: kb } });
}

async function finalize(chat, u, from, payment) {
  const t = L(u);
  const priced = orders.priceItems(u.cart);
  const customer = orders.normalizeCustomer({
    name: u.draft.name, phone: u.draft.phone, address: u.draft.address, location: u.draft.location,
  });
  const order = await orders.createOrder({
    customer, items: priced.items, total: priced.total, shipping: priced.shipping, payment, source: 'telegram', tgUserId: from.id, lang: u.lang,
  });
  u.cart = [];
  u.state = null;
  u.draft = {};
  db.save();
  await send(chat, t.done(order.code), { reply_markup: mainKb(u) });
}

async function sendInvoice(chat, u) {
  const t = L(u);
  const { lines, total, shipping } = cartLines(u);
  const payload = `o:${chat}:${Date.now()}`;
  u.draft.payload = payload;
  u.draft.expected = Math.round(total * 100);
  db.save();
  await tg.call('sendInvoice', {
    chat_id: chat, title: t.invoiceTitle, description: t.invoiceDesc, payload,
    provider_token: config.tgPaymentToken, currency: config.currency,
    prices: [
      ...lines.map(({ p, qty }) => ({ label: `${nm(p.name, u)} × ${qty}`.slice(0, 32), amount: Math.round(p.price * qty * 100) })),
      ...(shipping ? [{ label: t.shipping, amount: Math.round(shipping * 100) }] : []),
    ],
  });
}

// ---------- Episodes ----------
async function showEpisodes(chat, u, page = 0) {
  const t = L(u);
  const eps = [...db.all('episodes')].sort((a, b) => (a.season - b.season) || (a.number - b.number));
  if (!eps.length) return send(chat, t.empty);
  const per = 8;
  const slice = eps.slice(page * per, page * per + per);
  const rows = slice.map((e) => [{ text: `▶️ S${e.season}E${String(e.number).padStart(2, '0')} · ${nm(e.title, u)}`, callback_data: `ep:${e.id}` }]);
  const nav = [];
  if (page > 0) nav.push({ text: t.prev, callback_data: `eps:${page - 1}` });
  if ((page + 1) * per < eps.length) nav.push({ text: t.next, callback_data: `eps:${page + 1}` });
  if (nav.length) rows.push(nav);
  await send(chat, t.eps, { reply_markup: { inline_keyboard: rows } });
}

async function sendEpisode(chat, u, id) {
  const t = L(u);
  const e = db.find('episodes', id);
  if (!e) return send(chat, t.notFound);
  const caption = `🎬 <b>${t.ep} ${e.number}: ${esc(nm(e.title, u))}</b>\n\n${esc(nm(e.description, u))}`;
  const sb = siteBtn(t.watchSite, `watch/${e.id}`);
  const markup = sb ? { inline_keyboard: [sb] } : undefined;
  if (!e.videoUrl && !e.tgFileId) return send(chat, `${caption}\n\n${t.noVideo}`, { reply_markup: markup });

  const isFileLike = e.tgFileId || tg.localFile(e.videoUrl) || /\.(mp4|m4v|mov|webm)(\?|$)/i.test(e.videoUrl);
  const size = tg.fileSize(e.videoUrl);
  if (!isFileLike || (size && size > MAX_UPLOAD && !e.tgFileId)) {
    return send(chat, `${caption}\n\n${t.tooBig}`, { reply_markup: sb ? { inline_keyboard: [sb] } : undefined }).then(() => {
      if (!sb && /^https?:/i.test(e.videoUrl)) return send(chat, e.videoUrl);
    });
  }
  await tg.call('sendChatAction', { chat_id: chat, action: 'upload_video' }).catch(() => {});
  try {
    const res = await tg.sendFile('sendVideo', 'video', e.tgFileId || e.videoUrl, {
      chat_id: chat, caption, parse_mode: 'HTML', supports_streaming: true, reply_markup: markup,
    });
    const fid = res && (res.video ? res.video.file_id : res.document && res.document.file_id);
    if (fid && !e.tgFileId) db.update('episodes', e.id, { tgFileId: fid }); // reuse instantly next time
  } catch (err) {
    console.error('[bot] video:', err.message);
    if (e.tgFileId) db.update('episodes', e.id, { tgFileId: null });
    await send(chat, `${caption}\n\n${t.tooBig}`, { reply_markup: markup });
    if (!sb && /^https?:/i.test(e.videoUrl)) await send(chat, e.videoUrl);
  }
}

async function showOrders(chat, u, from) {
  const t = L(u);
  const list = db.all('orders').filter((o) => String(o.tgUserId) === String(from.id)).slice(-10).reverse();
  if (!list.length) return send(chat, t.noOrders);
  const text = [t.myOrders, '', ...list.map((o) => `• <b>${esc(o.code)}</b> — ${money(o.total)} — ${t.status[o.status] || o.status}`)].join('\n');
  await send(chat, text);
}

// ---------- Update handlers ----------
async function onMessage(m) {
  const chat = m.chat.id;
  if (m.chat.type !== 'private') return;
  const u = db.tgUser(m.from.id);
  if (!u.lang && m.from.language_code) u.lang = m.from.language_code.startsWith('ru') ? 'ru' : 'en';
  const t = L(u);
  const text = (m.text || '').trim();

  if (m.successful_payment) {
    const sp = m.successful_payment;
    return finalize(chat, u, m.from, {
      method: 'telegram_card', status: 'paid', ref: sp.telegram_payment_charge_id, provider_ref: sp.provider_payment_charge_id,
    });
  }

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    u.state = null;
    db.save();
    if (payload.startsWith('ep_')) return sendEpisode(chat, u, payload.slice(3));
    if (payload.startsWith('prod_')) return showProduct(chat, u, payload.slice(5));
    return send(chat, t.welcome(m.from.first_name || ''), { reply_markup: mainKb(u) });
  }

  // Cancel at any step
  if (text === T.ru.cancel || text === T.en.cancel || text === '/cancel') {
    u.state = null; u.draft = {}; db.save();
    return send(chat, t.cancelled, { reply_markup: mainKb(u) });
  }

  // Checkout steps
  if (u.state === 'name' && text) {
    u.draft.name = text.slice(0, 120);
    return askPhone(chat, u);
  }
  if (u.state === 'phone') {
    const phone = m.contact ? m.contact.phone_number : text;
    if (!/^[+\d][\d\s()-]{5,}$/.test(phone || '')) return send(chat, t.badPhone);
    u.draft.phone = phone.startsWith('+') || !m.contact ? phone : `+${phone}`;
    return askAddress(chat, u);
  }
  if (u.state === 'address') {
    if (m.location) {
      u.draft.location = { lat: m.location.latitude, lng: m.location.longitude };
      u.state = 'address_extra';
      db.save();
      return send(chat, `${t.locSaved}\n${t.askAddrAfterLoc}`, { reply_markup: { keyboard: [[{ text: t.skip }], [{ text: t.cancel }]], resize_keyboard: true, one_time_keyboard: true } });
    }
    if (text) { u.draft.address = text.slice(0, 400); return showConfirm(chat, u); }
  }
  if (u.state === 'address_extra') {
    if (text && text !== T.ru.skip && text !== T.en.skip) u.draft.address = text.slice(0, 400);
    return showConfirm(chat, u);
  }

  // Menu
  if (allMenus(0).includes(text) || text === '/shop') return showCategories(chat, u);
  if (allMenus(1).includes(text) || text === '/episodes') return showEpisodes(chat, u);
  if (allMenus(2).includes(text) || text === '/cart') return showCart(chat, u);
  if (allMenus(3).includes(text) || text === '/orders') return showOrders(chat, u, m.from);
  if (allMenus(4).includes(text) || text === '/lang') {
    return send(chat, '🌐', { reply_markup: { inline_keyboard: [[{ text: '🇷🇺 Русский', callback_data: 'lang:ru' }, { text: '🇬🇧 English', callback_data: 'lang:en' }]] } });
  }
  if (text === '/help') return send(chat, t.welcome(m.from.first_name || ''), { reply_markup: mainKb(u) });
  return send(chat, t.unknown, { reply_markup: mainKb(u) });
}

async function onCallback(q) {
  const chat = q.message ? q.message.chat.id : q.from.id;
  const u = db.tgUser(q.from.id);
  const t = L(u);
  const [cmd, arg] = String(q.data || '').split(':');
  let toast;
  switch (cmd) {
    case 'shop': await showCategories(chat, u); break;
    case 'cat': await showCategory(chat, u, arg); break;
    case 'p': await showProduct(chat, u, arg); break;
    case 'add': addToCart(u, arg); toast = t.added; break;
    case 'inc': addToCart(u, arg, 1); await showCart(chat, u); break;
    case 'dec': addToCart(u, arg, -1); await showCart(chat, u); break;
    case 'buy': u.cart = [{ id: arg, qty: 1 }]; await startCheckout(chat, u); break;
    case 'cart': await showCart(chat, u); break;
    case 'clear': u.cart = []; db.save(); toast = t.cleared; break;
    case 'checkout': await startCheckout(chat, u); break;
    case 'eps': await showEpisodes(chat, u, Number(arg) || 0); break;
    case 'ep': toast = t.sending; await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: toast }).catch(() => {}); await sendEpisode(chat, u, arg); return;
    case 'cancel': u.state = null; u.draft = {}; db.save(); await send(chat, t.cancelled, { reply_markup: mainKb(u) }); break;
    case 'pay':
      if (u.state !== 'confirm') break;
      if (arg === 'card' && config.tgPaymentToken) await sendInvoice(chat, u);
      else if (arg === 'cod') await finalize(chat, u, q.from, { method: 'cash_on_delivery', status: 'pending' });
      break;
    case 'lang':
      u.lang = arg === 'en' ? 'en' : 'ru'; db.save();
      await send(chat, L(u).lang, { reply_markup: mainKb(u) });
      break;
    default: break;
  }
  await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: toast }).catch(() => {});
}

async function onPreCheckout(q) {
  const u = db.tgUser(q.from.id);
  const ok = u.draft && u.draft.payload === q.invoice_payload && u.draft.expected === q.total_amount;
  await tg.call('answerPreCheckoutQuery', ok
    ? { pre_checkout_query_id: q.id, ok: true }
    : { pre_checkout_query_id: q.id, ok: false, error_message: 'Cart changed, please checkout again.' });
}

async function handle(update) {
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
    else if (update.pre_checkout_query) await onPreCheckout(update.pre_checkout_query);
  } catch (e) {
    console.error('[bot] handler error:', e.message);
    const chat = (update.message && update.message.chat.id) || (update.callback_query && update.callback_query.from.id);
    if (chat) send(chat, '⚠️ Error / Ошибка. /start').catch(() => {});
  }
}

async function poll() {
  let offset = 0;
  while (running) {
    try {
      const updates = await tg.call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
      for (const up of updates) {
        offset = up.update_id + 1;
        handle(up);
      }
    } catch (e) {
      console.error('[bot] polling:', e.message);
      await new Promise((r) => setTimeout(r, e.code === 409 ? 10000 : 3000));
    }
  }
}

async function start() {
  if (!config.botEnabled || !config.botToken) {
    console.log('[bot] disabled (no TELEGRAM_BOT_TOKEN or BOT_ENABLED=false)');
    return;
  }
  try {
    botInfo = await tg.call('getMe');
    await tg.call('deleteWebhook', { drop_pending_updates: false });
    await tg.call('setMyCommands', { commands: [
      { command: 'start', description: 'Menu / Меню' },
      { command: 'shop', description: 'Shop / Магазин' },
      { command: 'episodes', description: 'Episodes / Серии' },
      { command: 'cart', description: 'Cart / Корзина' },
      { command: 'orders', description: 'My orders / Мои заказы' },
      { command: 'lang', description: 'Language / Язык' },
    ] }).catch(() => {});
    console.log(`[bot] @${botInfo.username} is running (long polling)`);
    running = true;
    poll();
  } catch (e) {
    console.error('[bot] failed to start:', e.message);
  }
}

module.exports = { _handle: handle, start, stop: () => { running = false; }, username: () => (botInfo ? botInfo.username : null) };
