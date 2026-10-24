/* Admin panel — Naruto Anime & Shop */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const dt = (d) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const CATS = { clothing: 'Одежда', accessories: 'Аксессуары', collectibles: 'Атрибутика' };
  const STATUS = { pending: 'Ожидает оплаты', paid: 'Оплачен', processing: 'Собирается', shipped: 'Отправлен', delivered: 'Доставлен', cancelled: 'Отменён' };
  const PAY = { card_demo: 'Карта (демо)', stripe_card: 'Карта (Stripe)', telegram_card: 'Карта (Telegram)', cash_on_delivery: 'При получении' };

  const state = { tab: 'dashboard', products: [], episodes: [], news: [], orders: [], messages: [], filter: { q: '', status: '' } };

  async function api(path, opts = {}) {
    const init = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers || {}) } };
    if (opts.body && !(opts.body instanceof FormData)) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    const res = await fetch(`/api/admin${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('unauthorized'); }
    if (!res.ok) throw new Error(data.error || 'error');
    return data;
  }
  // Multipart upload with progress (for big video files)
  function upload(method, path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `/api/admin${path}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(formData);
    });
  }

  let toastT;
  function toast(msg, err) {
    const el = $('#toast');
    el.textContent = msg; el.className = `show ${err ? 'error' : ''}`;
    clearTimeout(toastT); toastT = setTimeout(() => { el.className = ''; }, 2600);
  }

  // ---------- Auth ----------
  function showLogin() { $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden'); }
  async function showApp(email) {
    $('#adminEmail').textContent = email;
    $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden');
    await go(state.tab);
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const r = await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      e.target.reset();
      showApp(r.email);
    } catch (err) {
      $('#loginErr').textContent = err.message === 'invalid_credentials' ? 'Неверный email или пароль. Доступ только для администратора.' : 'Слишком много попыток, попробуйте позже.';
    }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  // ---------- Navigation ----------
  const titles = { dashboard: 'Обзор', orders: 'Заказы', products: 'Товары', episodes: 'Серии', news: 'Новости', messages: 'Сообщения' };
  $$('.side nav a').forEach((a) => a.addEventListener('click', () => go(a.dataset.tab)));
  $('#menuBtn').addEventListener('click', () => $('.side').classList.toggle('open'));

  async function go(tab) {
    state.tab = tab;
    $$('.side nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    $('.side').classList.remove('open');
    $('#title').textContent = titles[tab];
    $('#topActions').innerHTML = '';
    $('#view').innerHTML = '<div class="empty">Загрузка…</div>';
    try { await views[tab](); } catch (e) { if (e.message !== 'unauthorized') $('#view').innerHTML = `<div class="empty">Ошибка: ${esc(e.message)}</div>`; }
  }

  const views = {};

  views.dashboard = async () => {
    const [s, orders] = await Promise.all([api('/stats'), api('/orders')]);
    state.orders = orders;
    $('#ordersPill').textContent = s.pending || '';
    $('#view').innerHTML = `
      <div class="stats">
        <div class="stat"><b>${money(s.revenue)}</b><span class="muted">Выручка (оплачено)</span></div>
        <div class="stat"><b>${s.orders}</b><span class="muted">Заказов всего</span></div>
        <div class="stat"><b>${s.pending}</b><span class="muted">В работе</span></div>
        <div class="stat"><b>${s.products}</b><span class="muted">Товаров</span></div>
        <div class="stat"><b>${s.episodes}</b><span class="muted">Серий</span></div>
        <div class="stat"><b>${s.users}</b><span class="muted">Покупателей</span></div>
      </div>
      <h3 style="margin-bottom:12px">Последние заказы</h3>
      ${orders.slice(0, 5).map(orderHtml).join('') || '<div class="empty">Заказов пока нет</div>'}`;
    bindOrders();
  };

  // ---------- Orders ----------
  function orderHtml(o) {
    const c = o.customer;
    const map = c.location ? `<a class="btn sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${c.location.lat},${c.location.lng}">🗺 Карта</a>` : '';
    return `<div class="order">
      <div class="order-top">
        <div><b style="font-size:16px">${esc(o.code)}</b> <span class="muted">· ${dt(o.createdAt)} · ${o.source === 'telegram' ? 'Telegram-бот' : 'Сайт'}</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tag ${o.status}">${STATUS[o.status] || o.status}</span>
          <select data-status="${o.id}" style="width:auto">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${map}
          <button class="btn sm danger" data-del-order="${o.id}">Удалить</button>
        </div>
      </div>
      <div class="order-grid">
        <div><small>Покупатель</small><b>${esc(c.name)}</b><br>${esc(c.phone)}${c.email ? `<br><span class="muted">${esc(c.email)}</span>` : ''}</div>
        <div><small>Доставка</small>${esc([c.city, c.address].filter(Boolean).join(', ') || '—')}${c.location ? `<br><span class="muted">📍 ${c.location.lat.toFixed(5)}, ${c.location.lng.toFixed(5)}</span>` : ''}${c.comment ? `<br><span class="muted">💬 ${esc(c.comment)}</span>` : ''}</div>
        <div><small>Оплата</small>${PAY[o.payment.method] || esc(o.payment.method)} — <b>${o.payment.status === 'paid' ? 'оплачено' : 'не оплачено'}</b>${o.payment.last4 ? `<br><span class="muted">${esc(o.payment.brand)} •••• ${esc(o.payment.last4)}</span>` : ''}<br>Итого: <b>${money(o.total)}</b>${o.shipping ? ` <span class="muted">(доставка ${money(o.shipping)})</span>` : ''}</div>
      </div>
      <div class="items">${o.items.map((i) => `<div class="item"><img src="${esc(i.image)}" alt=""><div><b>${esc(i.name.ru || i.name.en)}</b>${i.size ? ` · ${esc(i.size)}` : ''}<br><span class="muted">${money(i.price)} × ${i.qty}</span></div></div>`).join('')}</div>
    </div>`;
  }
  function bindOrders() {
    $$('[data-status]').forEach((s) => s.addEventListener('change', async () => {
      try { await api(`/orders/${s.dataset.status}`, { method: 'PATCH', body: { status: s.value } }); toast('Статус обновлён'); go(state.tab); } catch (e) { toast(e.message, true); }
    }));
    $$('[data-del-order]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить заказ безвозвратно?')) return;
      await api(`/orders/${b.dataset.delOrder}`, { method: 'DELETE' }); toast('Заказ удалён'); go(state.tab);
    }));
  }
  views.orders = async () => {
    state.orders = await api('/orders');
    const draw = () => {
      const q = state.filter.q.toLowerCase();
      const list = state.orders.filter((o) => (!state.filter.status || o.status === state.filter.status)
        && (!q || `${o.code} ${o.customer.name} ${o.customer.phone}`.toLowerCase().includes(q)));
      $('#orderList').innerHTML = list.map(orderHtml).join('') || '<div class="empty">Нет заказов</div>';
      bindOrders();
    };
    $('#view').innerHTML = `<div class="filters"><input id="oq" placeholder="Поиск: код, имя, телефон" value="${esc(state.filter.q)}">
      <select id="os"><option value="">Все статусы</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === state.filter.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sm" id="csv">⬇ CSV</button></div><div id="orderList"></div>`;
    $('#oq').addEventListener('input', (e) => { state.filter.q = e.target.value; draw(); });
    $('#os').addEventListener('change', (e) => { state.filter.status = e.target.value; draw(); });
    $('#csv').addEventListener('click', exportCsv);
    draw();
  };
  function exportCsv() {
    const rows = [['code', 'date', 'source', 'status', 'name', 'phone', 'email', 'address', 'lat', 'lng', 'items', 'total']];
    state.orders.forEach((o) => rows.push([o.code, o.createdAt, o.source, o.status, o.customer.name, o.customer.phone, o.customer.email, [o.customer.city, o.customer.address].filter(Boolean).join(', '),
      o.customer.location?.lat ?? '', o.customer.location?.lng ?? '', o.items.map((i) => `${i.name.en} x${i.qty}`).join('; '), o.total]));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ---------- Products ----------
  views.products = async () => {
    state.products = await api('/products');
    $('#topActions').innerHTML = '<button class="btn primary" id="addProduct">+ Добавить товар</button>';
    $('#addProduct').addEventListener('click', () => productForm());
    $('#view').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Название</th><th>Категория</th><th>Цена</th><th>Остаток</th><th>Хит</th><th></th></tr></thead><tbody>
      ${state.products.map((p) => `<tr><td><img class="th" src="${esc(p.image)}" alt=""></td><td><b>${esc(p.name.ru)}</b><br><span class="muted">${esc(p.name.en)}</span></td>
      <td>${CATS[p.category] || p.category}</td><td><b>${money(p.price)}</b></td><td>${p.stock}</td><td>${p.popular ? '🔥' : ''}</td>
      <td><div class="row-actions"><button class="btn sm" data-edit="${p.id}">Изменить</button><button class="btn sm danger" data-del="${p.id}">Удалить</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => productForm(state.products.find((p) => p.id === b.dataset.edit))));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить товар?')) return;
      await api(`/products/${b.dataset.del}`, { method: 'DELETE' }); toast('Товар удалён'); go('products');
    }));
  };
  function productForm(p = null) {
    openDialog(`
      <h2>${p ? 'Редактировать товар' : 'Новый товар'}</h2>
      <div class="grid2"><label>Название (RU)<input name="name_ru" required value="${esc(p?.name.ru)}"></label><label>Название (EN)<input name="name_en" value="${esc(p?.name.en)}"></label></div>
      <div class="grid2"><label>Описание (RU)<textarea name="description_ru">${esc(p?.description.ru)}</textarea></label><label>Описание (EN)<textarea name="description_en">${esc(p?.description.en)}</textarea></label></div>
      <div class="grid2"><label>Цена (USD)<input name="price" type="number" step="0.01" min="0" required value="${p?.price ?? ''}"></label>
      <label>Категория<select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${p?.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="grid2"><label>Остаток на складе<input name="stock" type="number" min="0" value="${p?.stock ?? 50}"></label><label class="check" style="align-self:end"><input type="checkbox" name="popular" ${p?.popular ? 'checked' : ''}> Показывать в «Популярном»</label></div>
      <label>Фото товара <span class="hint">JPG/PNG/WebP (отправляется админу в Telegram с заказом)</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label>
      <label>…или ссылка на фото<input name="imageUrl" placeholder="https://..." value="${p && /^https?:/.test(p.image) ? esc(p.image) : ''}"></label>
      ${p ? `<img class="preview" src="${esc(p.image)}" alt="">` : ''}
      <div class="dlg-actions"><button type="button" class="btn ghost" data-close>Отмена</button><button class="btn primary">Сохранить</button></div>`,
    async (fd, btn) => {
      fd.set('popular', fd.get('popular') ? 'true' : 'false');
      if (!fd.get('image')?.size) fd.delete('image');
      await upload(p ? 'PUT' : 'POST', p ? `/products/${p.id}` : '/products', fd);
      toast('Товар сохранён'); go('products');
    });
  }

  // ---------- Episodes ----------
  views.episodes = async () => {
    state.episodes = await api('/episodes');
    $('#topActions').innerHTML = '<button class="btn primary" id="addEp">+ Добавить серию</button>';
    $('#addEp').addEventListener('click', () => episodeForm());
    $('#view').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>№</th><th>Название</th><th>Видео</th><th>Telegram</th><th></th></tr></thead><tbody>
      ${state.episodes.map((e) => `<tr><td><img class="wide" src="${esc(e.thumbnail)}" alt=""></td><td><b>S${e.season}E${String(e.number).padStart(2, '0')}</b></td>
      <td><b>${esc(e.title.ru)}</b><br><span class="muted">${esc(e.title.en)}</span></td>
      <td style="max-width:220px;word-break:break-all"><a href="${esc(e.videoUrl)}" target="_blank" class="muted">${esc(e.videoUrl || '—')}</a></td>
      <td>${e.tgFileId ? '✅ в кэше' : '<span class="muted">загрузится при первой отправке</span>'}</td>
      <td><div class="row-actions"><a class="btn sm" href="/#/watch/${e.id}" target="_blank">▶</a><button class="btn sm" data-edit="${e.id}">Изменить</button><button class="btn sm danger" data-del="${e.id}">Удалить</button></div></td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint" style="margin-top:12px">Telegram-бот может отправить видеофайл до 50 МБ. Для файлов больше бот пришлёт ссылку на просмотр на сайте. Загружайте только видео, на распространение которых у вас есть права.</p>`;
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => episodeForm(state.episodes.find((x) => x.id === b.dataset.edit))));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить серию?')) return;
      await api(`/episodes/${b.dataset.del}`, { method: 'DELETE' }); toast('Серия удалена'); go('episodes');
    }));
  };
  function episodeForm(e = null) {
    const nextNum = (state.episodes.reduce((m, x) => Math.max(m, x.number), 0) || 0) + 1;
    openDialog(`
      <h2>${e ? 'Редактировать серию' : 'Новая серия'}</h2>
      <div class="grid2"><label>Номер серии<input name="number" type="number" min="1" required value="${e?.number ?? nextNum}"></label><label>Сезон<input name="season" type="number" min="1" value="${e?.season ?? 1}"></label></div>
      <div class="grid2"><label>Название (RU)<input name="title_ru" required value="${esc(e?.title.ru)}"></label><label>Название (EN)<input name="title_en" value="${esc(e?.title.en)}"></label></div>
      <div class="grid2"><label>Описание (RU)<textarea name="description_ru">${esc(e?.description.ru)}</textarea></label><label>Описание (EN)<textarea name="description_en">${esc(e?.description.en)}</textarea></label></div>
      <label>Длительность<input name="duration" placeholder="23:40" value="${esc(e?.duration)}"></label>
      <label>Видеофайл <span class="hint">MP4/WebM — загрузка на сервер</span><input type="file" name="video" accept="video/mp4,video/webm,video/quicktime,video/x-m4v"></label>
      <label>…или ссылка на видео <span class="hint">прямая ссылка .mp4, YouTube или embed-ссылка</span><input name="videoUrl" placeholder="https://..." value="${esc(e?.videoUrl)}"></label>
      <label>Превью (картинка)<input type="file" name="thumbnail" accept="image/png,image/jpeg,image/webp"></label>
      <label>…или ссылка на превью<input name="thumbnailUrl" value="${e && /^https?:/.test(e.thumbnail) ? esc(e.thumbnail) : ''}"></label>
      ${e ? `<img class="preview wide" src="${esc(e.thumbnail)}" alt="">` : ''}
      <label class="check"><input type="checkbox" name="popular" ${e?.popular ? 'checked' : ''}> Показывать на главной</label>
      <div class="progress hidden" id="prog"><span></span></div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-close>Отмена</button><button class="btn primary">Сохранить</button></div>`,
    async (fd) => {
      fd.set('popular', fd.get('popular') ? 'true' : 'false');
      ['video', 'thumbnail'].forEach((k) => { if (!fd.get(k)?.size) fd.delete(k); });
      if (fd.get('video')) fd.delete('videoUrl'); // uploaded file wins
      const prog = $('#prog');
      prog.classList.remove('hidden');
      await upload(e ? 'PUT' : 'POST', e ? `/episodes/${e.id}` : '/episodes', fd, (p) => { $('span', prog).style.width = `${Math.round(p * 100)}%`; });
      toast('Серия сохранена'); go('episodes');
    });
  }

  // ---------- News ----------
  views.news = async () => {
    state.news = await api('/news');
    $('#topActions').innerHTML = '<button class="btn primary" id="addNews">+ Добавить новость</button>';
    $('#addNews').addEventListener('click', () => newsForm());
    $('#view').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Заголовок</th><th>Дата</th><th></th></tr></thead><tbody>
      ${[...state.news].reverse().map((n) => `<tr><td><img class="wide" src="${esc(n.image)}" alt=""></td><td><b>${esc(n.title.ru)}</b><br><span class="muted">${esc(n.title.en)}</span></td><td>${dt(n.date)}</td>
      <td><div class="row-actions"><button class="btn sm" data-edit="${n.id}">Изменить</button><button class="btn sm danger" data-del="${n.id}">Удалить</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => newsForm(state.news.find((x) => x.id === b.dataset.edit))));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить новость?')) return;
      await api(`/news/${b.dataset.del}`, { method: 'DELETE' }); toast('Удалено'); go('news');
    }));
  };
  function newsForm(n = null) {
    openDialog(`
      <h2>${n ? 'Редактировать новость' : 'Новая новость'}</h2>
      <div class="grid2"><label>Заголовок (RU)<input name="title_ru" required value="${esc(n?.title.ru)}"></label><label>Заголовок (EN)<input name="title_en" value="${esc(n?.title.en)}"></label></div>
      <label>Текст (RU)<textarea name="body_ru" style="min-height:140px">${esc(n?.body.ru)}</textarea></label>
      <label>Текст (EN)<textarea name="body_en" style="min-height:140px">${esc(n?.body.en)}</textarea></label>
      <label>Обложка<input type="file" name="image" accept="image/png,image/jpeg,image/webp"></label>
      <label>…или ссылка на обложку<input name="imageUrl" value="${n && /^https?:/.test(n.image) ? esc(n.image) : ''}"></label>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-close>Отмена</button><button class="btn primary">Сохранить</button></div>`,
    async (fd) => {
      if (!fd.get('image')?.size) fd.delete('image');
      await upload(n ? 'PUT' : 'POST', n ? `/news/${n.id}` : '/news', fd);
      toast('Новость сохранена'); go('news');
    });
  }

  // ---------- Messages ----------
  views.messages = async () => {
    state.messages = await api('/messages');
    $('#view').innerHTML = state.messages.map((m) => `<div class="order"><div class="order-top"><div><b>${esc(m.name)}</b> <span class="muted">· <a href="mailto:${esc(m.email)}">${esc(m.email)}</a> · ${dt(m.createdAt)}${m.order ? ` · заказ ${esc(m.order)}` : ''}</span></div>
      <button class="btn sm danger" data-del="${m.id}">Удалить</button></div><p style="white-space:pre-line">${esc(m.message)}</p></div>`).join('') || '<div class="empty">Сообщений нет</div>';
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => { await api(`/messages/${b.dataset.del}`, { method: 'DELETE' }); go('messages'); }));
  };

  // ---------- Dialog helper ----------
  function openDialog(html, onSubmit) {
    const dlg = $('#dlg');
    const form = $('#dlgForm');
    form.innerHTML = html;
    $$('[data-close]', form).forEach((b) => b.addEventListener('click', () => dlg.close()));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('.btn.primary', form);
      btn.disabled = true; btn.textContent = 'Сохранение…';
      try { await onSubmit(new FormData(form), btn); dlg.close(); } catch (err) { toast(`Ошибка: ${err.message}`, true); btn.disabled = false; btn.textContent = 'Сохранить'; }
    };
    dlg.showModal();
  }

  // ---------- Boot ----------
  api('/me').then((r) => showApp(r.email)).catch(showLogin);
})();
