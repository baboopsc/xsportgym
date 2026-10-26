'use strict';
// Sunucuda oluşturulan sayfalar: yasal metinler ve siparişe özel sözleşme kopyası
const path = require('path');
const express = require('express');
const ayarlar = require('../lib/ayarlar');
const siparis = require('../lib/siparis');
const { GENEL_SAYFALAR } = require('../lib/sozlesmeler');
const { belgeBasliklari } = require('../lib/guvenlik');
const { esc } = require('../lib/yardimci');

const router = express.Router();

function sayfaHtml(baslik, icerik) {
  // Metnin kendi başlığı sayfanın üstünde büyük olarak gösterilir
  const govde = icerik.replace(/^\s*<h2>[\s\S]*?<\/h2>/, '');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(baslik)} | ${esc(ayarlar.isletme.marka)}</title>
  <meta name="theme-color" content="#f2efe9">
  <link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">
  <link rel="stylesheet" href="/css/site.css">
  <script src="/js/bas.js"></script>
</head>
<body>
  <header id="ust"></header>
  <main>
    <section class="kap yasal-sayfa sayfa-basi sade">
      <div class="sayfa-basi__kart">
        <nav class="yol" aria-label="Konum"><a href="/">Ana Sayfa</a><i data-ikon="sag"></i><span>Bilgilendirme</span></nav>
        <h1>${esc(baslik)}</h1>
      </div>
    </section>
    <div class="kap yasal-sayfa">
      <article class="yasal kart">
        ${govde}
      </article>
    </div>
  </main>
  <footer id="alt"></footer>
  <script src="/js/ikonlar.js"></script>
  <script src="/js/gorseller.js"></script>
  <script src="/js/ortak.js"></script>
</body>
</html>`;
}

// Instagram bio linki: /link (taplink yerine)
router.get('/link', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'link.html'));
});

router.get('/sayfa/:ad', (req, res, next) => {
  const sayfa = Object.hasOwn(GENEL_SAYFALAR, req.params.ad) ? GENEL_SAYFALAR[req.params.ad] : null;
  if (!sayfa) return next();
  res.type('html').send(sayfaHtml(sayfa.baslik, sayfa.icerik()));
});

// Müşterinin onayladığı sözleşmenin değişmeyen kopyası
router.get('/siparis/:no/sozlesme', async (req, res, next) => {
  const sonuc = await siparis.musteriSiparisi(req.params.no, req.query.k);
  if (!sonuc || !sonuc.siparis.sozlesme_html) return next();
  belgeBasliklari(res);
  res.type('html').send(sonuc.siparis.sozlesme_html);
});

module.exports = router;
