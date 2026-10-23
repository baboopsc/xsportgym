'use strict';
// Müşterinin kendi siparişini görmesi
const express = require('express');
const siparis = require('../lib/siparis');
const { hizSiniri } = require('../lib/guvenlik');
const { KullaniciHatasi } = require('../lib/yardimci');

const router = express.Router();
const sinir = hizSiniri(15, 60, 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.');

// Linkteki gizli kodla (e-postadaki "Siparişimi takip et" butonu)
router.get('/:no', sinir, async (req, res) => {
  const sonuc = await siparis.musteriSiparisi(req.params.no, req.query.k, { tazele: true });
  if (!sonuc) throw new KullaniciHatasi('Sipariş bulunamadı.', 404);
  res.set('Cache-Control', 'private, no-store');
  res.json(sonuc.gorunum);
});

// Sipariş no + e-posta ile sorgulama
router.post('/sorgula', sinir, async (req, res) => {
  const sonuc = await siparis.siparisSorgula(req.body?.siparisNo, req.body?.email);
  if (!sonuc) throw new KullaniciHatasi('Bu bilgilerle bir sipariş bulunamadı. Sipariş numarasını ve e-posta adresini kontrol edin.', 404);
  res.json(sonuc);
});

module.exports = router;
