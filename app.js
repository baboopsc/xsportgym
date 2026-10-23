'use strict';
// Express uygulaması. Sunucuyu başlatmaz (bunu server.js yapar), böylece testlerde de kullanılabilir.
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const ayarlar = require('./lib/ayarlar');
const { pool } = require('./lib/db');
const { guvenlikBasliklari } = require('./lib/guvenlik');
const { oturumuOku } = require('./lib/oturum');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', ayarlar.trustProxy);
app.set('etag', 'strong');

app.use(guvenlikBasliklari);
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());

// Sağlık kontrolü (barındırma servisi için). Veritabanını uyandırmaz; ?db=1 ile veritabanını da kontrol eder.
app.get('/saglik', async (req, res) => {
  if (req.query.db === '1') {
    await pool.query('SELECT 1');
    return res.json({ ok: true, veritabani: 'ok' });
  }
  res.json({ ok: true });
});

app.use('/api', oturumuOku);
app.use('/api', require('./routes/magaza'));
app.use('/api/hesap', require('./routes/hesap'));
app.use('/api/odeme', require('./routes/odeme'));
app.use('/api/siparis', require('./routes/siparis'));
app.use('/api/admin', require('./routes/admin'));
app.use(require('./routes/sayfalar'));

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  index: 'index.html',
  setHeaders(res, dosya) {
    if (dosya.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Bulunamadı
app.use('/api', (req, res) => res.status(404).json({ hata: 'Bulunamadı.' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// Hata yakalayıcı: kullanıcıya iç ayrıntı gösterme, terminale yaz
// eslint-disable-next-line no-unused-vars
app.use((hata, req, res, next) => {
  if (hata.kullaniciMesaji) {
    return res.status(hata.durumKodu || 400).json({ hata: hata.kullaniciMesaji });
  }
  if (hata.type === 'entity.parse.failed') return res.status(400).json({ hata: 'Geçersiz istek.' });
  if (hata.type === 'entity.too.large') return res.status(413).json({ hata: 'Gönderilen veri çok büyük.' });
  console.error(`Beklenmeyen hata (${req.method} ${req.originalUrl}):`, hata);
  if (res.headersSent) return;
  if (req.originalUrl.startsWith('/api')) return res.status(500).json({ hata: 'Bir hata oluştu, lütfen tekrar deneyin.' });
  res.status(500).type('text').send('Bir hata oluştu, lütfen tekrar deneyin.');
});

module.exports = app;
