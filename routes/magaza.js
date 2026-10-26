'use strict';
// Herkese açık mağaza API'si: ürünler, görseller, sepet fiyatı, sözleşme önizlemesi
const express = require('express');
const ayarlar = require('../lib/ayarlar');
const { pool } = require('../lib/db');
const iller = require('../lib/iller');
const dogrulama = require('../lib/dogrulama');
const siparis = require('../lib/siparis');
const { onBilgilendirme, mesafeliSatis } = require('../lib/sozlesmeler');
const { KullaniciHatasi } = require('../lib/yardimci');
const { bakimGoster } = require('../lib/bakim');

const router = express.Router();

// Sitenin altında ve iletişim sayfasında gösterilen bilgiler
router.get('/isletme', (req, res) => {
  const i = ayarlar.isletme;
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    marka: i.marka, unvan: i.unvan, adres: i.adres, telefon: i.telefon, eposta: i.eposta,
    whatsapp: i.whatsapp || null, kargoFirmasi: i.kargoFirmasi, kargoyaVerilmeSuresi: i.kargoyaVerilmeSuresi,
    calismaSaatleri: i.calismaSaatleri, haritaLinki: i.haritaLinki || null, instagram: i.instagram || null,
    kurucuInstagram: i.kurucuInstagram || null, testModu: ayarlar.iyzico.testModu,
    odemeYontemi: ayarlar.odemeYontemi
  });
});

router.get('/iller', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(iller);
});

// Stok müşteriye tam sayı olarak gösterilmez (en fazla 10)
const stokGoster = stok => Math.min(stok, 10);

router.get('/urunler', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.slug, u.ad, u.kategori, u.aciklama, u.latince_ad, u.bakim,
      (SELECT g.id FROM urun_gorselleri g WHERE g.urun_id = u.id ORDER BY g.sira, g.id LIMIT 1) AS gorsel_id,
      MIN(s.fiyat_kurus) AS en_dusuk_kurus,
      MAX(s.stok) AS en_cok_stok,
      COUNT(s.id)::int AS secenek_sayisi
    FROM urunler u
    JOIN urun_secenekleri s ON s.urun_id = u.id AND s.aktif
    WHERE u.aktif
    GROUP BY u.id
    ORDER BY u.sira, u.id
  `);
  res.json(rows.map(r => ({
    id: r.id, slug: r.slug, ad: r.ad, kategori: r.kategori, latinceAd: r.latince_ad,
    bakim: bakimGoster(r.bakim),
    kisaAciklama: r.aciklama.slice(0, 160),
    gorselId: r.gorsel_id,
    enDusukFiyatKurus: r.en_dusuk_kurus,
    secenekSayisi: r.secenek_sayisi,
    stokta: r.en_cok_stok > 0
  })));
});

router.get('/urunler/:slug', async (req, res) => {
  const slug = String(req.params.slug);
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) throw new KullaniciHatasi('Ürün bulunamadı.', 404);
  const { rows: [u] } = await pool.query('SELECT id, slug, ad, kategori, aciklama, latince_ad, bakim FROM urunler WHERE slug = $1 AND aktif', [slug]);
  if (!u) throw new KullaniciHatasi('Ürün bulunamadı.', 404);

  const [{ rows: secenekler }, { rows: gorseller }] = await Promise.all([
    pool.query('SELECT id, ad, fiyat_kurus, stok FROM urun_secenekleri WHERE urun_id = $1 AND aktif ORDER BY sira, fiyat_kurus, id', [u.id]),
    pool.query('SELECT id FROM urun_gorselleri WHERE urun_id = $1 ORDER BY sira, id', [u.id])
  ]);
  if (secenekler.length === 0) throw new KullaniciHatasi('Ürün bulunamadı.', 404);

  res.json({
    id: u.id, slug: u.slug, ad: u.ad, kategori: u.kategori, aciklama: u.aciklama,
    latinceAd: u.latince_ad, bakim: bakimGoster(u.bakim),
    gorseller: gorseller.map(g => g.id),
    secenekler: secenekler.map(s => ({ id: s.id, ad: s.ad, fiyatKurus: s.fiyat_kurus, stok: stokGoster(s.stok) }))
  });
});

// Ürün fotoğrafı. Bir görselin içeriği hiç değişmediği (sadece eklenip silindiği) için uzun süre önbelleklenir.
router.get('/gorsel/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).end();
  const etag = `"g${id}"`;
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  const { rows: [g] } = await pool.query('SELECT mime, veri FROM urun_gorselleri WHERE id = $1', [id]);
  if (!g) return res.status(404).end();
  res.set({
    'Content-Type': g.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': etag,
    'Cross-Origin-Resource-Policy': 'same-site'
  });
  res.send(g.veri);
});

// Sepetteki ürünlerin güncel fiyatı ve stok durumu (sepet ve ödeme sayfası kullanır)
router.post('/sepet/fiyatla', async (req, res) => {
  const adetler = dogrulama.sepet(req.body?.sepet);
  const sonuc = await siparis.sepetiFiyatla(pool, adetler);
  res.json({
    kalemler: sonuc.kalemler.map(k => ({
      secenekId: k.secenekId, urunAdi: k.urunAdi, secenekAdi: k.secenekAdi, slug: k.slug, gorselId: k.gorselId,
      birimFiyatKurus: k.birimFiyatKurus, adet: k.adet, satirKurus: k.satirKurus, stok: stokGoster(k.stok)
    })),
    toplamKurus: sonuc.toplamKurus,
    sorunlar: sonuc.sorunlar
  });
});

// Ödeme sayfasında, ödemeden ÖNCE gösterilen ve müşterinin bilgileriyle doldurulmuş sözleşmeler
router.post('/sozlesme/onizleme', async (req, res) => {
  const adetler = dogrulama.sepet(req.body?.sepet);
  const fiyat = await siparis.sepetiFiyatla(pool, adetler);
  const m = req.body?.musteri && typeof req.body.musteri === 'object' ? req.body.musteri : {};
  const musteri = {};
  for (const alan of ['ad', 'soyad', 'email', 'telefon', 'il', 'ilce', 'adres', 'postaKodu']) {
    musteri[alan] = dogrulama.temizle(m[alan], alan === 'adres').slice(0, 300);
  }
  const veri = { musteri, kalemler: fiyat.kalemler, toplamKurus: fiyat.toplamKurus };
  res.json({ html: `${onBilgilendirme(veri)}<hr>${mesafeliSatis(veri)}` });
});

module.exports = router;
