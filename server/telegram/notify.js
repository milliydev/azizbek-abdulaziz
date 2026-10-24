// Notifications to the single store administrator (ADMIN_TELEGRAM_ID).
const config = require('../config');
const tg = require('./api');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => `${Number(n).toFixed(2)} ${config.currency}`;
const enabled = () => Boolean(config.botEnabled && config.botToken && config.adminTelegramId);

async function orderToAdmin(order) {
  if (!enabled()) return;
  const admin = config.adminTelegramId;
  const c = order.customer;
  const pay = order.payment;
  const mapLink = c.location ? `https://maps.google.com/?q=${c.location.lat},${c.location.lng}` : null;

  const lines = [
    `🛒 <b>Новый заказ ${esc(order.code)}</b>  (${order.source === 'telegram' ? 'Telegram-бот' : 'сайт'})`,
    '',
    `👤 <b>Покупатель:</b> ${esc(c.name)}`,
    `📞 <b>Телефон:</b> ${esc(c.phone)}`,
    c.email ? `✉️ <b>Email:</b> ${esc(c.email)}` : null,
    c.city || c.address ? `📍 <b>Адрес:</b> ${esc([c.city, c.address].filter(Boolean).join(', '))}` : null,
    mapLink ? `🗺 <b>Геолокация:</b> <a href="${mapLink}">${c.location.lat.toFixed(5)}, ${c.location.lng.toFixed(5)}</a>` : null,
    c.comment ? `💬 <b>Комментарий:</b> ${esc(c.comment)}` : null,
    '',
    '<b>Товары:</b>',
    ...order.items.map((i, n) => `${n + 1}. ${esc(i.name.ru || i.name.en)}${i.size ? ` (${esc(i.size)})` : ''} × ${i.qty} — ${money(i.price * i.qty)}`),
    '',
    order.shipping ? `🚚 Доставка: ${money(order.shipping)}` : '🚚 Доставка: бесплатно',
    `💰 <b>Итого:</b> ${money(order.total)}`,
    `💳 <b>Оплата:</b> ${esc(pay.method)} — ${esc(pay.status)}${pay.last4 ? ` (${esc(pay.brand || 'card')} •••• ${esc(pay.last4)})` : ''}`,
    order.tgUserId ? `🆔 Telegram ID покупателя: <code>${esc(order.tgUserId)}</code>` : null,
  ].filter((l) => l !== null);

  await tg.call('sendMessage', { chat_id: admin, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });

  // Product photos with name and price
  for (const i of order.items) {
    const caption = `<b>${esc(i.name.ru || i.name.en)}</b>\n${esc(i.name.en)}\nЦена: ${money(i.price)} × ${i.qty}${i.size ? `\nРазмер: ${esc(i.size)}` : ''}`;
    try {
      await tg.sendFile('sendPhoto', 'photo', i.image, { chat_id: admin, caption, parse_mode: 'HTML' });
    } catch (e) {
      console.error('[notify] photo failed:', e.message);
    }
  }
  if (c.location) {
    await tg.call('sendLocation', { chat_id: admin, latitude: c.location.lat, longitude: c.location.lng }).catch(() => {});
  }
}

async function supportToAdmin(msg) {
  if (!enabled()) return;
  const text = `📩 <b>Сообщение в поддержку</b>\n\n👤 ${esc(msg.name)}\n✉️ ${esc(msg.email)}${msg.order ? `\n📦 Заказ: ${esc(msg.order)}` : ''}\n\n${esc(msg.message)}`;
  await tg.call('sendMessage', { chat_id: config.adminTelegramId, text, parse_mode: 'HTML' });
}

async function statusToCustomer(order) {
  if (!enabled() || !order.tgUserId) return;
  const ru = order.lang !== 'en';
  const names = {
    pending: ['ожидает оплаты', 'awaiting payment'], paid: ['оплачен', 'paid'], processing: ['собирается', 'being prepared'],
    shipped: ['отправлен', 'shipped'], delivered: ['доставлен', 'delivered'], cancelled: ['отменён', 'cancelled'],
  };
  const st = (names[order.status] || [order.status, order.status])[ru ? 0 : 1];
  const text = ru ? `📦 Заказ <b>${esc(order.code)}</b>: статус — <b>${st}</b>` : `📦 Order <b>${esc(order.code)}</b> is now <b>${st}</b>`;
  await tg.call('sendMessage', { chat_id: order.tgUserId, text, parse_mode: 'HTML' }).catch(() => {});
}

module.exports = { orderToAdmin, supportToAdmin, statusToCustomer, esc, money };
