// Minimal Telegram Bot API client built on Node's native fetch (Node 18+). No extra dependencies.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const BASE = () => `https://api.telegram.org/bot${config.botToken}`;

async function call(method, params = {}) {
  const res = await fetch(`${BASE()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({ ok: false, description: 'bad_json' }));
  if (!json.ok) {
    const err = new Error(`${method}: ${json.description || res.status}`);
    err.code = json.error_code;
    throw err;
  }
  return json.result;
}

// Map a site path ("/img/a.png", "/uploads/b.mp4") to a file on disk, or null for remote URLs.
function localFile(p) {
  if (!p || /^https?:\/\//i.test(p)) return null;
  const clean = decodeURIComponent(p.split('?')[0]);
  const base = clean.startsWith('/uploads/') ? config.uploadsDir : config.publicDir;
  const rel = clean.startsWith('/uploads/') ? clean.slice('/uploads/'.length) : clean.replace(/^\//, '');
  const full = path.resolve(base, rel);
  if (!full.startsWith(path.resolve(base))) return null; // path traversal guard
  return fs.existsSync(full) ? full : null;
}

// Send a method that takes a file. `media` may be a Telegram file_id, an http(s) URL or a local site path.
async function sendFile(method, field, media, params = {}) {
  const file = localFile(media);
  if (!file) return call(method, { ...params, [field]: media });
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const buf = await fs.promises.readFile(file);
  form.append(field, new Blob([buf]), path.basename(file));
  const res = await fetch(`${BASE()}/${method}`, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({ ok: false, description: 'bad_json' }));
  if (!json.ok) throw new Error(`${method}: ${json.description || res.status}`);
  return json.result;
}

const fileSize = (media) => {
  const f = localFile(media);
  return f ? fs.statSync(f).size : null;
};

module.exports = { call, sendFile, localFile, fileSize };
