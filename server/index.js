const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');

db.load();
fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));
app.use('/admin', express.static(path.join(config.publicDir, 'admin')));
app.use(express.static(config.publicDir, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[server]', err.message);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'server_error' });
});

app.listen(config.port, () => {
  console.log(`\n🍥 Naruto Anime & Shop running at ${config.publicUrl}`);
  console.log(`   Admin panel: ${config.publicUrl}/admin  (login: ${config.adminEmail})\n`);
  require('./telegram/bot').start();
});

const shutdown = () => { db.flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
