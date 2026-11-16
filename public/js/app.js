/* ================= Naruto Anime & Shop — SPA ================= */
(() => {
  'use strict';

  // ---------- Utilities ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const hasGsap = typeof window.gsap !== 'undefined';
  if (hasGsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  else document.documentElement.classList.add('no-gsap');

  const S = {
    lang: (() => {
      const saved = store.get('lang', null);
      if (saved && window.I18N[saved]) return saved;
      const nav = (navigator.language || 'uz').toLowerCase();
      return nav.startsWith('ru') ? 'ru' : nav.startsWith('en') ? 'en' : 'uz';
    })(),
    cart: store.get('cart', []),
    config: { currency: 'USD', shipping: { fee: 7, freeFrom: 80 }, botUsername: null, paymentMode: 'demo' },
    products: [], episodes: [], news: [], user: null,
  };

  // ---------- i18n ----------
  function t(path, vars) {
    const pick = (lang) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), window.I18N[lang]);
    let v = pick(S.lang);
    if (v == null) v = pick('en');
    if (typeof v === 'string' && vars) Object.entries(vars).forEach(([k, x]) => { v = v.replace(`{${k}}`, x); });
    return v == null ? path : v;
  }
  const L = (obj) => (obj && (obj[S.lang] || obj.en || obj.ru)) || '';
  const LOCALES = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  const locale = () => LOCALES[S.lang] || 'en-US';
  const money = (n) => new Intl.NumberFormat(locale(), { style: 'currency', currency: S.config.currency || 'USD' }).format(n || 0);
  const date = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });

  function applyStatic() {
    document.documentElement.lang = S.lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('#langCurrent').textContent = S.lang.toUpperCase();
    $$('.lang-menu li').forEach((li) => li.classList.toggle('active', li.dataset.lang === S.lang));
    $$('.tg-link').forEach((a) => { a.href = botLink(); });
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const init = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers || {}) } };
    if (opts.body && !(opts.body instanceof FormData)) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(`/api${path}`, init); } catch { const e = new Error('network'); e.status = 0; throw e; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'error'); e.status = res.status; throw e; }
    return data;
  }
  const errText = (e) => t(`errors.${e.message}`) !== `errors.${e.message}` ? t(`errors.${e.message}`) : t('common.error');

  const botLink = (payload) => (S.config.botUsername ? `https://t.me/${S.config.botUsername}${payload ? `?start=${payload}` : ''}` : '#/contacts');

  // ---------- UI helpers ----------
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    if (hasGsap) gsap.fromTo(el, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.6)' });
    setTimeout(() => { if (hasGsap) gsap.to(el, { x: 60, opacity: 0, duration: 0.3, onComplete: () => el.remove() }); else el.remove(); }, 2800);
  }
  function modal(html) {
    const m = $('#modal');
    $('.modal-body', m).innerHTML = html;
    m.hidden = false;
    if (hasGsap) gsap.fromTo('.modal-card', { y: 40, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' });
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('.modal-close')) $('#modal').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

  // ---------- Cart ----------
  const cart = {
    save() { store.set('cart', S.cart); this.badge(); },
    badge() {
      const n = S.cart.reduce((s, i) => s + i.qty, 0);
      const el = $('#cartCount');
      el.textContent = n || '';
      if (n && hasGsap) gsap.fromTo(el, { scale: 1.6 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
    },
    add(id, qty = 1, size) {
      const key = `${id}|${size || ''}`;
      const item = S.cart.find((i) => `${i.id}|${i.size || ''}` === key);
      if (item) item.qty = Math.min(20, item.qty + qty); else S.cart.push({ id, qty, size });
      this.save();
      toast(t('common.added'));
    },
    set(idx, qty) { if (qty <= 0) S.cart.splice(idx, 1); else S.cart[idx].qty = Math.min(20, qty); this.save(); },
    lines() {
      return S.cart.map((i) => ({ ...i, product: S.products.find((p) => p.id === i.id) })).filter((l) => l.product);
    },
    totals() {
      const subtotal = this.lines().reduce((s, l) => s + l.product.price * l.qty, 0);
      const sh = S.config.shipping;
      const shipping = subtotal === 0 || subtotal >= sh.freeFrom ? 0 : sh.fee;
      return { subtotal, shipping, total: subtotal + shipping };
    },
    clear() { S.cart = []; this.save(); },
  };

  // ---------- Templates ----------
  const icons = {
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>',
    tg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.8 15.6 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.7c.3-1.1-.4-1.6-1.1-1.3L3.6 10.8c-1.1.4-1.1 1-.2 1.3l4.1 1.3 9.5-6c.4-.3.9-.1.6.2"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  };

  const productCard = (p) => `
    <article class="product-card" data-reveal data-tilt>
      ${p.popular ? '<span class="badge">HOT</span>' : ''}${p.stock <= 0 ? `<span class="badge red">${esc(t('common.outOfStock'))}</span>` : ''}
      <a href="#/product/${p.id}" class="thumb"><img src="${esc(p.image)}" alt="${esc(L(p.name))}" loading="lazy"></a>
      <div class="body">
        <span class="cat">${esc(t(`common.categories.${p.category}`))}</span>
        <a href="#/product/${p.id}"><h3>${esc(L(p.name))}</h3></a>
        <div class="row">
          <span class="price">${money(p.price)}</span>
          ${p.stock > 0 ? `<button class="add-btn" data-add="${p.id}" aria-label="${esc(t('common.addToCart'))}">${icons.plus}</button>` : ''}
        </div>
      </div>
    </article>`;

  const epCard = (e) => `
    <a class="ep-card" href="#/watch/${e.id}" data-reveal>
      <div class="thumb"><img src="${esc(e.thumbnail)}" alt="" loading="lazy">
        <div class="play"><i>${icons.play}</i></div>
        <span class="ep-num">S${e.season} · E${String(e.number).padStart(2, '0')}</span>
        ${e.duration ? `<span class="ep-dur">${esc(e.duration)}</span>` : ''}
      </div>
      <div class="body"><h3>${esc(L(e.title))}</h3></div>
    </a>`;

  const newsCard = (n) => `
    <article class="news-card" data-news="${n.id}" data-reveal>
      <img src="${esc(n.image)}" alt="" loading="lazy">
      <div class="body"><time>${date(n.date)}</time><h3>${esc(L(n.title))}</h3><p>${esc(L(n.body))}</p></div>
    </article>`;

  const pageHero = (key, kanji) => `
    <section class="page-hero"><div class="container">
      <span class="bg-kanji">${kanji}</span>
      <span class="eyebrow" data-reveal>${esc(t(`${key}.eyebrow`))}</span>
      <h1 class="h1" data-reveal>${esc(t(`${key}.title`))}</h1>
      <p data-reveal>${esc(t(`${key}.lead`))}</p>
    </div></section>`;

  const emptyState = (title, sub, href, cta) => `
    <div class="empty-state" data-reveal><div class="big">空</div><h2 class="h2">${esc(title)}</h2>
    <p class="muted" style="margin:10px 0 24px">${esc(sub || '')}</p>${href ? `<a class="btn btn-primary" href="${href}">${esc(cta)}</a>` : ''}</div>`;

  // ---------- Pages ----------
  const pages = {};

  pages.home = () => {
    const popular = S.products.filter((p) => p.popular).slice(0, 4);
    const fresh = [...S.episodes].slice(-4).reverse();
    const pick = S.products[0];
    const m = t('home.marquee');
    const marquee = [...m, ...m].map((x) => `<span>${esc(x)} <em>忍</em></span>`).join('');
    return `
    <section class="hero"><div class="container hero-grid">
      <div>
        <span class="eyebrow hero-in">${esc(t('home.eyebrow'))}</span>
        <h1 class="h1 hero-title" style="margin-top:18px">
          <span class="line"><span>${esc(t('home.title1'))}</span></span>
          <span class="line"><span class="grad-text">${esc(t('home.title2'))}</span></span>
        </h1>
        <p class="lead hero-in">${esc(t('home.lead'))}</p>
        <div class="hero-cta hero-in">
          <a class="btn btn-primary" href="#/watch">${icons.play.replace('#000', 'currentColor')} ${esc(t('home.ctaWatch'))}</a>
          <a class="btn btn-ghost" href="#/shop">${esc(t('home.ctaShop'))}</a>
        </div>
        <div class="hero-stats hero-in">
          <div><b data-count="${S.episodes.length}">0</b><span>${esc(t('home.stats')[0])}</span></div>
          <div><b data-count="${S.products.length}">0</b><span>${esc(t('home.stats')[1])}</span></div>
          <div><b>24/7</b><span>${esc(t('home.stats')[2])}</span></div>
        </div>
      </div>
      <div class="hero-visual">
        <div class="seal"></div><div class="seal s2"></div><div class="seal s3"></div>
        <div class="seal-glyphs">${'火風雷水土影木雲'.split('').map((g) => `<span>${g}</span>`).join('')}</div>
        <div class="orbit"><i></i></div>
        <div class="seal-kanji">忍</div>
        ${fresh[0] ? `<a href="#/watch/${fresh[0].id}" class="float-card fc-1"><img src="${esc(fresh[0].thumbnail)}" alt=""><div><small class="accent">${esc(t('home.fc1'))}</small><b>${esc(L(fresh[0].title))}</b></div></a>` : ''}
        ${pick ? `<a href="#/product/${pick.id}" class="float-card fc-2"><img src="${esc(pick.image)}" alt=""><div><small class="accent">${esc(t('home.fc2'))}</small><b>${esc(L(pick.name))} · ${money(pick.price)}</b></div></a>` : ''}
      </div>
    </div></section>

    <div class="marquee"><div class="marquee-track">${marquee}</div></div>

    <section class="section"><div class="container">
      <div class="section-head"><div><span class="eyebrow" data-reveal>${esc(t('nav.shop'))}</span><h2 class="h2" data-reveal>${esc(t('home.popular'))}</h2><p class="muted" data-reveal>${esc(t('home.popularSub'))}</p></div>
      <a class="btn btn-ghost btn-sm" href="#/shop" data-reveal>${esc(t('common.viewAll'))} →</a></div>
      <div class="grid grid-4">${popular.map(productCard).join('')}</div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><div><span class="eyebrow" data-reveal>${esc(t('nav.watch'))}</span><h2 class="h2" data-reveal>${esc(t('home.fresh'))}</h2><p class="muted" data-reveal>${esc(t('home.freshSub'))}</p></div>
      <a class="btn btn-ghost btn-sm" href="#/watch" data-reveal>${esc(t('common.viewAll'))} →</a></div>
      <div class="grid grid-4">${fresh.map(epCard).join('')}</div>
    </div></section>

    <section class="section"><div class="container">
      <div class="tg-promo" data-reveal>
        <div>
          <span class="eyebrow">Telegram</span>
          <h2 class="h2">${esc(t('home.tgTitle'))}</h2>
          <p class="muted" style="margin-top:12px">${esc(t('home.tgText'))}</p>
          <ul>${t('home.tgList').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <a class="btn btn-tg" href="${botLink()}" target="_blank" rel="noopener">${icons.tg} ${esc(t('home.tgCta'))}</a>
        </div>
        <div class="phone">
          <div class="bubble me">/start ep_01</div>
          <div class="bubble">${fresh[0] ? `<img src="${esc(fresh[0].thumbnail)}" alt="">` : ''}🎬 ${esc(t('common.episode'))} 1 ▶️</div>
          <div class="bubble">${pick ? `<img src="${esc(pick.image)}" alt="">${esc(L(pick.name))} — ${money(pick.price)}` : ''}<div class="kb"><span>🛒</span><span>⚡</span></div></div>
        </div>
      </div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><div><span class="eyebrow" data-reveal>${esc(t('nav.news'))}</span><h2 class="h2" data-reveal>${esc(t('home.news'))}</h2></div>
      <a class="btn btn-ghost btn-sm" href="#/news" data-reveal>${esc(t('common.viewAll'))} →</a></div>
      <div class="grid grid-3 news-grid">${S.news.slice(0, 3).map(newsCard).join('')}</div>
    </div></section>`;
  };

  pages.shop = (_p, query) => {
    const cat = query.get('cat') || 'all';
    return `${pageHero('shop', '店')}
    <section class="container">
      <div class="toolbar" data-reveal>
        <div class="chips">${['all', 'clothing', 'accessories', 'collectibles'].map((c) => `<button class="chip ${c === cat ? 'active' : ''}" data-cat="${c}">${esc(t(`common.categories.${c}`))}</button>`).join('')}</div>
        <div class="search field">${icons.search}<input id="q" placeholder="${esc(t('shop.search'))}" autocomplete="off"></div>
        <select class="select" id="sort">
          <option value="featured">${esc(t('shop.sort.featured'))}</option>
          <option value="asc">${esc(t('shop.sort.priceAsc'))}</option>
          <option value="desc">${esc(t('shop.sort.priceDesc'))}</option>
        </select>
      </div>
      <div class="grid grid-4" id="productGrid"></div>
    </section>`;
  };
  pages.shop.mount = (_p, query) => {
    let cat = query.get('cat') || 'all';
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase();
      const sort = $('#sort').value;
      let list = S.products.filter((p) => (cat === 'all' || p.category === cat) && (!q || `${p.name.en} ${p.name.ru}`.toLowerCase().includes(q)));
      if (sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
      if (sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
      if (sort === 'featured') list = [...list].sort((a, b) => Number(b.popular) - Number(a.popular));
      $('#productGrid').innerHTML = list.length ? list.map(productCard).join('') : `<div style="grid-column:1/-1">${emptyState(t('shop.empty'))}</div>`;
      animateIn($$('#productGrid [data-reveal]'));
      bindTilt();
    };
    $$('.chip').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.cat;
      $$('.chip').forEach((x) => x.classList.toggle('active', x === b));
      history.replaceState(null, '', `#/shop${cat === 'all' ? '' : `?cat=${cat}`}`);
      draw();
    }));
    $('#q').addEventListener('input', draw);
    $('#sort').addEventListener('change', draw);
    draw();
  };

  pages.product = ([id]) => {
    const p = S.products.find((x) => x.id === id);
    if (!p) return `<div class="container">${emptyState(t('shop.empty'), '', '#/shop', t('cart.goShop'))}</div>`;
    const sizes = p.category === 'clothing' ? ['S', 'M', 'L', 'XL', 'XXL'] : null;
    return `<section class="container product-page">
      <div class="gallery" data-reveal><img src="${esc(p.image)}" alt="${esc(L(p.name))}"></div>
      <div>
        <a href="#/shop?cat=${p.category}" class="eyebrow" data-reveal>${esc(t(`common.categories.${p.category}`))}</a>
        <h1 class="h2" data-reveal>${esc(L(p.name))}</h1>
        <div class="price" data-reveal>${money(p.price)}</div>
        <p class="muted" data-reveal>${esc(L(p.description))}</p>
        ${sizes ? `<div data-reveal style="margin-top:24px"><b>${esc(t('shop.size'))}</b><div class="sizes">${sizes.map((s, i) => `<button class="size ${i === 1 ? 'active' : ''}" data-size="${s}">${s}</button>`).join('')}</div></div>` : '<div style="height:24px"></div>'}
        <div data-reveal style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <div class="qty"><button data-q="-1">−</button><span id="qty">1</span><button data-q="1">+</button></div>
          ${p.stock > 0 ? `<button class="btn btn-primary" id="addBtn">${esc(t('common.addToCart'))}</button><button class="btn btn-ghost" id="buyBtn">${esc(t('common.buyNow'))}</button>` : `<span class="badge red" style="position:static">${esc(t('common.outOfStock'))}</span>`}
        </div>
        ${S.config.botUsername ? `<a class="btn btn-tg btn-sm" style="margin-top:14px" target="_blank" rel="noopener" href="${botLink(`prod_${p.id}`)}" data-reveal>${icons.tg} ${esc(t('shop.inBot'))}</a>` : ''}
        <div class="perks" data-reveal>${t('shop.perks').map((x, i) => `<div><span class="accent">${['🚚', '↩️', '🔒'][i]}</span>${esc(x)}</div>`).join('')}</div>
      </div>
    </section>
    <section class="section"><div class="container"><h2 class="h2" data-reveal>${esc(t('home.popular'))}</h2><div class="grid grid-4" style="margin-top:24px">${S.products.filter((x) => x.id !== p.id && x.category === p.category).concat(S.products.filter((x) => x.category !== p.category)).slice(0, 4).map(productCard).join('')}</div></div></section>`;
  };
  pages.product.mount = ([id]) => {
    let qty = 1;
    let size = $('.size.active') ? $('.size.active').dataset.size : undefined;
    $$('[data-q]').forEach((b) => b.addEventListener('click', () => { qty = Math.max(1, Math.min(20, qty + Number(b.dataset.q))); $('#qty').textContent = qty; }));
    $$('.size').forEach((b) => b.addEventListener('click', () => { size = b.dataset.size; $$('.size').forEach((x) => x.classList.toggle('active', x === b)); }));
    const add = $('#addBtn');
    if (add) add.addEventListener('click', () => { cart.add(id, qty, size); flyToCart($('.gallery img')); });
    const buy = $('#buyBtn');
    if (buy) buy.addEventListener('click', () => { cart.add(id, qty, size); location.hash = '#/checkout'; });
  };

  pages.watch = ([id]) => {
    if (!S.episodes.length) return `${pageHero('watch', '映')}<div class="container">${emptyState(t('watch.empty'))}</div>`;
    if (!id) {
      return `${pageHero('watch', '映')}<section class="container"><div class="grid grid-3">${S.episodes.map(epCard).join('')}</div></section>`;
    }
    const idx = S.episodes.findIndex((e) => e.id === id);
    const e = S.episodes[idx];
    if (!e) return `<div class="container">${emptyState(t('watch.empty'), '', '#/watch', t('watch.list'))}</div>`;
    const prev = S.episodes[idx - 1];
    const next = S.episodes[idx + 1];
    return `<section class="container watch-layout">
      <div>
        <div class="player" data-reveal>${playerHtml(e.videoUrl)}</div>
        <div class="watch-info">
          <span class="eyebrow">${esc(t('common.season'))} ${e.season} · ${esc(t('common.episode'))} ${e.number}</span>
          <h1 class="h2">${esc(L(e.title))}</h1>
          <p class="muted" style="margin-top:10px">${esc(L(e.description))}</p>
          <div class="watch-actions">
            ${S.config.botUsername
              ? `<a class="btn btn-tg" href="${botLink(`ep_${e.id}`)}" target="_blank" rel="noopener">${icons.tg} ${esc(t('watch.sendBot'))}</a>`
              : `<button class="btn btn-tg" disabled title="${esc(t('watch.botOff'))}">${icons.tg} ${esc(t('watch.watchBot'))}</button>`}
            ${prev ? `<a class="btn btn-ghost" href="#/watch/${prev.id}">← ${esc(t('watch.prev'))}</a>` : ''}
            ${next ? `<a class="btn btn-ghost" href="#/watch/${next.id}">${esc(t('watch.next'))} →</a>` : ''}
          </div>
          <div class="tg-note">${icons.tg}<span>${esc(S.config.botUsername ? t('watch.botNote') : t('watch.botOff'))}</span></div>
        </div>
      </div>
      <aside>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 class="h3">${esc(t('watch.list'))}</h3>
        <label class="muted" style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="autoplay" ${store.get('autoplay', true) ? 'checked' : ''}> ${esc(t('watch.autoplay'))}</label></div>
        <div class="ep-list">${S.episodes.map((x) => `<a href="#/watch/${x.id}" class="ep-row ${x.id === e.id ? 'active' : ''}"><img src="${esc(x.thumbnail)}" alt="" loading="lazy"><div><small>E${String(x.number).padStart(2, '0')}${x.duration ? ` · ${esc(x.duration)}` : ''}</small><b>${esc(L(x.title))}</b></div></a>`).join('')}</div>
      </aside>
    </section>`;
  };
  pages.watch.mount = ([id]) => {
    if (!id) return;
    const idx = S.episodes.findIndex((e) => e.id === id);
    const v = $('.player video');
    const ap = $('#autoplay');
    if (ap) ap.addEventListener('change', () => store.set('autoplay', ap.checked));
    if (v) {
      const key = `progress:${id}`;
      const saved = store.get(key, 0);
      v.addEventListener('loadedmetadata', () => { if (saved && saved < v.duration - 5) v.currentTime = saved; }, { once: true });
      v.addEventListener('timeupdate', () => store.set(key, Math.floor(v.currentTime)));
      v.addEventListener('ended', () => { const next = S.episodes[idx + 1]; if (next && ap && ap.checked) location.hash = `#/watch/${next.id}`; });
    }
    const active = $('.ep-row.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  };

  function playerHtml(url) {
    if (!url) return '';
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
    if (/^\/|\.(mp4|webm|m4v|mov|m3u8)(\?|$)/i.test(url)) return `<video controls playsinline preload="metadata" src="${esc(url)}"></video>`;
    return `<iframe src="${esc(url)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  }

  pages.cart = () => {
    const lines = cart.lines();
    if (!lines.length) return `<div class="container" style="padding-top:40px">${emptyState(t('cart.empty'), t('cart.emptySub'), '#/shop', t('cart.goShop'))}</div>`;
    const { subtotal, shipping, total } = cart.totals();
    const left = S.config.shipping.freeFrom - subtotal;
    return `<section class="container" style="padding-top:40px">
      <h1 class="h2" data-reveal style="margin-bottom:28px">${esc(t('cart.title'))}</h1>
      <div class="cart-layout">
        <div class="grid" style="gap:14px">${lines.map((l) => `
          <div class="cart-item" data-reveal>
            <a href="#/product/${l.product.id}"><img src="${esc(l.product.image)}" alt=""></a>
            <div><h4>${esc(L(l.product.name))}</h4><span class="muted" style="font-size:14px">${money(l.product.price)}${l.size ? ` · ${esc(l.size)}` : ''}</span><br><button class="remove" data-rm="${S.cart.findIndex((x) => x.id === l.id && x.size === l.size)}">${esc(t('cart.remove'))}</button></div>
            <div style="display:grid;gap:10px;justify-items:end"><div class="qty"><button data-dq="-1" data-i="${S.cart.findIndex((x) => x.id === l.id && x.size === l.size)}">−</button><span>${l.qty}</span><button data-dq="1" data-i="${S.cart.findIndex((x) => x.id === l.id && x.size === l.size)}">+</button></div><b>${money(l.product.price * l.qty)}</b></div>
          </div>`).join('')}
        </div>
        <aside class="panel summary" data-reveal>
          <h3 class="h3" style="margin-bottom:14px">${esc(t('cart.summary'))}</h3>
          <div class="summary-row"><span>${esc(t('cart.subtotal'))}</span><span>${money(subtotal)}</span></div>
          <div class="summary-row"><span>${esc(t('cart.shipping'))}</span><span>${shipping ? money(shipping) : esc(t('cart.free'))}</span></div>
          ${left > 0 ? `<p class="accent" style="font-size:13px">${esc(t('cart.freeHint', { x: money(left) }))}</p>` : ''}
          <div class="summary-row total"><span>${esc(t('cart.total'))}</span><span>${money(total)}</span></div>
          <a class="btn btn-primary btn-block" href="#/checkout" style="margin-top:18px">${esc(t('cart.checkout'))} →</a>
        </aside>
      </div></section>`;
  };
  pages.cart.mount = () => {
    $$('[data-dq]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.i); cart.set(i, S.cart[i].qty + Number(b.dataset.dq)); render(); }));
    $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { cart.set(Number(b.dataset.rm), 0); render(); }));
  };

  pages.checkout = () => {
    const lines = cart.lines();
    if (!lines.length) return `<div class="container" style="padding-top:40px">${emptyState(t('cart.empty'), t('cart.emptySub'), '#/shop', t('cart.goShop'))}</div>`;
    const { subtotal, shipping, total } = cart.totals();
    const u = S.user || {};
    const stripe = S.config.paymentMode === 'stripe';
    return `<section class="container" style="padding-top:40px">
      <div class="steps" data-reveal>${t('checkout.steps').map((s, i) => `<div class="step ${i <= 2 ? 'active' : ''}"><i>${i + 1}</i>${esc(s)}</div>`).join('')}</div>
      <h1 class="h2" data-reveal style="margin-bottom:28px">${esc(t('checkout.title'))}</h1>
      <form class="cart-layout" id="checkoutForm" novalidate>
        <div class="grid" style="gap:22px">
          <div class="panel" data-reveal>
            <h3 class="h3" style="margin-bottom:18px">${esc(t('checkout.contact'))}</h3>
            <div class="form-grid">
              <div class="field"><label>${esc(t('checkout.name'))}</label><input name="name" required autocomplete="name" value="${esc(u.name || '')}"></div>
              <div class="field"><label>${esc(t('checkout.phone'))}</label><input name="phone" type="tel" required autocomplete="tel" placeholder="+998 90 123 45 67" value="${esc(u.phone || '')}"></div>
              <div class="field"><label>${esc(t('checkout.email'))}</label><input name="email" type="email" autocomplete="email" value="${esc(u.email || '')}"></div>
              <div class="field"><label>${esc(t('checkout.city'))}</label><input name="city" autocomplete="address-level2"></div>
              <div class="field full"><label>${esc(t('checkout.address'))}</label><input name="address" autocomplete="street-address" value="${esc(u.address || '')}"></div>
              <div class="full" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button type="button" class="geo-btn" id="geoBtn">${icons.pin} ${esc(t('checkout.useLocation'))}</button><span id="geoStatus"></span></div>
              <div class="field full"><label>${esc(t('checkout.comment'))}</label><input name="comment"></div>
            </div>
          </div>
          <div class="panel" data-reveal>
            <h3 class="h3" style="margin-bottom:18px">${esc(t('checkout.payment'))}</h3>
            ${stripe ? '<div id="stripe-card"></div>' : `
            <div class="demo-note">${esc(t('checkout.demoNote'))}</div>
            <div class="card-visual" id="cardVisual"><div class="card-inner">
              <div class="card-face"><div style="display:flex;justify-content:space-between;align-items:center"><div class="chip-icon"></div><span class="card-brand" id="cvBrand">CARD</span></div>
                <div class="card-number" id="cvNum">•••• •••• •••• ••••</div>
                <div class="card-meta"><div><small>${esc(t('checkout.holder'))}</small><span id="cvName">NAME SURNAME</span></div><div><small>${esc(t('checkout.expiry'))}</small><span id="cvExp">MM/YY</span></div></div></div>
              <div class="card-face card-back"><div class="strip"></div><div class="cvc" id="cvCvc">•••</div></div>
            </div></div>
            <div class="form-grid">
              <div class="field full"><label>${esc(t('checkout.cardNumber'))}</label><input id="ccNum" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23"></div>
              <div class="field"><label>${esc(t('checkout.expiry'))}</label><input id="ccExp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></div>
              <div class="field"><label>${esc(t('checkout.cvc'))}</label><input id="ccCvc" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="4" type="password"></div>
              <div class="field full"><label>${esc(t('checkout.holder'))}</label><input id="ccName" autocomplete="cc-name" placeholder="NAME SURNAME"></div>
            </div>`}
            <div class="secure">${icons.lock} ${esc(t('checkout.secure'))}</div>
          </div>
        </div>
        <aside class="panel summary" data-reveal>
          <h3 class="h3" style="margin-bottom:14px">${esc(t('cart.summary'))}</h3>
          ${lines.map((l) => `<div class="summary-row"><span>${esc(L(l.product.name))} × ${l.qty}</span><span>${money(l.product.price * l.qty)}</span></div>`).join('')}
          <div class="summary-row"><span>${esc(t('cart.subtotal'))}</span><span>${money(subtotal)}</span></div>
          <div class="summary-row"><span>${esc(t('cart.shipping'))}</span><span>${shipping ? money(shipping) : esc(t('cart.free'))}</span></div>
          <div class="summary-row total"><span>${esc(t('cart.total'))}</span><span>${money(total)}</span></div>
          <button class="btn btn-primary btn-block" id="payBtn" style="margin-top:18px">${icons.lock} ${esc(t('checkout.pay', { x: money(total) }))}</button>
        </aside>
      </form></section>`;
  };

  const luhn = (num) => {
    let sum = 0; let dbl = false;
    for (let i = num.length - 1; i >= 0; i--) { let d = Number(num[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
    return num.length >= 13 && sum % 10 === 0;
  };
  const brandOf = (n) => (/^4/.test(n) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(n) ? 'MASTERCARD' : /^3[47]/.test(n) ? 'AMEX' : /^9860/.test(n) ? 'HUMO' : /^8600/.test(n) ? 'UZCARD' : /^220[0-4]/.test(n) ? 'MIR' : /^62/.test(n) ? 'UNIONPAY' : 'CARD');

  pages.checkout.mount = async () => {
    const form = $('#checkoutForm');
    if (!form) return;
    let location = null;
    let stripe = null; let card = null;

    $('#geoBtn').addEventListener('click', () => {
      if (!navigator.geolocation) return toast(t('checkout.locationFail'), 'error');
      navigator.geolocation.getCurrentPosition((pos) => {
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $('#geoStatus').innerHTML = `<span class="geo-ok">✓ ${esc(t('checkout.locationOk'))} (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})</span>`;
      }, () => toast(t('checkout.locationFail'), 'error'), { enableHighAccuracy: true, timeout: 10000 });
    });

    if (S.config.paymentMode === 'stripe') {
      try {
        await loadScript('https://js.stripe.com/v3/');
        stripe = window.Stripe(S.config.stripePublishableKey);
        card = stripe.elements({ locale: S.lang === 'uz' ? 'auto' : S.lang }).create('card', { style: { base: { color: '#f4efe9', fontSize: '16px', '::placeholder': { color: '#9b93a6' } } } });
        card.mount('#stripe-card');
      } catch { toast(t('common.error'), 'error'); }
    } else {
      const num = $('#ccNum'); const exp = $('#ccExp'); const cvc = $('#ccCvc'); const name = $('#ccName'); const vis = $('#cardVisual');
      num.addEventListener('input', () => {
        const d = num.value.replace(/\D/g, '').slice(0, 19);
        num.value = d.replace(/(.{4})/g, '$1 ').trim();
        $('#cvNum').textContent = (d.padEnd(16, '•').match(/.{1,4}/g) || []).join(' ');
        $('#cvBrand').textContent = brandOf(d);
      });
      exp.addEventListener('input', () => {
        let d = exp.value.replace(/\D/g, '').slice(0, 4);
        if (d.length >= 3) d = `${d.slice(0, 2)}/${d.slice(2)}`;
        exp.value = d; $('#cvExp').textContent = d || 'MM/YY';
      });
      cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, ''); $('#cvCvc').textContent = '•'.repeat(cvc.value.length) || '•••'; });
      cvc.addEventListener('focus', () => vis.classList.add('flip'));
      cvc.addEventListener('blur', () => vis.classList.remove('flip'));
      name.addEventListener('input', () => { $('#cvName').textContent = name.value.toUpperCase() || 'NAME SURNAME'; });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('.field', form).forEach((f) => f.classList.remove('invalid'));
      const fd = Object.fromEntries(new FormData(form));
      const bad = [];
      if (!fd.name.trim()) bad.push('name');
      if (!/^[+\d][\d\s()-]{5,}$/.test(fd.phone.trim())) bad.push('phone');
      if (!fd.address.trim() && !location) bad.push('address');
      let payment = null;
      if (!card) {
        const n = $('#ccNum').value.replace(/\D/g, '');
        const [mm, yy] = $('#ccExp').value.split('/').map(Number);
        const expOk = mm >= 1 && mm <= 12 && yy >= 0 && new Date(2000 + yy, mm) > new Date();
        if (!luhn(n)) bad.push('#ccNum');
        if (!expOk) bad.push('#ccExp');
        if (!/^\d{3,4}$/.test($('#ccCvc').value)) bad.push('#ccCvc');
        if ($('#ccName').value.trim().length < 2) bad.push('#ccName');
        // Only the brand and last 4 digits are sent. Full number and CVC stay in the browser.
        payment = { mode: 'demo', last4: n.slice(-4), brand: brandOf(n), cardholder: $('#ccName').value.trim() };
      }
      if (bad.length) {
        bad.forEach((b) => { const el = b.startsWith('#') ? $(b) : form.elements[b]; if (el) el.closest('.field').classList.add('invalid'); });
        if (hasGsap) gsap.fromTo('.field.invalid', { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
        return toast(t('checkout.invalid'), 'error');
      }
      const btn = $('#payBtn');
      btn.disabled = true; btn.textContent = t('checkout.processing');
      const items = S.cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size }));
      try {
        if (card) {
          const intent = await api('/payments/intent', { method: 'POST', body: { items } });
          const r = await stripe.confirmCardPayment(intent.clientSecret, { payment_method: { card, billing_details: { name: fd.name } } });
          if (r.error) throw new Error(r.error.message);
          payment = { mode: 'stripe', paymentIntentId: r.paymentIntent.id };
        }
        const res = await api('/orders', { method: 'POST', body: { items, customer: { ...fd, location }, payment, lang: S.lang } });
        cart.clear();
        store.set('lastOrder', { code: res.order.code, phone: fd.phone });
        showSuccess(res.order);
      } catch (err) {
        toast(err.message && !/^[a-z_]+$/.test(err.message) ? err.message : errText(err), 'error');
        btn.disabled = false; btn.textContent = t('checkout.pay', { x: money(cart.totals().total) });
      }
    });
  };

  function showSuccess(order) {
    $('#app').innerHTML = `<section class="container success">
      <div class="steps" style="justify-content:center">${t('checkout.steps').map((s, i) => `<div class="step active"><i>${i + 1}</i>${esc(s)}</div>`).join('')}</div>
      <div class="seal-ok">✓</div>
      <h1 class="h2">${esc(t('checkout.successTitle'))}</h1>
      <p class="muted" style="margin-top:10px">${esc(t('checkout.successText'))}</p>
      <div class="order-code">${esc(order.code)}</div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a class="btn btn-primary" href="#/profile?track=${encodeURIComponent(order.code)}">${esc(t('checkout.track'))}</a>
        <a class="btn btn-ghost" href="#/shop">${esc(t('checkout.continue'))}</a>
      </div></section>`;
    window.scrollTo({ top: 0 });
    if (hasGsap) {
      gsap.from('.seal-ok', { scale: 0, rotate: -180, duration: 0.9, ease: 'back.out(1.7)' });
      gsap.from('.success h1, .success p, .order-code, .success .btn', { y: 30, opacity: 0, stagger: 0.08, delay: 0.3 });
    }
  }

  pages.about = () => `${pageHero('about', '道')}
    <section class="section" style="padding-top:20px"><div class="container about-grid">
      <div><p data-reveal style="font-size:18px">${esc(t('about.p1'))}</p><p class="muted" data-reveal style="margin-top:18px">${esc(t('about.p2'))}</p></div>
      <div class="stat-grid" style="grid-template-columns:1fr 1fr">${[[72, ''], [720, '+'], [15, ''], [250, 'M+']].map(([n, s], i) => `<div class="stat" data-reveal><b><span data-count="${n}">0</span>${s}</b><span class="muted">${esc(t('about.stats')[i])}</span></div>`).join('')}</div>
    </div></section>
    <section class="section"><div class="container about-grid" style="align-items:start">
      <div><span class="eyebrow" data-reveal>${esc(t('about.timeline'))}</span><div class="timeline" style="margin-top:24px">${t('about.tl').map(([y, x]) => `<div class="tl-item" data-reveal><b>${esc(y)}</b><p class="muted">${esc(x)}</p></div>`).join('')}</div></div>
      <div><span class="eyebrow" data-reveal>${esc(t('about.values'))}</span><div class="grid" style="margin-top:24px">${t('about.v').map(([h, x], i) => `<div class="value" data-reveal><div class="k">${['質', '絆', '速'][i]}</div><h3 class="h3">${esc(h)}</h3><p class="muted">${esc(x)}</p></div>`).join('')}</div></div>
    </div></section>`;

  pages.news = () => `${pageHero('news', '報')}<section class="container"><div class="grid grid-3 news-grid">${S.news.map(newsCard).join('')}</div></section>`;

  pages.contacts = () => `${pageHero('contacts', '助')}
    <section class="container contact-grid">
      <div class="grid" style="gap:14px;align-content:start">
        ${t('contacts.info').map(([ic, h, x], i) => `<${i === 1 ? `a href="${botLink()}" target="_blank" rel="noopener"` : 'div'} class="info-card" data-reveal><div class="ic">${ic}</div><div><b>${esc(h)}</b><div class="muted">${esc(x)}</div></div></${i === 1 ? 'a' : 'div'}>`).join('')}
        <div class="faq panel" data-reveal style="margin-top:10px"><h3 class="h3">${esc(t('contacts.faq'))}</h3>${t('contacts.q').map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
      </div>
      <form class="panel" id="supportForm" data-reveal style="align-self:start">
        <h3 class="h3" style="margin-bottom:18px">${esc(t('contacts.form'))}</h3>
        <div class="form-grid">
          <div class="field"><label>${esc(t('contacts.name'))}</label><input name="name" required></div>
          <div class="field"><label>${esc(t('contacts.email'))}</label><input name="email" type="email" required></div>
          <div class="field full"><label>${esc(t('contacts.order'))}</label><input name="order" placeholder="NRT-1001"></div>
          <div class="field full"><label>${esc(t('contacts.message'))}</label><textarea name="message" required></textarea></div>
        </div>
        <button class="btn btn-primary" style="margin-top:18px">${esc(t('common.send'))}</button>
      </form>
    </section>`;
  pages.contacts.mount = () => {
    $('#supportForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      try {
        await api('/support', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        f.reset(); toast(t('contacts.sent'));
      } catch (err) { toast(errText(err), 'error'); }
    });
  };

  // ----- Profile / track -----
  const orderCard = (o) => {
    const flow = ['paid', 'processing', 'shipped', 'delivered'];
    const at = o.status === 'pending' ? -1 : flow.indexOf(o.status);
    return `<div class="order-card" data-reveal>
      <div class="order-head"><div><b class="h3">${esc(o.code)}</b><div class="muted" style="font-size:13px">${esc(t('profile.placed'))} ${date(o.createdAt)} · ${esc(t(`profile.via.${o.source}`))}</div></div>
      <span class="status ${o.status}">${esc(t(`common.status.${o.status}`))}</span></div>
      ${o.status === 'cancelled' ? '' : `<div class="track-line">${flow.map((s, i) => `<div class="${i <= at ? 'done' : ''}">${esc(t(`common.status.${s}`))}</div>`).join('')}</div>`}
      <div class="order-head"><div class="order-items">${o.items.map((i) => `<img src="${esc(i.image)}" alt="" title="${esc(L(i.name))} × ${i.qty}">`).join('')}</div><b class="price">${money(o.total)}</b></div>
    </div>`;
  };

  pages.profile = (_p, query) => {
    const tab = query.get('track') ? 'track' : (S.user ? 'account' : (query.get('tab') || 'login'));
    const last = store.get('lastOrder', {});
    const trackForm = `<form class="panel" id="trackForm" data-reveal>
        <div class="form-grid"><div class="field"><label>${esc(t('profile.code'))}</label><input name="code" required value="${esc(query.get('track') || last.code || '')}"></div>
        <div class="field"><label>${esc(t('profile.phone'))}</label><input name="phone" type="tel" required value="${esc(last.phone || '')}"></div></div>
        <button class="btn btn-primary" style="margin-top:18px">${esc(t('profile.trackBtn'))}</button></form><div id="trackResult" style="margin-top:20px"></div>`;
    const tabs = S.user
      ? [['account', t('profile.myOrders')], ['track', t('profile.track')]]
      : [['login', t('profile.login')], ['register', t('profile.register')], ['track', t('profile.track')]];
    let body = '';
    if (tab === 'track') body = trackForm;
    else if (S.user) {
      body = `<div class="cart-layout">
        <div><h3 class="h3" style="margin-bottom:16px">${esc(t('profile.myOrders'))}</h3><div class="grid" id="myOrders" style="gap:14px"><div class="skeleton" style="min-height:120px"></div></div></div>
        <form class="panel summary" id="meForm" data-reveal><h3 class="h3" style="margin-bottom:6px">${esc(t('profile.welcome'))}, ${esc(S.user.name)}</h3><p class="muted" style="margin-bottom:16px">${esc(S.user.email)}</p>
          <div class="grid" style="gap:12px"><div class="field"><label>${esc(t('profile.name'))}</label><input name="name" value="${esc(S.user.name)}"></div>
          <div class="field"><label>${esc(t('profile.phone'))}</label><input name="phone" value="${esc(S.user.phone)}"></div>
          <div class="field"><label>${esc(t('profile.address'))}</label><input name="address" value="${esc(S.user.address)}"></div></div>
          <button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('common.save'))}</button>
          <button type="button" class="btn btn-ghost btn-block" id="logoutBtn" style="margin-top:10px">${esc(t('profile.logout'))}</button></form></div>`;
    } else {
      const reg = tab === 'register';
      body = `<form class="panel" id="authForm" data-mode="${reg ? 'register' : 'login'}" style="max-width:480px" data-reveal>
        <div class="grid" style="gap:14px">${reg ? `<div class="field"><label>${esc(t('profile.name'))}</label><input name="name" required autocomplete="name"></div>` : ''}
        <div class="field"><label>${esc(t('profile.email'))}</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>${esc(t('profile.password'))}</label><input name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></div></div>
        <button class="btn btn-primary btn-block" style="margin-top:18px">${esc(reg ? t('profile.register') : t('profile.login'))}</button></form>`;
    }
    return `${pageHero('profile', '者')}<section class="container">
      <div class="tabs" data-reveal>${tabs.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="#/profile?tab=${k}">${esc(l)}</a>`).join('')}</div>
      ${body}</section>`;
  };
  pages.profile.mount = async (_p, query) => {
    const trackForm = $('#trackForm');
    if (trackForm) {
      const run = async () => {
        const fd = Object.fromEntries(new FormData(trackForm));
        try {
          const o = await api(`/orders/track?code=${encodeURIComponent(fd.code)}&phone=${encodeURIComponent(fd.phone)}`);
          $('#trackResult').innerHTML = orderCard(o);
          animateIn($$('#trackResult [data-reveal]'));
        } catch { $('#trackResult').innerHTML = `<p class="toast error" style="max-width:none">${esc(t('profile.notFound'))}</p>`; }
      };
      trackForm.addEventListener('submit', (e) => { e.preventDefault(); run(); });
      if (query.get('track') && trackForm.phone.value) run();
    }
    const authForm = $('#authForm');
    if (authForm) {
      const AUTH_ERRORS = {
        email_taken: 'profile.taken', invalid_credentials: 'profile.invalid', invalid_email: 'profile.badEmail',
        password_short: 'profile.shortPassword', name_required: 'errors.name_required', network: 'profile.network',
      };
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mode = authForm.dataset.mode;
        const body = Object.fromEntries(new FormData(authForm));
        body.email = String(body.email || '').trim();
        if (mode === 'register' && !String(body.name || '').trim()) return toast(t('errors.name_required'), 'error');
        if (!/^\S+@\S+\.\S+$/.test(body.email)) return toast(t('profile.badEmail'), 'error');
        if (String(body.password || '').length < 6) return toast(t('profile.shortPassword'), 'error');
        const btn = authForm.querySelector('button');
        btn.disabled = true;
        try {
          S.user = await api(`/auth/${mode}`, { method: 'POST', body });
          toast(mode === 'register' ? t('profile.registered') : `${t('profile.welcome')}, ${S.user.name}`);
          if (location.hash === '#/profile') render();
          else location.hash = '#/profile'; // hashchange re-renders
        } catch (err) {
          btn.disabled = false;
          const key = AUTH_ERRORS[err.message] || (err.status === 429 ? 'profile.tooMany' : 'common.error');
          toast(t(key), 'error');
        }
      });
    }
    const meForm = $('#meForm');
    if (meForm) {
      meForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        S.user = await api('/me', { method: 'PUT', body: Object.fromEntries(new FormData(meForm)) });
        toast(t('common.saved'));
      });
      $('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); S.user = null; render(); });
      try {
        const list = await api('/me/orders');
        $('#myOrders').innerHTML = list.length ? list.map(orderCard).join('') : `<p class="muted">${esc(t('profile.noOrders'))}</p>`;
        animateIn($$('#myOrders [data-reveal]'));
      } catch { $('#myOrders').innerHTML = ''; }
    }
  };

  // ---------- Router ----------
  const routes = { '': 'home', shop: 'shop', product: 'product', watch: 'watch', cart: 'cart', checkout: 'checkout', about: 'about', news: 'news', contacts: 'contacts', profile: 'profile', track: 'profile' };

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { name: routes[parts[0] || ''] || 'home', params: parts.slice(1), query: new URLSearchParams(qs || '') };
  }

  let first = true;
  async function render() {
    const { name, params, query } = parseHash();
    const app = $('#app');
    const draw = () => {
      if (hasGsap && window.ScrollTrigger) ScrollTrigger.getAll().forEach((st) => st.kill());
      app.innerHTML = `<div class="page">${pages[name](params, query)}</div>`;
      $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name || (name === 'product' && a.dataset.route === 'shop')));
      if (pages[name].mount) pages[name].mount(params, query);
      bindCommon();
      if (name === 'home') heroAnim();
      reveal();
      if (!first) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      first = false;
    };
    if (hasGsap && app.innerHTML) gsap.to(app, { opacity: 0, y: 12, duration: 0.18, onComplete: () => { draw(); gsap.fromTo(app, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }); } });
    else draw();
    $('#nav').classList.remove('open'); $('#burger').classList.remove('open');
  }

  // ---------- Animations ----------
  function animateIn(els) {
    if (!hasGsap || !els.length) { els.forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); return; }
    gsap.to(els, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' });
  }
  function reveal() {
    const els = $$('#app [data-reveal]');
    if (!hasGsap || !window.ScrollTrigger) return animateIn(els);
    ScrollTrigger.batch(els, { start: 'top 92%', once: true, onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out' }) });
    ScrollTrigger.refresh();
    $$('[data-count]').forEach((el) => {
      const n = Number(el.dataset.count);
      ScrollTrigger.create({ trigger: el, start: 'top 95%', once: true, onEnter: () => gsap.to({ v: 0 }, { v: n, duration: 1.6, ease: 'power2.out', onUpdate() { el.textContent = Math.round(this.targets()[0].v); } }) });
    });
    const track = $('.marquee-track');
    if (track) gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
  }
  function heroAnim() {
    if (!hasGsap) return;
    const glyphs = $$('.seal-glyphs span');
    glyphs.forEach((g, i) => {
      const a = (i / glyphs.length) * Math.PI * 2;
      gsap.set(g, { x: Math.cos(a) * 46 + '%', y: Math.sin(a) * 46 + '%', xPercent: -50, yPercent: -50 });
    });
    const tl = gsap.timeline({ delay: first ? 0.9 : 0.1 });
    tl.from('.hero-title .line span', { yPercent: 110, duration: 1, stagger: 0.12, ease: 'power4.out' })
      .from('.hero-in', { y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out' }, '-=0.6')
      .from('.seal', { scale: 0.4, opacity: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 0)
      .from('.seal-kanji', { scale: 2.2, opacity: 0, filter: 'blur(20px)', duration: 1.2, ease: 'expo.out' }, 0.2)
      .from('.float-card', { y: 40, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'back.out(1.6)' }, 0.8);
    gsap.to('.seal', { rotate: 360, duration: 40, repeat: -1, ease: 'none' });
    gsap.to('.seal.s2', { rotate: -360, duration: 60, repeat: -1, ease: 'none' });
    gsap.to('.seal-glyphs', { rotate: 360, duration: 50, repeat: -1, ease: 'none' });
    gsap.to('.orbit', { rotate: 360, duration: 6, repeat: -1, ease: 'none' });
    gsap.set('.orbit i', { x: '-0', y: '-46%' });
    gsap.to('.seal-kanji', { textShadow: '0 0 90px rgba(255,122,24,1)', duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to('.fc-1', { y: -14, duration: 2.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to('.fc-2', { y: 14, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const vis = $('.hero-visual');
    if (vis && matchMedia('(pointer:fine)').matches) {
      $('.hero').addEventListener('mousemove', (e) => {
        const r = vis.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        gsap.to('.seal-kanji', { x: dx * 30, y: dy * 30, duration: 0.8 });
        gsap.to('.seal.s3', { x: dx * 16, y: dy * 16, duration: 0.8 });
      });
    }
  }
  function bindTilt() {
    if (!hasGsap || !matchMedia('(pointer:fine)').matches) return;
    $$('[data-tilt]').forEach((card) => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = 1;
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotateY: x * 10, rotateX: -y * 10, y: -6, transformPerspective: 800, duration: 0.4 });
      });
      card.addEventListener('mouseleave', () => gsap.to(card, { rotateY: 0, rotateX: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' }));
    });
  }
  function flyToCart(img) {
    if (!hasGsap || !img) return;
    const r = img.getBoundingClientRect();
    const c = $('.cart-btn').getBoundingClientRect();
    const clone = img.cloneNode();
    Object.assign(clone.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: '20px', zIndex: 400, pointerEvents: 'none' });
    document.body.appendChild(clone);
    gsap.to(clone, { left: c.left, top: c.top, width: 30, height: 30, opacity: 0.4, borderRadius: '50%', duration: 0.8, ease: 'power3.in', onComplete: () => clone.remove() });
  }
  function bindCommon() {
    $$('[data-add]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      cart.add(b.dataset.add, 1, S.products.find((p) => p.id === b.dataset.add)?.category === 'clothing' ? 'M' : undefined);
      flyToCart(b.closest('.product-card')?.querySelector('img'));
      if (hasGsap) gsap.fromTo(b, { scale: 0.8 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    }));
    $$('[data-news]').forEach((c) => c.addEventListener('click', () => {
      const n = S.news.find((x) => x.id === c.dataset.news);
      if (n) modal(`<img src="${esc(n.image)}" alt=""><div class="txt"><time class="accent" style="font-weight:800">${date(n.date)}</time><h2 class="h2" style="margin:8px 0 14px">${esc(L(n.title))}</h2><p class="muted" style="white-space:pre-line">${esc(L(n.body))}</p></div>`);
    }));
    bindTilt();
  }

  // Chakra particles background
  function chakra() {
    const c = $('#chakra');
    const ctx = c.getContext('2d');
    if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let w; let h; let parts = [];
    const resize = () => {
      w = c.width = innerWidth * devicePixelRatio; h = c.height = innerHeight * devicePixelRatio;
      c.style.width = `${innerWidth}px`; c.style.height = `${innerHeight}px`;
      parts = Array.from({ length: Math.min(70, Math.floor(innerWidth / 18)) }, () => spawn(true));
    };
    const spawn = (any) => ({ x: Math.random() * w, y: any ? Math.random() * h : h + 20, r: (Math.random() * 2 + 0.6) * devicePixelRatio, s: (Math.random() * 0.5 + 0.2) * devicePixelRatio, a: Math.random() * 0.6 + 0.2, d: Math.random() * Math.PI * 2 });
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.s; p.d += 0.01; p.x += Math.sin(p.d) * 0.3;
        if (p.y < -20) Object.assign(p, spawn(false));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${120 + Math.floor(p.a * 80)},40,${p.a})`;
        ctx.shadowBlur = 12; ctx.shadowColor = '#ff7a18'; ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    addEventListener('resize', resize);
    resize(); tick();
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ($(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // ---------- Header interactions ----------
  const langEl = $('#lang');
  $('#langBtn').addEventListener('click', (e) => { e.stopPropagation(); langEl.classList.toggle('open'); $('#langBtn').setAttribute('aria-expanded', langEl.classList.contains('open')); });
  document.addEventListener('click', () => langEl.classList.remove('open'));
  $$('.lang-menu li').forEach((li) => li.addEventListener('click', () => {
    S.lang = li.dataset.lang; store.set('lang', S.lang);
    langEl.classList.remove('open'); applyStatic(); render();
  }));
  $('#burger').addEventListener('click', () => { $('#nav').classList.toggle('open'); $('#burger').classList.toggle('open'); });
  addEventListener('scroll', () => $('#header').classList.toggle('scrolled', scrollY > 10), { passive: true });
  addEventListener('hashchange', render);
  $('#year').textContent = new Date().getFullYear();

  // ---------- Boot ----------
  async function boot() {
    chakra();
    if (hasGsap) gsap.to('.loader-bar span', { width: '100%', duration: 0.8, ease: 'power2.inOut' });
    const [config, products, episodes, news, user] = await Promise.all([
      api('/config').catch(() => S.config), api('/products').catch(() => []), api('/episodes').catch(() => []),
      api('/news').catch(() => []), api('/me').catch(() => null),
    ]);
    Object.assign(S.config, config);
    Object.assign(S, { products, episodes, news, user });
    S.cart = S.cart.filter((i) => products.some((p) => p.id === i.id));
    cart.save();
    applyStatic();
    render();
    const loader = $('#loader');
    if (hasGsap) gsap.to(loader, { yPercent: -100, duration: 0.8, delay: 0.3, ease: 'expo.inOut', onComplete: () => loader.remove() });
    else loader.remove();
  }
  boot();
})();
