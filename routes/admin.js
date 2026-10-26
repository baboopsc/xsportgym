'use strict';
// Yönetim paneli API'si. Sadece yönetici hesabıyla giriş yapılınca çalışır.
const express = require('express');
const ayarlar = require('../lib/ayarlar');
const { pool, islem } = require('../lib/db');
const siparis = require('../lib/siparis');
const dogrulama = require('../lib/dogrulama');
const { bosSlugBul } = require('../lib/gocler');
const { istekKontrolu, hizSiniri, belgeBasliklari } = require('../lib/guvenlik');
const { adminGerekli, oturumAc } = require('../lib/oturum');
const hesap = require('../lib/hesap');
const { KullaniciHatasi, tlMetnindenKurus } = require('../lib/yardimci');
const { bakimBilgileri, bakimGoster, BAKIM_ALANLARI } = require('../lib/bakim');

const router = express.Router();

// Giriş artık ortak giriş sayfasından (/giris.html) yapılır. Buradaki her şey yönetici oturumu ister.
router.use(istekKontrolu);
router.use(adminGerekli);

// Yönetici kendi kullanıcı adını ve şifresini değiştirir
router.patch('/hesabim', hizSiniri(15, 10, 'Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.'), async (req, res) => {
  const b = req.body || {};
  if (!b.kullaniciAdi && !b.yeniSifre) throw new KullaniciHatasi('Değişiklik yok.');
  const k = await hesap.yoneticiHesabiniGuncelle(req.kullanici, b);
  oturumAc(res, k);
  res.json({ ok: true, kullaniciAdi: k.kullanici_adi });
});

router.get('/ben', async (req, res) => {
  const uyarilar = [];
  if (ayarlar.iyzico.testModu) uyarilar.push({ tur: 'bilgi', mesaj: 'iyzico TEST modunda. Gerçek ödeme alınmıyor.' });
  if (!ayarlar.eposta.smtpHost) uyarilar.push({ tur: 'uyari', mesaj: 'E-posta ayarlı değil (SMTP). Müşterilere e-posta gitmiyor.' });
  if (ayarlar.isletmeEksikAlanlar.length) {
    uyarilar.push({ tur: 'uyari', mesaj: `isletme-bilgileri.json doldurulmamış: ${ayarlar.isletmeEksikAlanlar.join(', ')}` });
  }
  const { rows: [sayac] } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM eposta_kuyrugu WHERE gonderim IS NULL AND deneme >= 7) AS eposta_hatali,
      (SELECT COUNT(*)::int FROM siparisler WHERE durum = 'inceleme') AS inceleme,
      (SELECT COUNT(*)::int FROM siparisler WHERE stok_uyarisi AND durum IN ('odendi', 'hazirlaniyor', 'inceleme')) AS stok_uyarisi
  `);
  if (sayac.eposta_hatali) uyarilar.push({ tur: 'hata', mesaj: `${sayac.eposta_hatali} e-posta gönderilemedi. SMTP ayarlarını kontrol edin.` });
  if (sayac.inceleme) uyarilar.push({ tur: 'hata', mesaj: `${sayac.inceleme} siparişin ödemesi incelemede. Kargolamadan önce iyzico panelinden kontrol edin.` });
  if (sayac.stok_uyarisi) uyarilar.push({ tur: 'uyari', mesaj: `${sayac.stok_uyarisi} siparişte stok yetersizdi.` });
  res.json({
    ok: true, kullaniciAdi: req.kullanici.kullanici_adi, testModu: ayarlar.iyzico.testModu, uyarilar, durumAdlari: siparis.DURUM_ADLARI,
    gecisler: siparis.ADMIN_GECISLERI, iadeEdilebilir: siparis.IADE_EDILEBILIR
  });
});

// ---------- Siparişler ----------

router.get('/ozet', async (req, res) => {
  const { rows } = await pool.query('SELECT durum, COUNT(*)::int AS adet FROM siparisler GROUP BY durum');
  res.json(Object.fromEntries(rows.map(r => [r.durum, r.adet])));
});

router.get('/siparisler', async (req, res) => {
  const durum = typeof req.query.durum === 'string' ? req.query.durum : '';
  const ara = dogrulama.temizle(typeof req.query.ara === 'string' ? req.query.ara : '').slice(0, 60);
  const kosullar = [];
  const p = [];

  if (durum === '') {
    p.push(['havale-bekleniyor', ...siparis.AKTIF]);
    kosullar.push(`s.durum = ANY($${p.length})`);
  } else if (durum !== 'tum') {
    if (!siparis.DURUM_ADLARI[durum]) throw new KullaniciHatasi('Geçersiz durum.');
    p.push(durum);
    kosullar.push(`s.durum = $${p.length}`);
  }
  if (ara) {
    const rakam = ara.replace(/\D/g, '');
    p.push(`%${ara.replace(/[%_\\]/g, '\\$&')}%`);
    const metin = `$${p.length}`;
    let kosul = `(s.musteri_ad || ' ' || s.musteri_soyad ILIKE ${metin} OR s.email ILIKE ${metin}`;
    if (rakam.length >= 3) {
      p.push(`%${rakam}%`);
      kosul += ` OR s.siparis_no::text LIKE $${p.length} OR s.telefon LIKE $${p.length}`;
    }
    kosullar.push(kosul + ')');
  }

  const { rows } = await pool.query(`
    SELECT s.id, s.siparis_no, s.durum, s.toplam_kurus, s.odenen_kurus, s.taksit,
           s.musteri_ad, s.musteri_soyad, s.email, s.telefon, s.adres, s.sehir, s.ilce, s.posta_kodu,
           s.musteri_notu, s.admin_notu, s.kargo_takip_no, s.stok_uyarisi, (s.odeme_id IS NOT NULL) AS kartla,
           s.olusturma, s.odeme_tarihi, s.kargo_tarihi, s.guncelleme,
           COALESCE(json_agg(json_build_object(
             'urun', k.urun_adi, 'secenek', k.secenek_adi, 'adet', k.adet, 'birimFiyatKurus', k.birim_fiyat_kurus
           ) ORDER BY k.id) FILTER (WHERE k.id IS NOT NULL), '[]') AS kalemler
    FROM siparisler s
    LEFT JOIN siparis_kalemleri k ON k.siparis_id = s.id
    ${kosullar.length ? 'WHERE ' + kosullar.join(' AND ') : ''}
    GROUP BY s.id
    ORDER BY s.olusturma DESC
    LIMIT 200
  `, p);
  res.json(rows);
});

router.get('/siparisler/:id', async (req, res) => {
  const id = dogrulama.uuid(req.params.id);
  const { rows: [s] } = await pool.query(`
    SELECT id, siparis_no, durum, toplam_kurus, odenen_kurus, taksit, odeme_id, odeme_detay, ip,
           musteri_ad, musteri_soyad, email, telefon, adres, sehir, ilce, posta_kodu, musteri_notu, admin_notu,
           kargo_takip_no, stok_uyarisi, olusturma, sozlesme_onay_tarihi, odeme_tarihi, kargo_tarihi,
           teslim_tarihi, iptal_tarihi, iade_kurus, iade_detay, (sozlesme_html IS NOT NULL) AS sozlesme_var
    FROM siparisler WHERE id = $1
  `, [id]);
  if (!s) throw new KullaniciHatasi('Sipariş bulunamadı.', 404);
  const [kalemler, olaylar, epostalar] = await Promise.all([
    siparis.kalemleriGetir(pool, id),
    pool.query('SELECT olay, detay, olusturma FROM siparis_olaylari WHERE siparis_id = $1 ORDER BY id', [id]),
    pool.query('SELECT alici, konu, gonderim, deneme, son_hata, olusturma FROM eposta_kuyrugu WHERE siparis_id = $1 ORDER BY id', [id])
  ]);
  res.json({ ...s, kalemler, olaylar: olaylar.rows, epostalar: epostalar.rows });
});

router.patch('/siparisler/:id', async (req, res) => {
  const b = req.body || {};
  const yeni = await siparis.durumDegistir(req.params.id, {
    durum: b.durum, kargoTakipNo: b.kargoTakipNo, adminNotu: b.adminNotu, elleIade: b.elleIade === true
  });
  res.json({ ok: true, durum: yeni.durum });
});

// İptal et ve parayı iyzico üzerinden müşteriye iade et
router.post('/siparisler/:id/iade', async (req, res) => {
  const yeni = await siparis.iadeEt(req.params.id, req.ip);
  res.json({ ok: true, durum: yeni.durum });
});

// Sonucu belli olmayan bir ödemeyi şimdi iyzico'ya sor
router.post('/siparisler/:id/kontrol', async (req, res) => {
  const id = dogrulama.uuid(req.params.id);
  const { rows: [s] } = await pool.query('SELECT durum, iyzico_token FROM siparisler WHERE id = $1', [id]);
  if (!s) throw new KullaniciHatasi('Sipariş bulunamadı.', 404);
  if (!siparis.ODENMEMIS.includes(s.durum)) throw new KullaniciHatasi('Bu siparişin ödemesi zaten alınmış.');
  if (!s.iyzico_token) throw new KullaniciHatasi('Bu siparişte ödeme sayfası hiç açılmamış.');
  const sonuc = await siparis.odemeyiSonuclandir(s.iyzico_token, 'panel', { suresiDolduysaKapat: true });
  res.json({ ok: true, karar: sonuc?.karar, durum: sonuc?.siparis?.durum });
});

router.get('/siparisler/:id/sozlesme', async (req, res) => {
  const id = dogrulama.uuid(req.params.id);
  const { rows: [s] } = await pool.query('SELECT sozlesme_html FROM siparisler WHERE id = $1', [id]);
  if (!s || !s.sozlesme_html) throw new KullaniciHatasi('Sözleşme bulunamadı.', 404);
  belgeBasliklari(res);
  res.type('html').send(s.sozlesme_html);
});

// ---------- Üyeler ----------

router.get('/uyeler', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT k.id, k.ad, k.soyad, k.email, k.telefon, k.il, k.olusturma, k.son_giris,
      COUNT(s.id) FILTER (WHERE s.odeme_tarihi IS NOT NULL)::int AS siparis_sayisi,
      COALESCE(SUM(s.toplam_kurus) FILTER (WHERE s.odeme_tarihi IS NOT NULL AND s.durum NOT IN ('iptal', 'iade-edildi')), 0)::int AS toplam_kurus
    FROM kullanicilar k LEFT JOIN siparisler s ON s.kullanici_id = k.id
    WHERE k.rol = 'musteri'
    GROUP BY k.id ORDER BY k.olusturma DESC LIMIT 500
  `);
  res.json(rows);
});

// ---------- Ürünler ----------

function urunBilgileri(b, kismi = false) {
  const sonuc = {};
  // Yeni kayıtta ad/kategori/fiyat gibi alanlar zorunlu; aktif ve sıra her zaman isteğe bağlı
  const var_ = alan => (kismi || ['aktif', 'sira'].includes(alan) ? b[alan] !== undefined : true);
  if (var_('ad')) sonuc.ad = dogrulama.metinAlani(b.ad, { ad: 'Ürün adı', min: 2, maks: 100 });
  if (var_('kategori')) sonuc.kategori = dogrulama.metinAlani(b.kategori, { ad: 'Kategori', min: 2, maks: 50 });
  if (var_('aciklama')) sonuc.aciklama = dogrulama.metinAlani(b.aciklama, { ad: 'Açıklama', maks: 5000, zorunlu: false, cokSatirli: true });
  // Latince ad ve bakım bilgileri her zaman isteğe bağlı
  if (b.latinceAd !== undefined) sonuc.latince_ad = dogrulama.metinAlani(b.latinceAd, { ad: 'Slogan', maks: 80, zorunlu: false });
  if (b.bakim !== undefined) sonuc.bakim = JSON.stringify(bakimBilgileri(b.bakim));
  if (var_('aktif')) {
    if (typeof b.aktif !== 'boolean') throw new KullaniciHatasi('Aktif bilgisi geçersiz.');
    sonuc.aktif = b.aktif;
  }
  if (var_('sira')) {
    const sira = Number(b.sira ?? 0);
    if (!Number.isInteger(sira) || sira < 0 || sira > 9999) throw new KullaniciHatasi('Sıra 0 ile 9999 arasında olmalı.');
    sonuc.sira = sira;
  }
  return sonuc;
}

function secenekBilgileri(b, kismi = false) {
  const sonuc = {};
  // Yeni kayıtta ad/kategori/fiyat gibi alanlar zorunlu; aktif ve sıra her zaman isteğe bağlı
  const var_ = alan => (kismi || ['aktif', 'sira'].includes(alan) ? b[alan] !== undefined : true);
  if (var_('ad')) sonuc.ad = dogrulama.metinAlani(b.ad, { ad: 'Seçenek adı', min: 1, maks: 60 });
  if (var_('fiyat')) {
    const kurus = tlMetnindenKurus(b.fiyat);
    if (!Number.isInteger(kurus) || kurus < 100 || kurus > 10000000) {
      throw new KullaniciHatasi('Fiyatı 750 veya 750,50 şeklinde yazın (1 TL ile 100.000 TL arası).');
    }
    sonuc.fiyat_kurus = kurus;
  }
  if (var_('stok')) {
    const stok = Number(b.stok);
    if (!Number.isInteger(stok) || stok < 0 || stok > 100000) throw new KullaniciHatasi('Kontenjan 0 veya daha büyük bir tam sayı olmalı.');
    sonuc.stok = stok;
  }
  if (var_('aktif')) {
    if (typeof b.aktif !== 'boolean') throw new KullaniciHatasi('Aktif bilgisi geçersiz.');
    sonuc.aktif = b.aktif;
  }
  if (var_('sira')) {
    const sira = Number(b.sira ?? 0);
    if (!Number.isInteger(sira) || sira < 0 || sira > 9999) throw new KullaniciHatasi('Sıra geçersiz.');
    sonuc.sira = sira;
  }
  return sonuc;
}

router.get('/urunler', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.slug, u.ad, u.kategori, u.aciklama, u.aktif, u.sira, u.latince_ad AS "latinceAd", u.bakim,
      COALESCE((SELECT json_agg(json_build_object('id', s.id, 'ad', s.ad, 'fiyatKurus', s.fiyat_kurus,
          'stok', s.stok, 'aktif', s.aktif, 'sira', s.sira) ORDER BY s.sira, s.id)
        FROM urun_secenekleri s WHERE s.urun_id = u.id), '[]') AS secenekler,
      COALESCE((SELECT json_agg(g.id ORDER BY g.sira, g.id) FROM urun_gorselleri g WHERE g.urun_id = u.id), '[]') AS gorseller
    FROM urunler u
    ORDER BY u.sira, u.id
  `);
  res.json(rows.map(r => ({ ...r, bakim: bakimGoster(r.bakim) })));
});

// Paneldeki bakım bilgisi alanlarının adları
router.get('/bakim-alanlari', (req, res) => res.json(BAKIM_ALANLARI));

router.get('/kategoriler', async (req, res) => {
  const { rows } = await pool.query('SELECT DISTINCT kategori FROM urunler ORDER BY kategori');
  res.json(rows.map(r => r.kategori));
});

router.post('/urunler', async (req, res) => {
  const u = urunBilgileri(req.body || {});
  const id = await islem(async (client) => {
    const slug = await bosSlugBul(client, u.ad);
    const { rows: [yeni] } = await client.query(`
      INSERT INTO urunler (ad, slug, kategori, aciklama, aktif, sira, latince_ad, bakim)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [u.ad, slug, u.kategori, u.aciklama, u.aktif ?? false, u.sira ?? 0, u.latince_ad ?? '', u.bakim ?? '{}']);
    return yeni.id;
  });
  res.status(201).json({ id });
});

router.patch('/urunler/:id', async (req, res) => {
  const id = dogrulama.pozitifTamSayi(req.params.id, 'Ürün');
  const u = urunBilgileri(req.body || {}, true);
  if (Object.keys(u).length === 0) throw new KullaniciHatasi('Değişiklik yok.');
  await islem(async (client) => {
    const { rows: [eski] } = await client.query('SELECT ad FROM urunler WHERE id = $1 FOR UPDATE', [id]);
    if (!eski) throw new KullaniciHatasi('Ürün bulunamadı.', 404);
    if (u.ad && u.ad !== eski.ad) u.slug = await bosSlugBul(client, u.ad, id);
    if (u.aktif === true) {
      const { rows: [{ adet }] } = await client.query(
        'SELECT COUNT(*)::int AS adet FROM urun_secenekleri WHERE urun_id = $1 AND aktif', [id]);
      if (adet === 0) throw new KullaniciHatasi('Ürünü yayına almak için önce en az bir aktif seçenek (fiyat) ekleyin.');
    }
    const alanlar = Object.keys(u);
    await client.query(
      `UPDATE urunler SET ${alanlar.map((a, i) => `${a} = $${i + 2}`).join(', ')}, guncelleme = NOW() WHERE id = $1`,
      [id, ...alanlar.map(a => u[a])]
    );
  });
  res.json({ ok: true });
});

router.delete('/urunler/:id', async (req, res) => {
  const id = dogrulama.pozitifTamSayi(req.params.id, 'Ürün');
  const { rowCount } = await pool.query('DELETE FROM urunler WHERE id = $1', [id]);
  if (!rowCount) throw new KullaniciHatasi('Ürün bulunamadı.', 404);
  res.json({ ok: true });
});

// ---------- Seçenekler (boy/yaş ve fiyat) ----------

router.post('/urunler/:id/secenekler', async (req, res) => {
  const urunId = dogrulama.pozitifTamSayi(req.params.id, 'Ürün');
  const s = secenekBilgileri(req.body || {});
  const { rows: [u] } = await pool.query('SELECT id FROM urunler WHERE id = $1', [urunId]);
  if (!u) throw new KullaniciHatasi('Ürün bulunamadı.', 404);
  const { rows: [yeni] } = await pool.query(`
    INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok, aktif, sira) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [urunId, s.ad, s.fiyat_kurus, s.stok, s.aktif ?? true, s.sira ?? 0]);
  res.status(201).json({ id: yeni.id });
});

router.patch('/secenekler/:id', async (req, res) => {
  const id = dogrulama.pozitifTamSayi(req.params.id, 'Seçenek');
  const s = secenekBilgileri(req.body || {}, true);
  const alanlar = Object.keys(s);
  if (alanlar.length === 0) throw new KullaniciHatasi('Değişiklik yok.');
  const { rowCount } = await pool.query(
    `UPDATE urun_secenekleri SET ${alanlar.map((a, i) => `${a} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [id, ...alanlar.map(a => s[a])]
  );
  if (!rowCount) throw new KullaniciHatasi('Seçenek bulunamadı.', 404);
  res.json({ ok: true });
});

router.delete('/secenekler/:id', async (req, res) => {
  const id = dogrulama.pozitifTamSayi(req.params.id, 'Seçenek');
  const { rowCount } = await pool.query('DELETE FROM urun_secenekleri WHERE id = $1', [id]);
  if (!rowCount) throw new KullaniciHatasi('Seçenek bulunamadı.', 404);
  res.json({ ok: true });
});

// ---------- Görseller ----------

const MAKS_GORSEL = 12;

// Dosyanın gerçekten resim olduğunu ilk baytlarından kontrol et (uzantıya/başlığa güvenme)
function resimTuru(veri) {
  if (veri.length > 3 && veri[0] === 0xff && veri[1] === 0xd8 && veri[2] === 0xff) return 'image/jpeg';
  if (veri.length > 8 && veri.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (veri.length > 12 && veri.toString('ascii', 0, 4) === 'RIFF' && veri.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

router.post('/urunler/:id/gorseller',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  async (req, res) => {
    const urunId = dogrulama.pozitifTamSayi(req.params.id, 'Ürün');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new KullaniciHatasi('Görsel gönderilmedi.');
    const mime = resimTuru(req.body);
    if (!mime) throw new KullaniciHatasi('Sadece JPEG, PNG veya WebP görsel yüklenebilir.');

    const id = await islem(async (client) => {
      const { rows: [u] } = await client.query('SELECT id FROM urunler WHERE id = $1 FOR UPDATE', [urunId]);
      if (!u) throw new KullaniciHatasi('Ürün bulunamadı.', 404);
      const { rows: [{ adet, sira }] } = await client.query(
        'SELECT COUNT(*)::int AS adet, COALESCE(MAX(sira), -1) + 1 AS sira FROM urun_gorselleri WHERE urun_id = $1', [urunId]);
      if (adet >= MAKS_GORSEL) throw new KullaniciHatasi(`Bir pakete en fazla ${MAKS_GORSEL} görsel eklenebilir.`);
      const { rows: [yeni] } = await client.query(
        'INSERT INTO urun_gorselleri (urun_id, mime, veri, boyut, sira) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [urunId, mime, req.body, req.body.length, sira]);
      return yeni.id;
    });
    res.status(201).json({ id });
  });

router.delete('/gorseller/:id', async (req, res) => {
  const id = dogrulama.pozitifTamSayi(req.params.id, 'Görsel');
  const { rowCount } = await pool.query('DELETE FROM urun_gorselleri WHERE id = $1', [id]);
  if (!rowCount) throw new KullaniciHatasi('Görsel bulunamadı.', 404);
  res.json({ ok: true });
});

// İlk görsel kapak fotoğrafıdır
router.put('/urunler/:id/gorsel-sirasi', async (req, res) => {
  const urunId = dogrulama.pozitifTamSayi(req.params.id, 'Ürün');
  const idler = req.body?.idler;
  if (!Array.isArray(idler) || idler.length > MAKS_GORSEL || !idler.every(i => Number.isSafeInteger(i) && i > 0)) {
    throw new KullaniciHatasi('Geçersiz sıralama.');
  }
  await islem(async (client) => {
    const { rows } = await client.query('SELECT id FROM urun_gorselleri WHERE urun_id = $1', [urunId]);
    const mevcut = new Set(rows.map(r => r.id));
    if (idler.length !== mevcut.size || !idler.every(i => mevcut.has(i))) throw new KullaniciHatasi('Görsel listesi güncel değil, sayfayı yenileyin.', 409);
    for (const [sira, id] of idler.entries()) {
      await client.query('UPDATE urun_gorselleri SET sira = $2 WHERE id = $1', [id, sira]);
    }
  });
  res.json({ ok: true });
});

module.exports = router;
