'use strict';
// Giriş, üyelik ve "Hesabım" sayfası API'si
const express = require('express');
const { pool } = require('../lib/db');
const hesap = require('../lib/hesap');
const siparis = require('../lib/siparis');
const { oturumAc, oturumKapat, girisGerekli } = require('../lib/oturum');
const { istekKontrolu, hizSiniri } = require('../lib/guvenlik');

const router = express.Router();
router.use(istekKontrolu);

// Her işlemin kendi sayacı var (şifre denemelerine karşı)
const girisSiniri = () => hizSiniri(15, 10, 'Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.');

router.get('/ben', (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(req.kullanici ? { girisli: true, kullanici: hesap.gorunum(req.kullanici) } : { girisli: false });
});

router.post('/giris', girisSiniri(), async (req, res) => {
  const k = await hesap.girisYap(req.body?.kimlik, req.body?.sifre);
  oturumAc(res, k);
  res.json({ ok: true, rol: k.rol });
});

router.post('/kayit', hizSiniri(60, 5, 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.'), async (req, res) => {
  const k = await hesap.kayitOl(req.body);
  oturumAc(res, k);
  res.status(201).json({ ok: true, rol: k.rol });
});

router.post('/cikis', (req, res) => {
  oturumKapat(res);
  res.json({ ok: true });
});

router.post('/sifremi-unuttum', hizSiniri(60, 5, 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.'), async (req, res) => {
  await hesap.sifremiUnuttum(req.body?.email);
  res.json({ ok: true }); // e-posta kayıtlı olsun olmasın aynı cevap
});

router.post('/sifre-sifirla', girisSiniri(), async (req, res) => {
  const k = await hesap.sifreyiSifirla(req.body?.kod, req.body?.sifre);
  oturumAc(res, k);
  res.json({ ok: true, rol: k.rol });
});

// ---------- Giriş yapmış kullanıcı ----------

router.patch('/bilgiler', girisGerekli, async (req, res) => {
  const k = await hesap.bilgileriGuncelle(req.kullanici, req.body);
  res.json({ ok: true, kullanici: hesap.gorunum(k) });
});

router.post('/sifre-degistir', girisGerekli, girisSiniri(), async (req, res) => {
  const k = await hesap.sifreDegistir(req.kullanici, req.body?.mevcutSifre, req.body?.yeniSifre);
  oturumAc(res, k); // bu cihazda açık kalsın, diğerleri kapansın
  res.json({ ok: true });
});

router.get('/siparislerim', girisGerekli, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.siparis_no, s.takip_kodu, s.durum, s.toplam_kurus, s.olusturma, s.kargo_takip_no,
      COALESCE(json_agg(json_build_object('urun', k.urun_adi, 'secenek', k.secenek_adi, 'adet', k.adet) ORDER BY k.id)
        FILTER (WHERE k.id IS NOT NULL), '[]') AS kalemler
    FROM siparisler s LEFT JOIN siparis_kalemleri k ON k.siparis_id = s.id
    WHERE s.kullanici_id = $1 AND s.durum NOT IN ('baslatilamadi', 'terk-edildi', 'odeme-basarisiz')
    GROUP BY s.id ORDER BY s.olusturma DESC LIMIT 100
  `, [req.kullanici.id]);
  res.set('Cache-Control', 'private, no-store');
  res.json(rows.map(r => ({
    siparisNo: String(r.siparis_no), k: r.takip_kodu, durum: r.durum,
    durumAdi: siparis.MUSTERI_DURUM_ADLARI[r.durum] || r.durum,
    toplamKurus: r.toplam_kurus, tarih: r.olusturma, kargoTakipNo: r.kargo_takip_no, kalemler: r.kalemler
  })));
});

router.delete('/', girisGerekli, girisSiniri(), async (req, res) => {
  await hesap.hesabiSil(req.kullanici, req.body?.sifre);
  oturumKapat(res);
  res.json({ ok: true });
});

module.exports = router;
