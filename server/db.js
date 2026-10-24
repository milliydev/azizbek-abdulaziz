1// Tiny JSON-file database with atomic writes. No native modules — runs anywhere Node runs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { buildSeed } = require('./seed');

const COLLECTIONS = ['products', 'episodes', 'news', 'orders', 'users', 'messages'];
let data = null;
let saveTimer = null;

function load() {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  if (!fs.existsSync(config.dataFile)) {
    data = buildSeed();
    flush();
    console.log('[db] created data/db.json with demo content');
  } else {
    data = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
  }
  for (const c of COLLECTIONS) data[c] = data[c] || [];
  data.tgUsers = data.tgUsers || {};
  data.counters = data.counters || { order: 1000 };
  return data;
}

function flush() {
  const tmp = config.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, config.dataFile);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 50);
}

const id = () => crypto.randomBytes(6).toString('hex');

const db = {
  load,
  flush,
  save,
  id,
  get raw() { return data; },
  all(col) { return data[col]; },
  find(col, itemId) { return data[col].find((x) => x.id === itemId); },
  insert(col, obj) {
    const item = { id: id(), createdAt: new Date().toISOString(), ...obj };
    data[col].push(item);
    save();
    return item;
  },
  update(col, itemId, patch) {
    const item = db.find(col, itemId);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    save();
    return item;
  },
  remove(col, itemId) {
    const i = data[col].findIndex((x) => x.id === itemId);
    if (i === -1) return false;
    data[col].splice(i, 1);
    save();
    return true;
  },
  nextOrderCode() {
    data.counters.order += 1;
    save();
    return 'NRT-' + data.counters.order;
  },
  tgUser(tgId) {
    const k = String(tgId);
    if (!data.tgUsers[k]) data.tgUsers[k] = { lang: null, cart: [], state: null, draft: {} };
    return data.tgUsers[k];
  },
};

module.exports = db;
