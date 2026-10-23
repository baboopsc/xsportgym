'use strict';
// Siparişin bütün iş kuralları burada: oluşturma, ödeme başlatma, ödemeyi doğrulama,
// stok, durum değişiklikleri ve e-postalar. Route dosyaları sadece bu fonksiyonları çağırır.
const crypto = require('crypto');
const ayarlar = require('./ayarlar');
const { pool, islem } = require('./db');
const iyzico = require('./iyzico');
const eposta = require('./eposta');
const sablon = require('./eposta-sablonlari');
const { siparisSozlesmeBelgesi } = require('./sozlesmeler');
const dogrulama = require('./dogrulama');
const {
  KullaniciHatasi, kurustanIyzico, iyzicodanKurus, rastgeleKod, ipDuzelt, tl, guvenliEsit
} = require('./yardimci');

// Parası alınmış ve henüz iade edilmemiş siparişler
const IADE_EDILEBILIR = ['inceleme', 'odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi'];

// Online koçluk satışı: iç durum adları (veritabanındaki değerler) Özyurt'tan kaldı, görünen adlar koçluğa göre.
//   odendi        -> yeni öğrenci, henüz iletişime geçilmedi
//   hazirlaniyor  -> öğrenciyle konuşuldu, program hazırlanıyor
//   kargoda       -> program gönderildi, koçluk sürüyor
//   teslim-edildi -> koçluk süresi bitti
const DURUM_ADLARI = {
  'odeme-bekliyor': 'Ödeme bekleniyor',
  'baslatilamadi': 'Ödeme başlatılamadı',
  'odeme-basarisiz': 'Ödeme başarısız',
  'terk-edildi': 'Yarım kaldı',
  'inceleme': 'İncelemede',
  'odendi': 'Yeni öğrenci',
  'hazirlaniyor': 'Program hazırlanıyor',
  'kargoda': 'Koçluk sürüyor',
  'teslim-edildi': 'Tamamlandı',
  'iptal': 'İptal edildi',
  'iade-edildi': 'İade edildi'
};

// Müşteriye gösterilen adlar
const MUSTERI_DURUM_ADLARI = {
  ...DURUM_ADLARI,
  'odeme-bekliyor': 'Ödeme kontrol ediliyor',
  'inceleme': 'Ödeme kontrol ediliyor',
  'odendi': 'Ödeme alındı',
  'kargoda': 'Koçluk başladı'
};

const ODENMEMIS = ['odeme-bekliyor', 'baslatilamadi', 'odeme-basarisiz', 'terk-edildi'];
const AKTIF = ['inceleme', 'odendi', 'hazirlaniyor', 'kargoda'];

// Panelden yapılabilecek durum değişiklikleri
const ADMIN_GECISLERI = {
  'inceleme': ['odendi', 'iptal'],
  'odendi': ['hazirlaniyor', 'kargoda', 'iptal'],
  'hazirlaniyor': ['kargoda', 'iptal'],
  'kargoda': ['teslim-edildi', 'iptal'],
  'teslim-edildi': ['iade-edildi']
};
// Bu durumlardan iptal edilince koçluk başlamamıştır, kontenjan (stok) geri eklenir
const STOK_IADE_DURUMLARI = ['inceleme', 'odendi', 'hazirlaniyor'];

// isler.js tarafından bağlanır (dosyalar birbirini döngüsel çağırmasın diye)
let epostaGonderiminiTetikle = () => {};
let odemeKontrolunuPlanla = () => {};
function tetikleyicileriAyarla({ epostaTetikle, odemeKontrolPlanla }) {
  if (epostaTetikle) epostaGonderiminiTetikle = epostaTetikle;
  if (odemeKontrolPlanla) odemeKontrolunuPlanla = odemeKontrolPlanla;
}

async function olayEkle(db, siparisId, olay, detay = {}) {
  await db.query(
    'INSERT INTO siparis_olaylari (siparis_id, olay, detay) VALUES ($1, $2, $3)',
    [siparisId, olay, JSON.stringify(detay)]
  );
}

// ---------- Sepet ----------

// Fiyatları ve stoğu her zaman veritabanından alır. adetler: Map(secenekId -> adet)
async function sepetiFiyatla(db, adetler) {
  const idler = [...adetler.keys()];
  const { rows } = await db.query(`
    SELECT s.id, s.ad AS secenek_adi, s.fiyat_kurus, s.stok,
           u.id AS urun_id, u.ad AS urun_adi, u.kategori, u.slug,
           (SELECT g.id FROM urun_gorselleri g WHERE g.urun_id = u.id ORDER BY g.sira, g.id LIMIT 1) AS gorsel_id
    FROM urun_secenekleri s
    JOIN urunler u ON u.id = s.urun_id
    WHERE s.id = ANY($1::int[]) AND s.aktif AND u.aktif
  `, [idler]);
  const bulunan = new Map(rows.map(r => [r.id, r]));

  const kalemler = [];
  const sorunlar = [];
  let toplamKurus = 0;
  for (const [secenekId, adet] of adetler) {
    const r = bulunan.get(secenekId);
    if (!r) {
      sorunlar.push({ secenekId, mesaj: 'Sepetinizdeki bir paket artık satışta değil. Lütfen sepetinizi kontrol edin.' });
      continue;
    }
    if (r.stok < adet) {
      sorunlar.push({
        secenekId,
        mesaj: r.stok > 0
          ? `${r.urun_adi} (${r.secenek_adi}) için ${r.stok} kontenjan kaldı.`
          : `${r.urun_adi} (${r.secenek_adi}) için kontenjan doldu.`
      });
    }
    const satirKurus = r.fiyat_kurus * adet;
    toplamKurus += satirKurus;
    kalemler.push({
      secenekId, urunId: r.urun_id, urunAdi: r.urun_adi, secenekAdi: r.secenek_adi, kategori: r.kategori,
      slug: r.slug, gorselId: r.gorsel_id, birimFiyatKurus: r.fiyat_kurus, adet, satirKurus, stok: r.stok
    });
  }
  return { kalemler, toplamKurus, sorunlar };
}

// ---------- 1) Sipariş oluştur ----------

async function siparisOlustur({ sepet, musteri, sozlesmeOnay, ip, kullaniciId = null, adresiKaydet = false }) {
  const adetler = dogrulama.sepet(sepet);
  const m = dogrulama.musteriBilgileri(musteri);
  if (sozlesmeOnay !== true) {
    throw new KullaniciHatasi('Devam etmek için Ön Bilgilendirme Formu ile Mesafeli Satış Sözleşmesini onaylamanız gerekir.');
  }

  const fiyat = await sepetiFiyatla(pool, adetler);
  if (fiyat.sorunlar.length) throw new KullaniciHatasi(fiyat.sorunlar[0].mesaj, 409);

  const id = crypto.randomUUID();
  return islem(async (client) => {
    const { rows: [siparis] } = await client.query(`
      INSERT INTO siparisler (
        id, durum, toplam_kurus, musteri_ad, musteri_soyad, email, telefon,
        adres, sehir, ilce, posta_kodu, musteri_notu, ip, takip_kodu, sozlesme_onay_tarihi, kullanici_id
      ) VALUES ($1, 'odeme-bekliyor', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
      RETURNING *
    `, [id, fiyat.toplamKurus, m.ad, m.soyad, m.email, m.telefon, m.adres, m.il, m.ilce,
      m.postaKodu, m.not, ipDuzelt(ip), rastgeleKod(20), kullaniciId]);

    if (kullaniciId && adresiKaydet === true) await require('./hesap').adresiKaydet(client, kullaniciId, m);

    for (const k of fiyat.kalemler) {
      await client.query(`
        INSERT INTO siparis_kalemleri (siparis_id, secenek_id, urun_adi, secenek_adi, birim_fiyat_kurus, adet)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, k.secenekId, k.urunAdi, k.secenekAdi, k.birimFiyatKurus, k.adet]);
    }

    // Müşterinin onayladığı sözleşmenin değişmeyecek kopyası
    siparis.sozlesme_html = siparisSozlesmeBelgesi({
      musteri: m, kalemler: fiyat.kalemler, toplamKurus: fiyat.toplamKurus,
      siparisNo: siparis.siparis_no, tarih: siparis.olusturma
    });
    await client.query('UPDATE siparisler SET sozlesme_html = $2 WHERE id = $1', [id, siparis.sozlesme_html]);
    await olayEkle(client, id, 'siparis-olusturuldu', { toplam: tl(fiyat.toplamKurus), urunSayisi: fiyat.kalemler.length });

    return { siparis, kalemler: fiyat.kalemler, musteri: m };
  });
}

// ---------- 2) iyzico ödeme sayfasını aç ----------

async function odemeBaslat({ siparis, kalemler, musteri }, ip) {
  const adSoyad = `${musteri.ad} ${musteri.soyad}`;
  const acikAdres = `${musteri.adres}, ${musteri.ilce}/${musteri.il}`;
  // Online koçluk sanal bir hizmet: iyzico'ya sadece fatura adresi gider, kargo adresi gönderilmez
  const adres = {
    contactName: adSoyad, city: musteri.il, country: 'Turkey', address: acikAdres,
    zipCode: musteri.postaKodu || undefined
  };

  const istek = {
    conversationId: siparis.id,
    price: kurustanIyzico(siparis.toplam_kurus),
    paidPrice: kurustanIyzico(siparis.toplam_kurus),
    currency: iyzico.SABITLER.TRY,
    basketId: siparis.id,
    paymentGroup: iyzico.SABITLER.URUN,
    callbackUrl: `${ayarlar.siteUrl}/api/odeme/sonuc`,
    enabledInstallments: ayarlar.iyzico.taksitler,
    buyer: {
      id: siparis.id,
      name: musteri.ad,
      surname: musteri.soyad,
      gsmNumber: musteri.telefon,
      email: musteri.email,
      identityNumber: '11111111111', // TC kimlik no istemiyoruz; iyzico bu değeri kabul ediyor
      registrationAddress: acikAdres,
      ip: ipDuzelt(ip),
      city: musteri.il,
      country: 'Turkey',
      zipCode: musteri.postaKodu || undefined
    },
    billingAddress: adres,
    basketItems: kalemler.map(k => ({
      id: String(k.secenekId),
      name: `${k.urunAdi} - ${k.secenekAdi} x${k.adet}`.slice(0, 120),
      category1: k.kategori || 'Online Koçluk',
      itemType: iyzico.SABITLER.SANAL,
      price: kurustanIyzico(k.satirKurus)
    }))
  };

  let sonuc;
  try {
    sonuc = await iyzico.odemeFormuBaslat(istek);
  } catch (hata) {
    sonuc = { status: 'failure', errorMessage: hata.message };
  }

  if (sonuc.status !== 'success' || !sonuc.token || !sonuc.paymentPageUrl) {
    console.error(`iyzico ödeme sayfası açılamadı (#${siparis.siparis_no}):`, sonuc.errorCode || '', sonuc.errorMessage || '');
    await pool.query(`UPDATE siparisler SET durum = 'baslatilamadi', guncelleme = NOW() WHERE id = $1`, [siparis.id]);
    await olayEkle(pool, siparis.id, 'odeme-baslatilamadi', { kod: sonuc.errorCode || null, mesaj: sonuc.errorMessage || null });
    throw new KullaniciHatasi('Ödeme sayfası şu an açılamadı. Lütfen birkaç dakika sonra tekrar deneyin.', 502);
  }

  await pool.query('UPDATE siparisler SET iyzico_token = $2, guncelleme = NOW() WHERE id = $1', [siparis.id, sonuc.token]);
  await olayEkle(pool, siparis.id, 'odeme-sayfasi-acildi', {});
  odemeKontrolunuPlanla();
  return sonuc.paymentPageUrl;
}

// ---------- 3) Ödemenin sonucunu doğrula ----------

// iyzico'nun cevabına bakıp karar verir: odendi / inceleme / basarisiz / bilinmiyor
function odemeSonucunuDegerlendir(siparis, sonuc) {
  if (!sonuc || sonuc.status !== 'success') {
    return { karar: 'bilinmiyor', neden: (sonuc && sonuc.errorMessage) || 'iyzico sonuç döndürmedi' };
  }
  if (sonuc.paymentStatus === 'FAILURE') {
    return { karar: 'basarisiz', neden: sonuc.errorMessage || 'Ödeme başarısız' };
  }
  if (sonuc.paymentStatus !== 'SUCCESS') {
    return { karar: 'bilinmiyor', neden: `Ödeme henüz tamamlanmadı (${sonuc.paymentStatus || 'durum yok'})` };
  }

  // Para çekildi. Her şey tutuyorsa onayla, en ufak tutarsızlıkta insan baksın.
  const sorunlar = [];
  if (sonuc.basketId !== siparis.id) sorunlar.push('iyzico\'daki sepet numarası bu siparişle eşleşmiyor');
  if (sonuc.conversationId && sonuc.conversationId !== siparis.id) sorunlar.push('iyzico\'daki işlem numarası bu siparişle eşleşmiyor');
  if ((sonuc.currency || 'TRY') !== 'TRY') sorunlar.push(`para birimi TRY değil (${sonuc.currency})`);
  const fiyat = iyzicodanKurus(sonuc.price);
  if (fiyat !== siparis.toplam_kurus) sorunlar.push(`tutar eşleşmiyor: sipariş ${tl(siparis.toplam_kurus)}, iyzico ${sonuc.price}`);
  const odenen = iyzicodanKurus(sonuc.paidPrice);
  if (!(odenen >= siparis.toplam_kurus)) sorunlar.push(`tahsil edilen tutar (${sonuc.paidPrice}) sipariş tutarından düşük`);

  const fraud = Number(sonuc.fraudStatus);
  if (fraud === 0) sorunlar.push('iyzico ödemeyi dolandırıcılık kontrolü için incelemeye aldı. iyzico onay verene kadar ürünü göndermeyin');
  else if (fraud === -1) sorunlar.push('iyzico dolandırıcılık kontrolü bu ödemeyi reddetti');
  else if (fraud !== 1) sorunlar.push('iyzico dolandırıcılık kontrolü sonucu bilinmiyor');

  return sorunlar.length ? { karar: 'inceleme', neden: sorunlar.join('. ') + '.' } : { karar: 'odendi' };
}

// Kart bilgisi saklamadan, iade ve kontrol için gereken ödeme bilgileri
function odemeDetayi(sonuc) {
  return {
    paymentId: sonuc.paymentId || null,
    price: sonuc.price ?? null,
    paidPrice: sonuc.paidPrice ?? null,
    installment: sonuc.installment ?? null,
    fraudStatus: sonuc.fraudStatus ?? null,
    cardAssociation: sonuc.cardAssociation || null,
    cardFamily: sonuc.cardFamily || null,
    cardType: sonuc.cardType || null,
    lastFourDigits: sonuc.lastFourDigits || null,
    itemTransactions: Array.isArray(sonuc.itemTransactions)
      ? sonuc.itemTransactions.map(t => ({
        itemId: t.itemId, paymentTransactionId: t.paymentTransactionId,
        price: t.price, paidPrice: t.paidPrice, transactionStatus: t.transactionStatus
      }))
      : []
  };
}

// Ödendiğinde stoktan düş. Stok yetmiyorsa ödeme yine kabul edilir ama işletme uyarılır.
async function stokDus(client, siparisId) {
  const { rows } = await client.query(`
    SELECT k.secenek_id, k.adet, k.urun_adi, k.secenek_adi, s.stok
    FROM siparis_kalemleri k
    JOIN urun_secenekleri s ON s.id = k.secenek_id
    WHERE k.siparis_id = $1
    ORDER BY s.id
    FOR UPDATE OF s
  `, [siparisId]);
  const yetersiz = [];
  for (const r of rows) {
    if (r.stok < r.adet) yetersiz.push({ urun: `${r.urun_adi} (${r.secenek_adi})`, istenen: r.adet, stok: r.stok });
    await client.query('UPDATE urun_secenekleri SET stok = $2 WHERE id = $1', [r.secenek_id, Math.max(r.stok - r.adet, 0)]);
  }
  return yetersiz;
}

async function stokIadeEt(client, siparisId) {
  const { rowCount } = await client.query(`
    UPDATE urun_secenekleri s SET stok = s.stok + k.adet
    FROM siparis_kalemleri k
    WHERE k.siparis_id = $1 AND k.secenek_id = s.id
  `, [siparisId]);
  return rowCount;
}

async function kalemleriGetir(db, siparisId) {
  const { rows } = await db.query('SELECT * FROM siparis_kalemleri WHERE siparis_id = $1 ORDER BY id', [siparisId]);
  return rows;
}

async function siparisAlindiEpostasi(db, s, kalemler) {
  const icerik = sablon.siparisAlindi(s, kalemler);
  await eposta.kuyrugaEkle(db, {
    alici: s.email, ...icerik, siparisId: s.id, anahtar: `siparis-alindi:${s.siparis_no}`,
    ekler: s.sozlesme_html
      ? [{ dosyaAdi: `siparis-${s.siparis_no}-sozlesmeler.html`, icerik: s.sozlesme_html, tur: 'text/html; charset=utf-8' }]
      : []
  });
}

// Callback, iyzico bildirimi, arka plan kontrolü ve panel aynı fonksiyonu kullanır.
// Aynı ödeme kaç kez gelirse gelsin sipariş sadece bir kez "ödendi" olur, stok bir kez düşer.
async function odemeyiSonuclandir(token, kaynak, { suresiDolduysaKapat = false } = {}) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 200) return null;

  const { rows: [bulunan] } = await pool.query('SELECT * FROM siparisler WHERE iyzico_token = $1', [token]);
  if (!bulunan) return null;
  if (!ODENMEMIS.includes(bulunan.durum)) return { siparis: bulunan, karar: 'zaten-islendi' };

  let sonuc = null;
  let degerlendirme;
  try {
    sonuc = await iyzico.odemeSonucuGetir(token);
    degerlendirme = odemeSonucunuDegerlendir(bulunan, sonuc);
  } catch (hata) {
    degerlendirme = { karar: 'bilinmiyor', neden: `iyzico'ya ulaşılamadı: ${hata.message}` };
  }

  const sonucBilgisi = await islem(async (client) => {
    // Aynı anda iki istek gelirse (ör. callback + bildirim) sırayla işlensin
    const { rows: [s] } = await client.query('SELECT * FROM siparisler WHERE id = $1 FOR UPDATE', [bulunan.id]);
    if (!ODENMEMIS.includes(s.durum)) return { siparis: s, karar: 'zaten-islendi' };

    const { karar, neden } = degerlendirme;

    if (karar === 'odendi' || karar === 'inceleme') {
      const detay = odemeDetayi(sonuc);
      const { rows: [yeni] } = await client.query(`
        UPDATE siparisler SET durum = $2, odeme_id = $3, odeme_tarihi = NOW(), odenen_kurus = $4,
          taksit = $5, odeme_detay = $6, son_kontrol = NOW(), guncelleme = NOW()
        WHERE id = $1 RETURNING *
      `, [s.id, karar, detay.paymentId, iyzicodanKurus(sonuc.paidPrice) || null,
        Number.parseInt(sonuc.installment, 10) || 1, JSON.stringify(detay)]);

      const yetersiz = await stokDus(client, s.id);
      if (yetersiz.length) {
        await client.query('UPDATE siparisler SET stok_uyarisi = TRUE WHERE id = $1', [s.id]);
        yeni.stok_uyarisi = true;
        await olayEkle(client, s.id, 'stok-yetersiz', { urunler: yetersiz });
      }

      await olayEkle(client, s.id, karar === 'odendi' ? 'odeme-alindi' : 'odeme-incelemede', {
        kaynak, paymentId: detay.paymentId, tutar: sonuc.paidPrice, taksit: sonuc.installment || 1,
        ...(neden ? { neden } : {})
      });

      const kalemler = await kalemleriGetir(client, s.id);
      if (karar === 'odendi') {
        await siparisAlindiEpostasi(client, yeni, kalemler);
        await eposta.kuyrugaEkle(client, {
          alici: ayarlar.eposta.adminAlici, ...sablon.yeniSiparisAdmin(yeni, kalemler),
          siparisId: s.id, anahtar: `yeni-siparis:${s.siparis_no}`
        });
      } else {
        await eposta.kuyrugaEkle(client, {
          alici: ayarlar.eposta.adminAlici, ...sablon.incelemeGerekli(yeni, neden),
          siparisId: s.id, anahtar: `inceleme:${s.siparis_no}`
        });
      }
      return { siparis: yeni, karar };
    }

    if (karar === 'basarisiz' && s.durum === 'odeme-bekliyor') {
      const { rows: [yeni] } = await client.query(`
        UPDATE siparisler SET durum = 'odeme-basarisiz', son_kontrol = NOW(), guncelleme = NOW()
        WHERE id = $1 RETURNING *
      `, [s.id]);
      await olayEkle(client, s.id, 'odeme-basarisiz', { kaynak, neden });
      return { siparis: yeni, karar };
    }

    // Sonuç belli değil. Ödeme sayfasının süresi dolduysa siparişi kapat.
    const yasDk = (Date.now() - new Date(s.olusturma).getTime()) / 60000;
    if (suresiDolduysaKapat && s.durum === 'odeme-bekliyor' && yasDk >= ayarlar.terkSuresiDk && sonuc) {
      const yeniDurum = karar === 'basarisiz' ? 'odeme-basarisiz' : 'terk-edildi';
      const { rows: [yeni] } = await client.query(`
        UPDATE siparisler SET durum = $2, son_kontrol = NOW(), guncelleme = NOW() WHERE id = $1 RETURNING *
      `, [s.id, yeniDurum]);
      await olayEkle(client, s.id, yeniDurum, { kaynak, neden: neden || 'Ödeme süresi içinde tamamlanmadı' });
      return { siparis: yeni, karar: yeniDurum };
    }

    await client.query('UPDATE siparisler SET son_kontrol = NOW() WHERE id = $1', [s.id]);
    if (!['kontrol', 'sayfa'].includes(kaynak)) await olayEkle(client, s.id, 'odeme-sonucu-belirsiz', { kaynak, neden });
    return { siparis: s, karar };
  });

  if (sonucBilgisi.karar === 'odendi' || sonucBilgisi.karar === 'inceleme') {
    console.log(`✔ Sipariş #${sonucBilgisi.siparis.siparis_no}: ${sonucBilgisi.karar} (${kaynak})`);
    epostaGonderiminiTetikle();
  } else if (sonucBilgisi.karar === 'bilinmiyor') {
    odemeKontrolunuPlanla();
  }
  return sonucBilgisi;
}

// ---------- 4) Panelden durum değiştirme ----------

// iyzico'da para iadesi tamamlandı mı? (tam iptal veya bütün kalemlerin iadesi)
function iadeTamamlandi(s) {
  const kayitlar = Array.isArray(s.iade_detay) ? s.iade_detay : [];
  if (kayitlar.some(k => k.tur === 'iptal')) return true;
  const kalemler = (s.odeme_detay && s.odeme_detay.itemTransactions) || [];
  const iadeEdilen = new Set(kayitlar.filter(k => k.tur === 'iade').map(k => k.paymentTransactionId));
  return kalemler.length > 0 && kalemler.every(k => iadeEdilen.has(k.paymentTransactionId));
}

// elleIade: işletme parayı iyzico panelinden kendisi iade ettiyse siparişi sadece iptal olarak işaretler
async function durumDegistir(siparisId, { durum, kargoTakipNo, adminNotu, elleIade = false } = {}) {
  const id = dogrulama.uuid(siparisId);

  const sonuc = await islem(async (client) => {
    const { rows: [s] } = await client.query('SELECT * FROM siparisler WHERE id = $1 FOR UPDATE', [id]);
    if (!s) throw new KullaniciHatasi('Sipariş bulunamadı.', 404);

    let hedef = s.durum;
    if (durum !== undefined && durum !== null && durum !== '' && durum !== s.durum) {
      if (!DURUM_ADLARI[durum]) throw new KullaniciHatasi('Geçersiz durum.');
      if (!(ADMIN_GECISLERI[s.durum] || []).includes(durum)) {
        throw new KullaniciHatasi(`"${DURUM_ADLARI[s.durum]}" durumundaki sipariş "${DURUM_ADLARI[durum]}" durumuna alınamaz.`);
      }
      hedef = durum;
    }

    let takipNo = s.kargo_takip_no;
    if (kargoTakipNo !== undefined && kargoTakipNo !== null && String(kargoTakipNo).trim() !== '') {
      takipNo = String(kargoTakipNo).replace(/\s/g, '');
      if (!/^[A-Za-z0-9-]{4,40}$/.test(takipNo)) throw new KullaniciHatasi('Kargo takip numarası geçersiz (sadece harf, rakam ve tire).');
      if (ODENMEMIS.includes(s.durum)) throw new KullaniciHatasi('Ödenmemiş siparişe takip numarası girilemez.');
    }

    // Parası alınmış sipariş, para iade edilmeden iptal edilemez
    const iptalOluyor = hedef !== s.durum && ['iptal', 'iade-edildi'].includes(hedef);
    if (iptalOluyor && s.odeme_id && !iadeTamamlandi(s) && elleIade !== true) {
      throw new KullaniciHatasi('Bu siparişin parası henüz iade edilmedi. "İptal et ve parayı iade et" butonunu kullanın.');
    }

    let not = s.admin_notu;
    if (typeof adminNotu === 'string') {
      not = dogrulama.temizle(adminNotu, true);
      if (not.length > 1000) throw new KullaniciHatasi('Not en fazla 1000 karakter olabilir.');
    }

    const durumDegisti = hedef !== s.durum;
    const takipDegisti = takipNo !== s.kargo_takip_no;
    const notDegisti = not !== s.admin_notu;
    if (!durumDegisti && !takipDegisti && !notDegisti) throw new KullaniciHatasi('Değişiklik yok.');

    const { rows: [yeni] } = await client.query(`
      UPDATE siparisler SET
        durum = $2, kargo_takip_no = $3, admin_notu = $4, guncelleme = NOW(),
        kargo_tarihi = CASE WHEN $2 = 'kargoda' AND durum <> 'kargoda' THEN NOW() ELSE kargo_tarihi END,
        teslim_tarihi = CASE WHEN $2 = 'teslim-edildi' AND durum <> 'teslim-edildi' THEN NOW() ELSE teslim_tarihi END,
        iptal_tarihi = CASE WHEN $2 IN ('iptal', 'iade-edildi') AND durum NOT IN ('iptal', 'iade-edildi') THEN NOW() ELSE iptal_tarihi END
      WHERE id = $1
      RETURNING *
    `, [id, hedef, takipNo, not]);

    if (durumDegisti) {
      await olayEkle(client, id, 'durum-degisti', {
        eski: s.durum, yeni: hedef, ...(iptalOluyor && elleIade === true && !iadeTamamlandi(s) ? { elleIade: true } : {})
      });
      if (hedef === 'iptal' && STOK_IADE_DURUMLARI.includes(s.durum)) {
        const adet = await stokIadeEt(client, id);
        if (adet) await olayEkle(client, id, 'stok-geri-eklendi', {});
      }
    }
    if (takipDegisti) await olayEkle(client, id, 'kargo-takip-no', { eski: s.kargo_takip_no, yeni: takipNo });
    if (notDegisti) await olayEkle(client, id, 'admin-notu', {});

    // Müşteriye e-posta
    const ekle = (icerik, anahtar, ekler) => eposta.kuyrugaEkle(client, {
      alici: yeni.email, ...icerik, siparisId: id, anahtar, ...(ekler ? { ekler } : {})
    });
    if (hedef === 'kargoda' && durumDegisti) {
      await ekle(sablon.koclukBasladi(yeni), `koclukBasladi:${yeni.siparis_no}`);
    }
    if (durumDegisti && hedef === 'odendi' && s.durum === 'inceleme') {
      await siparisAlindiEpostasi(client, yeni, await kalemleriGetir(client, id));
    }
    if (durumDegisti && hedef === 'teslim-edildi') await ekle(sablon.teslimEdildi(yeni), `teslim:${yeni.siparis_no}`);
    if (durumDegisti && hedef === 'iptal') await ekle(sablon.iptalEdildi(yeni), `iptal:${yeni.siparis_no}`);
    if (durumDegisti && hedef === 'iade-edildi') await ekle(sablon.iadeEdildi(yeni), `iade:${yeni.siparis_no}`);

    return yeni;
  });

  epostaGonderiminiTetikle();
  return sonuc;
}

// ---------- 5) Panelden iptal + otomatik para iadesi ----------

const istanbulGunu = t => new Date(t).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

// Parayı iyzico üzerinden iade eder, başarılı olursa siparişi iptal eder.
// Ödeme bugün yapıldıysa önce tam iptal denenir (müşterinin ekstresine hiç yansımaz),
// olmazsa her ürün kalemi ayrı ayrı iade edilir. Yarıda kalırsa tekrar denendiğinde
// sadece kalan kalemler iade edilir; aynı para asla iki kez iade edilmez.
async function iadeEt(siparisId, ip) {
  const id = dogrulama.uuid(siparisId);

  // 1) Aynı anda iki kez basılmasın
  const s = await islem(async (client) => {
    const { rows: [k] } = await client.query('SELECT * FROM siparisler WHERE id = $1 FOR UPDATE', [id]);
    if (!k) throw new KullaniciHatasi('Sipariş bulunamadı.', 404);
    if (!IADE_EDILEBILIR.includes(k.durum)) throw new KullaniciHatasi(`"${DURUM_ADLARI[k.durum]}" durumundaki siparişte iade yapılamaz.`);
    if (!k.odeme_id) throw new KullaniciHatasi('Bu siparişin ödeme bilgisi yok. İadeyi iyzico panelinden yapın.');
    if (k.iade_baslangic && Date.now() - new Date(k.iade_baslangic).getTime() < 2 * 60 * 1000) {
      throw new KullaniciHatasi('İade işlemi zaten sürüyor. Birkaç saniye sonra sayfayı yenileyin.', 409);
    }
    await client.query('UPDATE siparisler SET iade_baslangic = NOW() WHERE id = $1', [id]);
    return k;
  });

  const oncekiler = Array.isArray(s.iade_detay) ? s.iade_detay : [];
  const kalemler = (s.odeme_detay && s.odeme_detay.itemTransactions) || [];
  const iadeEdilmis = new Set(oncekiler.filter(k => k.tur === 'iade').map(k => k.paymentTransactionId));
  const yeniKayitlar = [];
  let hata = null;
  const zaman = () => new Date().toISOString();

  // 2) iyzico'ya iade isteği
  if (!iadeTamamlandi(s)) {
    try {
      let iptalEdildi = false;
      if (iadeEdilmis.size === 0 && istanbulGunu(s.odeme_tarihi) === istanbulGunu(Date.now())) {
        try {
          const r = await iyzico.odemeyiIptalEt({ paymentId: s.odeme_id, conversationId: s.id, ip: ipDuzelt(ip) });
          if (r.status === 'success') {
            yeniKayitlar.push({ tur: 'iptal', tutar: r.price ?? null, tarih: zaman() });
            iptalEdildi = true;
          } else {
            yeniKayitlar.push({ tur: 'iptal-olmadi', hata: r.errorMessage || null, tarih: zaman() });
          }
        } catch (e) {
          yeniKayitlar.push({ tur: 'iptal-olmadi', hata: e.message, tarih: zaman() });
        }
      }
      if (!iptalEdildi) {
        if (kalemler.length === 0) throw new Error('Ödemenin kalem bilgisi yok, iadeyi iyzico panelinden yapın');
        for (const k of kalemler) {
          if (iadeEdilmis.has(k.paymentTransactionId)) continue;
          const tutar = kurustanIyzico(iyzicodanKurus(k.paidPrice));
          const r = await iyzico.kalemiIadeEt({
            paymentTransactionId: k.paymentTransactionId, price: tutar, conversationId: s.id, ip: ipDuzelt(ip)
          });
          if (r.status !== 'success') throw new Error(r.errorMessage || 'iyzico iadeyi kabul etmedi');
          yeniKayitlar.push({ tur: 'iade', paymentTransactionId: k.paymentTransactionId, tutar: r.price ?? tutar, tarih: zaman() });
        }
      }
    } catch (e) {
      hata = e.message;
    }
  }

  // 3) Sonucu kaydet
  const iadeKurus = yeniKayitlar
    .filter(k => k.tur === 'iade' || k.tur === 'iptal')
    .reduce((t, k) => t + (iyzicodanKurus(k.tutar) || (k.tur === 'iptal' ? (s.odenen_kurus || s.toplam_kurus) : 0)), 0);
  await islem(async (client) => {
    await client.query(`
      UPDATE siparisler SET iade_detay = iade_detay || $2::jsonb, iade_kurus = iade_kurus + $3, iade_baslangic = NULL, guncelleme = NOW()
      WHERE id = $1
    `, [id, JSON.stringify(yeniKayitlar), iadeKurus]);
    if (yeniKayitlar.length || hata) {
      await olayEkle(client, id, hata ? 'iade-basarisiz' : 'iade-yapildi', {
        ...(hata ? { hata } : {}), tutar: tl(iadeKurus),
        yontem: yeniKayitlar.some(k => k.tur === 'iptal') ? 'tam iptal' : 'kalem iadesi'
      });
    }
  });

  if (hata) {
    const kismen = yeniKayitlar.some(k => k.tur === 'iade') || iadeEdilmis.size > 0;
    console.error(`İade yapılamadı (#${s.siparis_no}):`, hata);
    throw new KullaniciHatasi(
      `iyzico iadeyi yapamadı: ${hata}. Sipariş iptal EDİLMEDİ.`
      + (kismen ? ' Bazı ürünlerin parası iade edildi; tekrar denediğinizde sadece kalanlar iade edilir.' : '')
      + (/zaman aşımı/i.test(hata) ? ' iyzico cevap vermedi: tekrar denemeden önce iyzico panelinden iadenin yapılıp yapılmadığına bakın.' : ''),
      502
    );
  }

  // 4) Para iade edildi: siparişi iptal et (stok, e-posta vb. normal iptal gibi)
  const hedef = s.durum === 'teslim-edildi' ? 'iade-edildi' : 'iptal';
  console.log(`✔ Sipariş #${s.siparis_no}: para iade edildi (${tl(iadeKurus)})`);
  return durumDegistir(id, { durum: hedef });
}

// ---------- 6) Müşterinin sipariş sayfası ----------

function musteriGorunumu(s, kalemler) {
  return {
    siparisNo: String(s.siparis_no),
    durum: s.durum,
    durumAdi: MUSTERI_DURUM_ADLARI[s.durum] || s.durum,
    odendi: !ODENMEMIS.includes(s.durum),
    tarih: s.olusturma,
    odemeTarihi: s.odeme_tarihi,
    kargoTarihi: s.kargo_tarihi,
    teslimTarihi: s.teslim_tarihi,
    kalemler: kalemler.map(k => ({
      urunAdi: k.urun_adi, secenekAdi: k.secenek_adi, adet: k.adet, birimFiyatKurus: k.birim_fiyat_kurus
    })),
    toplamKurus: s.toplam_kurus,
    kargoFirmasi: ayarlar.isletme.kargoFirmasi,
    kargoTakipNo: s.kargo_takip_no || null,
    kargoTakipUrl: s.kargo_takip_no ? sablon.arasTakipLinki(s.kargo_takip_no) : null,
    alici: { adSoyad: `${s.musteri_ad} ${s.musteri_soyad}`, ilce: s.ilce, il: s.sehir },
    sozlesmeVar: Boolean(s.sozlesme_html)
  };
}

function siparisNoDogrula(no) {
  const metin = String(no ?? '').replace(/^#/, '').trim();
  return /^\d{1,12}$/.test(metin) ? metin : null;
}

// Linkteki gizli kodla sipariş getir.
// tazele: ödeme sonucu henüz belli değilse iyzico'ya bir kez daha sor (en fazla 15 saniyede bir).
async function musteriSiparisi(no, kod, { tazele = false } = {}) {
  const siparisNo = siparisNoDogrula(no);
  if (!siparisNo || typeof kod !== 'string' || !/^[0-9a-f]{20,80}$/.test(kod)) return null;
  let { rows: [s] } = await pool.query('SELECT * FROM siparisler WHERE siparis_no = $1', [siparisNo]);
  if (!s || !guvenliEsit(kod, s.takip_kodu)) return null;

  const sonKontrolOnce = s.son_kontrol ? Date.now() - new Date(s.son_kontrol).getTime() : Infinity;
  if (tazele && s.durum === 'odeme-bekliyor' && s.iyzico_token && sonKontrolOnce > 15000) {
    const sonuc = await odemeyiSonuclandir(s.iyzico_token, 'sayfa');
    if (sonuc && sonuc.siparis) s = sonuc.siparis;
  }
  return { siparis: s, gorunum: musteriGorunumu(s, await kalemleriGetir(pool, s.id)) };
}

// Sipariş no + e-posta ile sorgulama
async function siparisSorgula(no, email) {
  const siparisNo = siparisNoDogrula(no);
  if (!siparisNo || typeof email !== 'string' || email.length > 120) return null;
  const { rows: [s] } = await pool.query(
    `SELECT siparis_no, takip_kodu FROM siparisler
     WHERE siparis_no = $1 AND lower(email) = lower($2) AND durum <> 'baslatilamadi'`,
    [siparisNo, email.trim()]
  );
  return s ? { no: String(s.siparis_no), k: s.takip_kodu } : null;
}

module.exports = {
  DURUM_ADLARI, ODENMEMIS, AKTIF, ADMIN_GECISLERI,
  tetikleyicileriAyarla, olayEkle, sepetiFiyatla, siparisOlustur, odemeBaslat,
  odemeSonucunuDegerlendir, odemeyiSonuclandir, durumDegistir, iadeEt, kalemleriGetir, IADE_EDILEBILIR,
  musteriSiparisi, siparisSorgula, MUSTERI_DURUM_ADLARI
};
