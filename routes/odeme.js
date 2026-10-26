'use strict';
const express = require('express');
const ayarlar = require('../lib/ayarlar');
const siparis = require('../lib/siparis');
const { hizSiniri } = require('../lib/guvenlik');

const router = express.Router();

// 1) Müşteri "Ödemeye geç"e bastı: siparişi kaydet, iyzico ödeme sayfasını aç
router.post('/baslat',
  hizSiniri(10, ayarlar.odemeBaslatmaLimiti, 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.'),
  async (req, res) => {
    const govde = req.body || {};
    const yeni = await siparis.siparisOlustur({
      sepet: govde.sepet,
      musteri: govde.musteri,
      sozlesmeOnay: govde.sozlesmeOnay,
      ip: req.ip,
      // Üye girişi yapılmışsa sipariş hesaba bağlanır (üye olmadan da sipariş verilebilir)
      kullaniciId: req.kullanici && req.kullanici.rol === 'musteri' ? req.kullanici.id : null,
      adresiKaydet: govde.adresiKaydet === true
    });
    if (ayarlar.odemeYontemi === 'havale') {
      const s = await siparis.havaleSiparisi(yeni);
      const yonlendir = `/siparis.html?no=${encodeURIComponent(s.siparis_no)}&k=${encodeURIComponent(s.takip_kodu)}&yeni=1`;
      return res.json({ yonlendir, siparisNo: String(s.siparis_no) });
    }
    const odemeUrl = await siparis.odemeBaslat(yeni, req.ip);
    res.json({ odemeUrl, siparisNo: String(yeni.siparis.siparis_no) });
  });

// 2) iyzico müşteriyi buraya geri gönderir (form POST, içinde sadece token var).
//    Ödemenin sonucu tarayıcıdan gelen bilgiye göre DEĞİL, iyzico'ya sorularak belirlenir.
router.post('/sonuc', async (req, res) => {
  const token = req.body && req.body.token;
  let sonuc = null;
  try {
    sonuc = await siparis.odemeyiSonuclandir(token, 'callback');
  } catch (hata) {
    console.error('Ödeme sonucu işlenemedi:', hata.message);
  }
  if (!sonuc) return res.redirect(303, '/basarisiz.html');

  const s = sonuc.siparis;
  const sorgu = `no=${encodeURIComponent(s.siparis_no)}&k=${encodeURIComponent(s.takip_kodu)}`;
  if (s.durum === 'odeme-basarisiz' || s.durum === 'terk-edildi' || s.durum === 'baslatilamadi') {
    return res.redirect(303, `/basarisiz.html?${sorgu}`);
  }
  // Ödendi, incelemede veya sonucu henüz belli değil: sipariş sayfası durumu gösterir
  res.redirect(303, `/basarili.html?${sorgu}`);
});

// 3) iyzico'nun sunucudan sunucuya bildirimi (webhook). iyzico panelinde
//    Ayarlar > Firma Ayarları > İşyeri Bildirimleri kısmına https://SITENIZ/api/odeme/bildirim yazılır.
//    Bildirimin içeriğine güvenilmez: sadece token alınır ve sonuç yine iyzico'ya sorulur.
//    Bu yüzden imza kontrolü gerekmez; sahte bir bildirim hiçbir şeyi değiştiremez.
router.post('/bildirim', async (req, res) => {
  const token = req.body && typeof req.body.token === 'string' ? req.body.token : null;
  if (token) {
    try {
      await siparis.odemeyiSonuclandir(token, 'bildirim');
    } catch (hata) {
      console.error('iyzico bildirimi işlenemedi:', hata.message);
      return res.status(500).json({ ok: false }); // iyzico 15 dk sonra tekrar dener
    }
  }
  res.json({ ok: true });
});

module.exports = router;
