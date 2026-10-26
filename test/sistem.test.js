'use strict';
// Uçtan uca testler: gerçek PostgreSQL + sahte iyzico + sahte SMTP.
// Çalıştırmak için BOŞ bir test veritabanı gerekir (içindeki her şey silinir!):
//   TEST_DATABASE_URL=postgresql://...localhost.../ozyurt_test npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const { sahteIyzico, sahteSmtp, bosPort, postaCoz } = require('./sahte-sunucular');

const TEST_DB = process.env.TEST_DATABASE_URL;
const SIFRE = 'test-sifresi-12345';

if (!TEST_DB) {
  test('TEST_DATABASE_URL tanımlı değil', { skip: 'Testler için boş bir test veritabanı adresi verin' }, () => {});
} else {
  const url = new URL(TEST_DB);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) && !/test/i.test(url.pathname)) {
    throw new Error('Güvenlik: TEST_DATABASE_URL yerel olmalı veya veritabanı adında "test" geçmeli (içindeki her şey silinir).');
  }
  testleriCalistir();
}

function testleriCalistir() {
  let iyz; let smtp; let sunucu; let adres; let pool; let isler; let adminCerez;

  // ---------- yardımcılar ----------
  async function istek(yol, { method = 'GET', govde, form, ham, tur, basliklar = {}, cerez } = {}) {
    const h = { ...basliklar };
    let body;
    if (govde !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(govde); }
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (ham) { h['Content-Type'] = tur; body = ham; }
    if (cerez) h.Cookie = cerez;
    const r = await fetch(adres + yol, { method, headers: h, body, redirect: 'manual' });
    const metin = await r.text();
    let json = null;
    try { json = JSON.parse(metin); } catch { /* html */ }
    return { durum: r.status, json, metin, basliklar: r.headers };
  }
  const panel = (yol, ayar = {}) => istek(`/api/admin${yol}`, {
    ...ayar, cerez: adminCerez, basliklar: { 'X-Istek': 'panel', ...(ayar.basliklar || {}) }
  });
  const tek = async (sql, p = []) => (await pool.query(sql, p)).rows[0];
  // Kuyruktaki bütün e-postaları gönder (tek turda en fazla 10 gönderilir)
  const epostalariGonder = async () => { while ((await isler.epostaTuru()).dahaVar) { /* devam */ } };

  const MUSTERI = {
    ad: 'Ayşe', soyad: 'Yılmaz', email: 'Ayse@Example.com', telefon: '0555 111 22 33',
    il: 'Denizli', ilce: 'Pamukkale', adres: 'Örnek Mah. Test Sok. No:1 D:2', postaKodu: '20160', not: 'Kapıya bırakın'
  };

  async function siparisVer(sepet, musteri = MUSTERI) {
    const r = await istek('/api/odeme/baslat', { method: 'POST', govde: { sepet, musteri, sozlesmeOnay: true } });
    assert.equal(r.durum, 200, r.metin);
    const token = r.json.odemeUrl.split('/').pop();
    return { token, siparisNo: r.json.siparisNo };
  }
  const geriDonus = token => istek('/api/odeme/sonuc', { method: 'POST', form: { token } });
  const siparisAl = no => tek('SELECT * FROM siparisler WHERE siparis_no = $1', [no]);
  const stok = id => tek('SELECT stok FROM urun_secenekleri WHERE id = $1', [id]).then(r => r.stok);

  let elma; let ceviz; let azStok; // seçenek id'leri
  let siparis1;

  test.before(async () => {
    iyz = sahteIyzico();
    const iyzPort = await iyz.baslat();
    smtp = sahteSmtp();
    const smtpPort = await smtp.baslat();
    const appPort = await bosPort();

    Object.assign(process.env, {
      NODE_ENV: 'test',
      ODEME_YONTEMI: 'iyzico',
      DATABASE_URL: TEST_DB,
      IYZICO_API_KEY: 'sandbox-test-anahtar',
      IYZICO_SECRET_KEY: 'sandbox-test-gizli',
      IYZICO_BASE_URL: `http://127.0.0.1:${iyzPort}`,
      IYZICO_ZAMAN_ASIMI_MS: '1500',
      SITE_URL: `http://127.0.0.1:${appPort}`,
      ADMIN_SIFRE_HASH: bcrypt.hashSync(SIFRE, 4),
      JWT_SECRET: 'test-jwt-gizli-anahtar-en-az-32-karakter-uzunlukta',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_SECURE: 'false',
      SMTP_KULLANICI: '',
      EPOSTA_GONDEREN: 'Xsportgym Test <magaza@example.com>',
      ADMIN_EPOSTA: 'sahip@example.com',
      ARAS_TAKIP_URL: 'https://kargo.example/takip?no={NO}',
      ISLER_KAPALI: '1',
      TRUST_PROXY: 'false',
      ODEME_BASLATMA_LIMITI: '1000'
    });

    // Veritabanını sıfırla ve kullanıcının mevcut veritabanındaki gibi ESKİ şemayı + eski veriyi oluştur
    const { Client } = require('pg');
    const c = new Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.query(`
      CREATE TABLE urunler (id SERIAL PRIMARY KEY, ad TEXT NOT NULL, kategori TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', aktif BOOLEAN NOT NULL DEFAULT TRUE, olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE urun_secenekleri (id SERIAL PRIMARY KEY, urun_id INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE, ad TEXT NOT NULL, fiyat_kurus INTEGER NOT NULL CHECK (fiyat_kurus > 0), stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0), aktif BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE siparisler (id UUID PRIMARY KEY, durum TEXT NOT NULL DEFAULT 'odeme-bekliyor', toplam_kurus INTEGER NOT NULL, musteri_ad TEXT NOT NULL, musteri_soyad TEXT NOT NULL, email TEXT NOT NULL, telefon TEXT NOT NULL, adres TEXT NOT NULL, sehir TEXT NOT NULL, iyzico_token TEXT UNIQUE, odeme_id TEXT, kargo_takip_no TEXT, olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE siparis_kalemleri (id SERIAL PRIMARY KEY, siparis_id UUID NOT NULL REFERENCES siparisler(id) ON DELETE CASCADE, secenek_id INTEGER REFERENCES urun_secenekleri(id) ON DELETE SET NULL, urun_adi TEXT NOT NULL, secenek_adi TEXT NOT NULL, birim_fiyat_kurus INTEGER NOT NULL, adet INTEGER NOT NULL CHECK (adet > 0));
      INSERT INTO urunler (ad, kategori) VALUES ('Elma Fidanı', 'Meyve Fidanı'), ('Elma Fidanı', 'Meyve Fidanı');
      INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok) VALUES (1, '2 yaşlı', 75000, 19);
      INSERT INTO siparisler (id, durum, toplam_kurus, musteri_ad, musteri_soyad, email, telefon, adres, sehir)
        VALUES ('8dfa344a-fe50-499a-a7d5-452d6cfadd48', 'teslim-edildi', 75000, 'Test', 'Kullanıcı', 'test@example.com', '+905551112233', 'Örnek', 'Denizli');
      INSERT INTO siparis_kalemleri (siparis_id, secenek_id, urun_adi, secenek_adi, birim_fiyat_kurus, adet)
        VALUES ('8dfa344a-fe50-499a-a7d5-452d6cfadd48', 1, 'Elma Fidanı', '2 yaşlı', 75000, 1);
    `);
    await c.end();

    ({ pool } = require('../lib/db'));
    const { gocleriUygula } = require('../lib/gocler');
    await gocleriUygula({ sessiz: true });
    await require('../lib/hesap').yoneticiyiHazirla();

    const app = require('../app');
    sunucu = app.listen(appPort, '127.0.0.1');
    await once(sunucu, 'listening');
    adres = `http://127.0.0.1:${appPort}`;
    isler = require('../lib/isler');
    isler.durdur(); // testlerde arka plan zamanlayıcıları çalışmasın, işleri testler kendisi çağırır
  });

  test.after(async () => {
    sunucu?.closeAllConnections?.();
    await new Promise(r => (sunucu ? sunucu.close(() => r()) : r()));
    await pool?.end();
    await iyz?.kapat();
    await smtp?.kapat();
  });

  // ---------------------------------------------------------------------------
  test('göç: eski veritabanı bozulmadan güncellenir, tekrar çalıştırmak zararsız', async () => {
    const { gocleriUygula } = require('../lib/gocler');
    assert.deepEqual(await gocleriUygula({ sessiz: true }), []);
    const urunler = (await pool.query('SELECT id, slug FROM urunler ORDER BY id')).rows;
    assert.deepEqual(urunler.map(u => u.slug), ['elma-fidani', 'elma-fidani-2']);
    const eski = await tek(`SELECT siparis_no, takip_kodu, durum FROM siparisler WHERE id = '8dfa344a-fe50-499a-a7d5-452d6cfadd48'`);
    assert.equal(String(eski.siparis_no), '100001');
    assert.match(eski.takip_kodu, /^[0-9a-f]{64}$/);
    assert.equal(eski.durum, 'teslim-edildi');
    // eski test verisini temizle, kendi ürünlerimizi panelden ekleyeceğiz
    await pool.query('DELETE FROM urunler');
  });

  test('güvenlik başlıkları ve gizli dosyalar', async () => {
    const r = await istek('/');
    assert.equal(r.durum, 200);
    assert.match(r.basliklar.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.basliklar.get('x-frame-options'), 'DENY');
    assert.equal(r.basliklar.get('x-powered-by'), null);
    for (const yol of ['/.env', '/server.js', '/lib/ayarlar.js', '/package.json', '/../.env']) {
      const g = await istek(yol);
      assert.equal(g.durum, 404, yol);
      assert.doesNotMatch(g.metin, /IYZICO|DATABASE_URL/);
    }
    assert.equal((await istek('/api/yok')).durum, 404);
    assert.equal((await istek('/saglik')).json.ok, true);
    assert.equal((await istek('/saglik?db=1')).json.veritabani, 'ok');
  });

  test('panel: giriş, CSRF koruması ve oturum', async () => {
    assert.equal((await istek('/api/admin/siparisler')).durum, 401);
    const basliksiz = await istek('/api/hesap/giris', { method: 'POST', govde: { kimlik: 'admin', sifre: SIFRE } });
    assert.equal(basliksiz.durum, 403, 'X-Istek başlığı olmadan giriş yapılamamalı');
    const yanlis = await istek('/api/hesap/giris', { method: 'POST', govde: { kimlik: 'admin', sifre: 'yanlis-sifre' }, basliklar: { 'X-Istek': 'panel' } });
    assert.equal(yanlis.durum, 401);
    const dogru = await istek('/api/hesap/giris', { method: 'POST', govde: { kimlik: 'Admin', sifre: SIFRE }, basliklar: { 'X-Istek': 'panel' } });
    assert.equal(dogru.durum, 200);
    const cerez = dogru.basliklar.getSetCookie().find(c => c.startsWith('oturum='));
    assert.match(cerez, /HttpOnly/i);
    assert.match(cerez, /SameSite=Lax/i);
    adminCerez = cerez.split(';')[0];
    assert.equal((await panel('/ben')).durum, 200);

    const kotuSite = await panel('/urunler', { method: 'POST', govde: { ad: 'X', kategori: 'Y' }, basliklar: { Origin: 'https://kotu-site.example' } });
    assert.equal(kotuSite.durum, 403);
    const sahteCerez = await istek('/api/admin/ben', { cerez: 'oturum=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwic3YiOjF9.' });
    assert.equal(sahteCerez.durum, 401, 'imzasız token kabul edilmemeli');
  });

  test('panel: ürün, seçenek ve fotoğraf yönetimi', async () => {
    let r = await panel('/urunler', { method: 'POST', govde: { ad: 'Aşılı Elma Fidanı', kategori: 'Meyve Fidanı', aciklama: 'Lezzetli.\n\nBakımı kolay.', sira: 1 } });
    assert.equal(r.durum, 201, r.metin);
    const elmaUrun = r.json.id;

    r = await panel(`/urunler/${elmaUrun}`, { method: 'PATCH', govde: { aktif: true } });
    assert.equal(r.durum, 400, 'seçeneği olmayan ürün yayına alınamamalı');

    r = await panel(`/urunler/${elmaUrun}/secenekler`, { method: 'POST', govde: { ad: '1 yaşlı', fiyat: '1.250', stok: 5 } });
    assert.equal(r.durum, 400, 'binlik ayraçlı fiyat reddedilmeli');
    r = await panel(`/urunler/${elmaUrun}/secenekler`, { method: 'POST', govde: { ad: '2 yaşlı', fiyat: '750,50', stok: 10 } });
    assert.equal(r.durum, 201, r.metin);
    elma = r.json.id;
    assert.equal(await tek('SELECT fiyat_kurus FROM urun_secenekleri WHERE id = $1', [elma]).then(x => x.fiyat_kurus), 75050);

    r = await panel(`/urunler/${elmaUrun}`, { method: 'PATCH', govde: { aktif: true } });
    assert.equal(r.durum, 200, r.metin);

    r = await panel('/urunler', { method: 'POST', govde: { ad: 'Ceviz Fidanı', kategori: 'Meyve Fidanı', sira: 2 } });
    const cevizUrun = r.json.id;
    ceviz = (await panel(`/urunler/${cevizUrun}/secenekler`, { method: 'POST', govde: { ad: 'Standart', fiyat: '900', stok: 20 } })).json.id;
    azStok = (await panel(`/urunler/${cevizUrun}/secenekler`, { method: 'POST', govde: { ad: 'Büyük boy', fiyat: '1500', stok: 1 } })).json.id;
    await panel(`/urunler/${cevizUrun}`, { method: 'PATCH', govde: { aktif: true } });

    // Fotoğraf: gerçek PNG kabul, resim gibi görünen metin red
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex');
    r = await panel(`/urunler/${elmaUrun}/gorseller`, { method: 'POST', ham: png, tur: 'image/png' });
    assert.equal(r.durum, 201, r.metin);
    const gorselId = r.json.id;
    r = await panel(`/urunler/${elmaUrun}/gorseller`, { method: 'POST', ham: Buffer.from('<script>alert(1)</script>'), tur: 'image/png' });
    assert.equal(r.durum, 400);
    r = await panel(`/urunler/${elmaUrun}/gorseller`, { method: 'POST', ham: png, tur: 'image/png' });
    const ikinci = r.json.id;
    r = await panel(`/urunler/${elmaUrun}/gorsel-sirasi`, { method: 'PUT', govde: { idler: [ikinci, gorselId] } });
    assert.equal(r.durum, 200);

    const g = await fetch(`${adres}/api/gorsel/${gorselId}`);
    assert.equal(g.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await g.arrayBuffer()), png);

    // Mağazada görünüm
    const liste = (await istek('/api/urunler')).json;
    assert.equal(liste.length, 2);
    assert.equal(liste[0].slug, 'asili-elma-fidani');
    assert.equal(liste[0].gorselId, ikinci, 'kapak fotoğrafı sıralamaya uymalı');
    const detay = (await istek('/api/urunler/asili-elma-fidani')).json;
    assert.equal(detay.secenekler[0].fiyatKurus, 75050);
    assert.equal(detay.secenekler[0].stok, 10);
    assert.equal((await istek('/api/urunler/olmayan-urun')).durum, 404);

    // Dikim ve bakım bilgileri: bilinmeyen alan atılır, boşlar kaydedilmez, çok uzun metin reddedilir
    r = await panel(`/urunler/${elmaUrun}`, {
      method: 'PATCH',
      govde: { latinceAd: 'Değişime benimle başla', bakim: { sure: '3 ay', program: ' Haftalık, kişiye özel ', beslenme: '', zararli: '<script>' } }
    });
    assert.equal(r.durum, 200, r.metin);
    const bakimli = (await istek('/api/urunler/asili-elma-fidani')).json;
    assert.equal(bakimli.latinceAd, 'Değişime benimle başla');
    assert.deepEqual(bakimli.bakim, { sure: '3 ay', program: 'Haftalık, kişiye özel' });
    assert.equal((await istek('/api/urunler')).json[0].latinceAd, 'Değişime benimle başla');
    r = await panel(`/urunler/${elmaUrun}`, { method: 'PATCH', govde: { bakim: { sure: 'x'.repeat(81) } } });
    assert.equal(r.durum, 400);
    r = await panel(`/urunler/${elmaUrun}`, { method: 'PATCH', govde: { bakim: 'metin' } });
    assert.equal(r.durum, 400);
    assert.deepEqual((await panel('/urunler')).json.find(u => u.id === elmaUrun).bakim, { sure: '3 ay', program: 'Haftalık, kişiye özel' });
  });

  test('sepet fiyatı sunucuda hesaplanır, stok ve geçersiz ürün yakalanır', async () => {
    let r = await istek('/api/sepet/fiyatla', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: 2 }, { secenekId: ceviz, adet: 1 }, { secenekId: elma, adet: 1 }] } });
    assert.equal(r.durum, 200);
    assert.equal(r.json.toplamKurus, 75050 * 3 + 90000);
    assert.equal(r.json.sorunlar.length, 0);
    r = await istek('/api/sepet/fiyatla', { method: 'POST', govde: { sepet: [{ secenekId: azStok, adet: 2 }, { secenekId: 999999, adet: 1 }] } });
    assert.equal(r.json.sorunlar.length, 2);
    r = await istek('/api/sepet/fiyatla', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: -1 }] } });
    assert.equal(r.durum, 400);
    r = await istek('/api/sepet/fiyatla', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: 1, fiyatKurus: 1 }] } });
    assert.equal(r.json.toplamKurus, 75050, 'tarayıcıdan gelen fiyat yok sayılmalı');
  });

  test('ödeme başlatma: doğrulamalar ve iyzico isteği', async () => {
    const dene = (musteri, sozlesmeOnay = true, sepet = [{ secenekId: elma, adet: 1 }]) =>
      istek('/api/odeme/baslat', { method: 'POST', govde: { sepet, musteri, sozlesmeOnay } });

    assert.equal((await dene(MUSTERI, false)).durum, 400, 'sözleşme onaysız sipariş olmamalı');
    assert.equal((await dene({ ...MUSTERI, telefon: '123' })).durum, 400);
    assert.equal((await dene({ ...MUSTERI, il: 'Atlantis' })).durum, 400);
    assert.equal((await dene({ ...MUSTERI, email: 'gecersiz' })).durum, 400);
    assert.equal((await dene({ ...MUSTERI, ad: '<script>' })).durum, 400);
    assert.equal((await dene(MUSTERI, true, [{ secenekId: azStok, adet: 5 }])).durum, 409, 'stoktan fazla alınamamalı');
    assert.equal((await istek('/api/odeme/baslat', { method: 'POST', ham: '{bozuk', tur: 'application/json' })).durum, 400);

    const onceki = iyz.durum.istekler.length;
    const { token, siparisNo } = await siparisVer([{ secenekId: elma, adet: 2 }, { secenekId: ceviz, adet: 1 }]);
    const gonderilen = iyz.durum.istekler[onceki];
    assert.equal(gonderilen.price, '2401.0');
    assert.equal(gonderilen.paidPrice, '2401.0');
    const sepetToplami = gonderilen.basketItems.reduce((t, b) => t + Number(b.price), 0);
    assert.equal(sepetToplami.toFixed(2), '2401.00', 'sepet kalemleri toplamı fiyata eşit olmalı (iyzico kuralı)');
    assert.equal(gonderilen.buyer.gsmNumber, '+905551112233');
    assert.equal(gonderilen.buyer.email, 'ayse@example.com');
    assert.equal(gonderilen.currency, 'TRY');
    assert.match(gonderilen.callbackUrl, /\/api\/odeme\/sonuc$/);

    const s = await siparisAl(siparisNo);
    assert.equal(s.durum, 'odeme-bekliyor');
    assert.equal(s.iyzico_token, token);
    assert.ok(s.sozlesme_onay_tarihi);
    assert.match(s.sozlesme_html, /Ayşe Yılmaz/);
    assert.match(s.sozlesme_html, /2\.401,00 TL/);
    siparis1 = { token, siparisNo };
  });

  test('başarılı ödeme: sipariş onaylanır, stok düşer, e-postalar gider', async () => {
    const { token, siparisNo } = siparis1;
    const elmaOnce = await stok(elma);
    const r = await geriDonus(token);
    assert.equal(r.durum, 303);
    const s = await siparisAl(siparisNo);
    assert.equal(r.basliklar.get('location'), `/basarili.html?no=${siparisNo}&k=${s.takip_kodu}`);
    assert.equal(s.durum, 'odendi');
    assert.ok(s.odeme_id);
    assert.equal(s.odenen_kurus, 240100);
    assert.equal(s.odeme_detay.itemTransactions.length, 2);
    assert.ok(s.odeme_detay.itemTransactions[0].paymentTransactionId);
    assert.equal(s.odeme_detay.binNumber, undefined, 'gereksiz kart bilgisi saklanmamalı');
    assert.equal(await stok(elma), elmaOnce - 2);

    // aynı callback, iyzico bildirimi ve otomatik kontrol tekrar gelirse hiçbir şey değişmemeli
    await geriDonus(token);
    assert.equal((await istek('/api/odeme/bildirim', { method: 'POST', govde: { token, iyziEventType: 'CHECKOUT_FORM_AUTH', status: 'SUCCESS' } })).durum, 200);
    await isler.odemeKontrolTuru();
    assert.equal(await stok(elma), elmaOnce - 2, 'stok iki kez düşmemeli');
    assert.equal((await tek(`SELECT COUNT(*)::int AS n FROM siparis_olaylari WHERE siparis_id = $1 AND olay = 'odeme-alindi'`, [s.id])).n, 1);

    const kuyruk = (await pool.query('SELECT alici, konu FROM eposta_kuyrugu WHERE siparis_id = $1 ORDER BY id', [s.id])).rows;
    assert.deepEqual(kuyruk.map(k => k.alici), ['ayse@example.com', 'sahip@example.com']);

    await epostalariGonder();
    const postalar = smtp.postalar.map(p => ({ ...p, ...postaCoz(p.veri) })).filter(p => p.html.includes(`#${siparisNo}`));
    assert.equal(postalar.length, 2);
    const musteriPostasi = postalar.find(p => p.kime.some(k => k.includes('ayse@example.com')));
    assert.equal(musteriPostasi.ekler.length, 1);
    assert.equal(musteriPostasi.ekler[0].ad, `siparis-${siparisNo}-sozlesmeler.html`);
    assert.match(musteriPostasi.ekler[0].icerik, /Ayşe Yılmaz/);
    assert.match(musteriPostasi.html, /2\.401,00 TL/);
    assert.match(musteriPostasi.metin, new RegExp(`siparis\\.html\\?no=${siparisNo}&k=${s.takip_kodu}`));
    assert.equal((await tek('SELECT COUNT(*)::int AS n FROM eposta_kuyrugu WHERE gonderim IS NULL')).n, 0);

    // müşteri sipariş sayfası
    const gor = await istek(`/api/siparis/${siparisNo}?k=${s.takip_kodu}`);
    assert.equal(gor.durum, 200);
    assert.equal(gor.json.durumAdi, 'Ödeme alındı');
    assert.equal(gor.json.alici.il, 'Denizli');
    assert.equal(gor.json.email, undefined, 'e-posta herkese açık görünümde olmamalı');
    assert.equal((await istek(`/api/siparis/${siparisNo}?k=${'0'.repeat(40)}`)).durum, 404);
    assert.equal((await istek(`/api/siparis/${siparisNo}`)).durum, 404);
    const sorgu = await istek('/api/siparis/sorgula', { method: 'POST', govde: { siparisNo: `#${siparisNo}`, email: 'AYSE@example.com' } });
    assert.equal(sorgu.json.k, s.takip_kodu);
    assert.equal((await istek('/api/siparis/sorgula', { method: 'POST', govde: { siparisNo, email: 'baska@example.com' } })).durum, 404);
    const sozlesme = await istek(`/siparis/${siparisNo}/sozlesme?k=${s.takip_kodu}`);
    assert.equal(sozlesme.durum, 200);
    assert.match(sozlesme.basliklar.get('content-security-policy'), /default-src 'none'/);
    assert.match(sozlesme.metin, /Mesafeli Satış Sözleşmesi/);
  });

  test('başarısız ödeme, sonra müşteri tekrar deneyip öderse sipariş yine onaylanır', async () => {
    const elmaOnce = await stok(elma);
    const { token, siparisNo } = await siparisVer([{ secenekId: elma, adet: 1 }]);
    iyz.senaryoAyarla(token, { odeme: 'FAILURE' });
    const r = await geriDonus(token);
    assert.equal(r.durum, 303);
    assert.match(r.basliklar.get('location'), /^\/basarisiz\.html\?no=/);
    assert.equal((await siparisAl(siparisNo)).durum, 'odeme-basarisiz');
    assert.equal(await stok(elma), elmaOnce);

    iyz.senaryoAyarla(token, { odeme: 'SUCCESS' });
    await istek('/api/odeme/bildirim', { method: 'POST', govde: { token } });
    assert.equal((await siparisAl(siparisNo)).durum, 'odendi', 'para çekildiyse sipariş kaybolmamalı');
    assert.equal(await stok(elma), elmaOnce - 1);
  });

  test('dolandırıcılık incelemesi ve tutar uyuşmazlığı: otomatik onaylanmaz', async () => {
    const a = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    iyz.senaryoAyarla(a.token, { fraud: 0 });
    await geriDonus(a.token);
    let s = await siparisAl(a.siparisNo);
    assert.equal(s.durum, 'inceleme');
    let kuyruk = (await pool.query('SELECT alici FROM eposta_kuyrugu WHERE siparis_id = $1', [s.id])).rows;
    assert.deepEqual(kuyruk.map(k => k.alici), ['sahip@example.com'], 'müşteriye henüz "sipariş alındı" gitmemeli');
    assert.equal((await panel(`/siparisler/${s.id}`, { method: 'PATCH', govde: { durum: 'kargoda', kargoTakipNo: '12345' } })).durum, 400, 'incelemedeki sipariş kargolanamamalı');
    assert.equal((await panel(`/siparisler/${s.id}`, { method: 'PATCH', govde: { durum: 'odendi' } })).durum, 200);
    kuyruk = (await pool.query('SELECT alici FROM eposta_kuyrugu WHERE siparis_id = $1 ORDER BY id', [s.id])).rows;
    assert.deepEqual(kuyruk.map(k => k.alici), ['sahip@example.com', 'ayse@example.com']);

    const b = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    iyz.senaryoAyarla(b.token, { fiyat: 1 });
    await geriDonus(b.token);
    s = await siparisAl(b.siparisNo);
    assert.equal(s.durum, 'inceleme');
    const olay = await tek(`SELECT detay FROM siparis_olaylari WHERE siparis_id = $1 AND olay = 'odeme-incelemede'`, [s.id]);
    assert.match(olay.detay.neden, /tutar eşleşmiyor/);
  });

  test('müşteri siteye dönmeden tarayıcıyı kapatırsa: otomatik kontrol ödemeyi yakalar', async () => {
    const { token, siparisNo } = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    iyz.senaryoAyarla(token, { odeme: 'BEKLE' });
    const r = await geriDonus(token);
    assert.match(r.basliklar.get('location'), /^\/basarili\.html/, 'belirsizse "kontrol ediliyor" sayfasına gitmeli');
    assert.equal((await siparisAl(siparisNo)).durum, 'odeme-bekliyor');

    iyz.senaryoAyarla(token, { odeme: 'SUCCESS' });
    await pool.query(`UPDATE siparisler SET olusturma = NOW() - INTERVAL '5 minutes', son_kontrol = NULL WHERE siparis_no = $1`, [siparisNo]);
    await isler.odemeKontrolTuru();
    assert.equal((await siparisAl(siparisNo)).durum, 'odendi');
  });

  test('ödeme sayfası açılıp hiç ödenmezse süre sonunda "yarım kaldı" olur', async () => {
    const { token, siparisNo } = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    iyz.senaryoAyarla(token, { odeme: 'BEKLE' });
    await pool.query(`UPDATE siparisler SET olusturma = NOW() - INTERVAL '10 minutes' WHERE siparis_no = $1`, [siparisNo]);
    await isler.odemeKontrolTuru();
    assert.equal((await siparisAl(siparisNo)).durum, 'odeme-bekliyor', 'süre dolmadan kapatılmamalı');
    await pool.query(`UPDATE siparisler SET olusturma = NOW() - INTERVAL '60 minutes', son_kontrol = NULL WHERE siparis_no = $1`, [siparisNo]);
    await isler.odemeKontrolTuru();
    assert.equal((await siparisAl(siparisNo)).durum, 'terk-edildi');
  });

  test('iyzico cevap vermezse: sipariş kapatılmaz, sunucu çökmez', async () => {
    const { token, siparisNo } = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    iyz.senaryoAyarla(token, { gecikmeMs: 4000 });
    await pool.query(`UPDATE siparisler SET olusturma = NOW() - INTERVAL '60 minutes' WHERE siparis_no = $1`, [siparisNo]);
    const r = await geriDonus(token);
    assert.equal(r.durum, 303);
    assert.equal((await siparisAl(siparisNo)).durum, 'odeme-bekliyor', 'iyzico\'ya ulaşılamadıysa "yarım kaldı" denmemeli');
    iyz.senaryoAyarla(token, { gecikmeMs: 0 });
    await pool.query('UPDATE siparisler SET son_kontrol = NULL WHERE siparis_no = $1', [siparisNo]);
    await isler.odemeKontrolTuru();
    assert.equal((await siparisAl(siparisNo)).durum, 'odendi');
  });

  test('iyzico ödeme sayfası açamazsa müşteriye düzgün hata döner', async () => {
    iyz.durum.baslatmaHatasi = true;
    const r = await istek('/api/odeme/baslat', { method: 'POST', govde: { sepet: [{ secenekId: ceviz, adet: 1 }], musteri: MUSTERI, sozlesmeOnay: true } });
    iyz.durum.baslatmaHatasi = false;
    assert.equal(r.durum, 502);
    assert.match(r.json.hata, /Ödeme sayfası/);
    assert.equal((await tek('SELECT durum FROM siparisler ORDER BY olusturma DESC LIMIT 1')).durum, 'baslatilamadi');
  });

  test('aynı son ürünü iki kişi aynı anda alırsa: ödeme kabul edilir, işletme uyarılır', async () => {
    const a = await siparisVer([{ secenekId: azStok, adet: 1 }]);
    const b = await siparisVer([{ secenekId: azStok, adet: 1 }]);
    await Promise.all([geriDonus(a.token), geriDonus(b.token)]);
    const sa = await siparisAl(a.siparisNo);
    const sb = await siparisAl(b.siparisNo);
    assert.equal(sa.durum, 'odendi');
    assert.equal(sb.durum, 'odendi');
    assert.equal(await stok(azStok), 0);
    assert.equal([sa.stok_uyarisi, sb.stok_uyarisi].filter(Boolean).length, 1);
    const ben = (await panel('/ben')).json;
    assert.ok(ben.uyarilar.some(u => /stok yetersizdi/.test(u.mesaj)));
  });

  test('havale ile ödeme: IBAN gösterilir, panelden onaylanınca stok düşer ve e-postalar gider', async () => {
    const ayarlar = require('../lib/ayarlar');
    const eski = ayarlar.odemeYontemi;
    ayarlar.odemeYontemi = 'havale';
    try {
      const stokOnce = await stok(elma);
      const r = await istek('/api/odeme/baslat', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: 1 }], musteri: MUSTERI, sozlesmeOnay: true } });
      assert.equal(r.durum, 200, r.metin);
      assert.match(r.json.yonlendir, /^\/siparis\.html\?no=\d+&k=/);
      assert.equal(r.json.odemeUrl, undefined, 'iyzico sayfası açılmamalı');
      const s = await siparisAl(r.json.siparisNo);
      assert.equal(s.durum, 'havale-bekleniyor');
      assert.equal(s.iyzico_token, null);
      assert.equal(await stok(elma), stokOnce, 'para gelmeden kontenjan düşmez');

      // Müşterinin sipariş sayfası banka bilgilerini gösterir
      const k = new URL(r.json.yonlendir, adres).searchParams.get('k');
      const g = await istek(`/api/siparis/${r.json.siparisNo}?k=${encodeURIComponent(k)}`);
      assert.equal(g.durum, 200, g.metin);
      assert.equal(g.json.havale.aciklama, `#${r.json.siparisNo}`);
      assert.equal(g.json.havale.tutarKurus, s.toplam_kurus);
      assert.equal(g.json.odendi, false);

      await epostalariGonder();
      const ilk = smtp.postalar.map(p => postaCoz(p.veri)).filter(p => p.html.includes(`#${r.json.siparisNo}`));
      assert.ok(ilk.some(p => p.html.includes('IBAN')), 'müşteriye IBAN e-postası gitmeli');
      assert.ok(ilk.some(p => p.html.includes('Yeni öğrenci')), 'işletmeye havale bekleniyor e-postası gitmeli');

      // Panelde onay: Yeni öğrenci (odendi)
      const yol = `/siparisler/${s.id}`;
      assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'hazirlaniyor' } })).durum, 400, 'ödeme onaylanmadan program aşamasına geçilmez');
      assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'odendi' } })).durum, 200);
      const sonra = await siparisAl(r.json.siparisNo);
      assert.equal(sonra.durum, 'odendi');
      assert.ok(sonra.odeme_tarihi);
      assert.equal(sonra.odenen_kurus, sonra.toplam_kurus);
      assert.equal(await stok(elma), stokOnce - 1);
      assert.ok(await tek('SELECT 1 AS var FROM eposta_kuyrugu WHERE anahtar = $1', [`siparis-alindi:${r.json.siparisNo}`]), '"ödemen alındı" e-postası gitmeli');

      // İşlem geçmişinde kimin onayladığı yazar
      const gecmis = (await panel(yol)).json.olaylar;
      const onayOlayi = gecmis.find(o => o.olay === 'havale-onaylandi');
      assert.ok(onayOlayi && onayOlayi.detay.yapan, 'havale onayını yapan yönetici kayda geçmeli');
      assert.ok(gecmis.find(o => o.olay === 'durum-degisti' && o.detay.yeni === 'odendi' && o.detay.yapan));

      // Öğrenciler: siparişlerden derlenir, aynı e-posta tek öğrenci
      const ogr = (await panel(`/ogrenciler?ara=${encodeURIComponent(MUSTERI.email.toLowerCase())}`)).json;
      assert.equal(ogr.length, 1);
      assert.ok(ogr[0].paket_sayisi >= 1);
      assert.ok(ogr[0].toplam_kurus >= s.toplam_kurus);
      assert.ok((await panel('/ogrenciler?ara=0555%20111')).json.length >= 1, 'telefonla arama');
      assert.equal((await panel('/ogrenciler?ara=boylebirisiyok')).json.length, 0);

      // Havale gelmeyen sipariş iptal edilebilir (iade gerekmez)
      const r2 = await istek('/api/odeme/baslat', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: 1 }], musteri: MUSTERI, sozlesmeOnay: true } });
      const s2 = await siparisAl(r2.json.siparisNo);
      assert.equal((await panel(`/siparisler/${s2.id}`, { method: 'PATCH', govde: { durum: 'iptal' } })).durum, 200);
      assert.equal(await stok(elma), stokOnce - 1, 'ödenmemiş iptalde kontenjan değişmez');
    } finally {
      ayarlar.odemeYontemi = eski;
    }
  });

  test('panel: sipariş durumu (koçluk adımları), iptal ve e-postalar', async () => {
    const { token, siparisNo } = await siparisVer([{ secenekId: elma, adet: 1 }], { ...MUSTERI, adres: 'Mah. <img src=x onerror=alert(1)> Sok. 5' });
    await geriDonus(token);
    const s = await siparisAl(siparisNo);
    const yol = `/siparisler/${s.id}`;

    // Online koçluk: "Koçluk sürüyor" (kargoda) adımı için takip numarası gerekmez
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'teslim-edildi' } })).durum, 400, 'koçluk başlamadan tamamlanamaz');
    assert.equal((await panel(yol, { method: 'PATCH', govde: { kargoTakipNo: 'abc def!' } })).durum, 400);
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'hazirlaniyor' } })).durum, 200);
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'kargoda' } })).durum, 200, 'takip no olmadan koçluk başlatılabilir');
    assert.equal((await siparisAl(siparisNo)).kargo_takip_no, null);
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'kargoda' } })).durum, 400, 'değişiklik yoksa hata');
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'teslim-edildi' } })).durum, 200);
    assert.equal((await panel(yol, { method: 'PATCH', govde: { durum: 'odendi' } })).durum, 400, 'geri gidilemez');

    await epostalariGonder();
    const cozulmus = smtp.postalar.map(p => postaCoz(p.veri)).filter(p => p.html.includes(`#${siparisNo}`));
    assert.ok(cozulmus.some(p => p.html.includes('programın hazır')), '"koçluğun başladı" e-postası gitmeli');
    assert.ok(cozulmus.some(p => p.html.includes('süresi tamamlandı')), '"tamamlandı" e-postası gitmeli');
    const tumHtml = cozulmus.map(p => p.html).join('\n');
    assert.match(tumHtml, /&lt;img src=x/, 'adres e-postada görünmeli');
    assert.doesNotMatch(tumHtml, /<img src=x/, 'müşteri girdisi HTML e-postada kaçışlanmalı');

    const detay = (await panel(yol)).json;
    assert.deepEqual(detay.olaylar.filter(o => o.olay === 'durum-degisti').map(o => o.detay.yeni), ['hazirlaniyor', 'kargoda', 'teslim-edildi']);
    assert.ok(detay.epostalar.length >= 4);

    // iptal: stok geri eklenir, müşteriye e-posta gider
    const iptal = await siparisVer([{ secenekId: ceviz, adet: 3 }]);
    await geriDonus(iptal.token);
    const cevizSonra = await stok(ceviz);
    const si = await siparisAl(iptal.siparisNo);
    assert.equal((await panel(`/siparisler/${si.id}`, { method: 'PATCH', govde: { durum: 'iptal' } })).durum, 400, 'para iade edilmeden iptal edilemez');
    assert.equal((await panel(`/siparisler/${si.id}/iade`, { method: 'POST' })).durum, 200);
    assert.equal(await stok(ceviz), cevizSonra + 3);
    assert.ok(await tek(`SELECT 1 AS var FROM eposta_kuyrugu WHERE anahtar = $1`, [`iptal:${iptal.siparisNo}`]));

    // liste, arama ve filtre
    const liste = (await panel(`/siparisler?durum=tum&ara=${siparisNo}`)).json;
    assert.equal(liste.length, 1);
    assert.equal((await panel('/siparisler?durum=uydurma')).durum, 400);
    assert.ok((await panel('/siparisler?ara=Ay%C5%9Fe')).json.length > 0);
    assert.ok((await panel('/siparisler?durum=terk-edildi')).json.length >= 1);
    const soz = await panel(`/siparisler/${s.id}/sozlesme`);
    assert.match(soz.metin, /&lt;img src=x/, 'sözleşmede müşteri girdisi kaçışlanmalı');
  });

  test('otomatik iade: aynı gün tam iptal, sonraki gün kalem iadesi, hata ve tekrar deneme', async () => {
    // 1) Aynı gün: ödeme tamamen iptal edilir
    let a = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    await geriDonus(a.token);
    let s = await siparisAl(a.siparisNo);
    let r = await panel(`/siparisler/${s.id}/iade`, { method: 'POST' });
    assert.equal(r.durum, 200, r.metin);
    s = await siparisAl(a.siparisNo);
    assert.equal(s.durum, 'iptal');
    assert.equal(iyz.durum.iptaller.at(-1).paymentId, s.odeme_id);
    assert.ok(s.iade_detay.some(x => x.tur === 'iptal'));
    assert.equal((await panel(`/siparisler/${s.id}/iade`, { method: 'POST' })).durum, 400, 'iptal edilmiş sipariş tekrar iade edilemez');

    // 2) Ertesi gün (iptal süresi geçmiş): her kalem ayrı iade edilir; iade reddedilirse sipariş iptal OLMAZ
    a = await siparisVer([{ secenekId: ceviz, adet: 1 }, { secenekId: elma, adet: 2 }]);
    await geriDonus(a.token);
    s = await siparisAl(a.siparisNo);
    await pool.query(`UPDATE siparisler SET odeme_tarihi = NOW() - INTERVAL '2 days' WHERE id = $1`, [s.id]);
    const cevizOnce = await stok(ceviz);
    const oncekiIade = iyz.durum.iadeler.length;
    iyz.durum.iadeHatasiKalan = 1; // ilk istek reddedilir
    r = await panel(`/siparisler/${s.id}/iade`, { method: 'POST' });
    assert.equal(r.durum, 502);
    assert.match(r.json.hata, /iptal EDİLMEDİ/);
    s = await siparisAl(a.siparisNo);
    assert.equal(s.durum, 'odendi', 'iade olmadıysa sipariş iptal edilmemeli');
    assert.equal(await stok(ceviz), cevizOnce, 'stok değişmemeli');
    assert.ok((await tek(`SELECT 1 AS v FROM siparis_olaylari WHERE siparis_id = $1 AND olay = 'iade-basarisiz'`, [s.id])));

    // tekrar dene: iki kalem de iade edilir, iptal denemesi yapılmaz (gün geçmiş)
    const iptalSayisi = iyz.durum.iptaller.length;
    r = await panel(`/siparisler/${s.id}/iade`, { method: 'POST' });
    assert.equal(r.durum, 200, r.metin);
    s = await siparisAl(a.siparisNo);
    assert.equal(s.durum, 'iptal');
    assert.equal(iyz.durum.iptaller.length, iptalSayisi);
    const buSiparis = iyz.durum.iadeler.slice(oncekiIade).filter(i => i.conversationId === s.id);
    assert.equal(buSiparis.length, 2, 'her kalem bir kez iade edilmeli');
    assert.equal(s.iade_kurus, s.toplam_kurus);
    assert.equal(await stok(ceviz), cevizOnce + 1, 'stok geri eklenmeli');

    // 3) Kısmi iade sonrası tekrar deneme: zaten iade edilen kalem tekrar iade edilmez
    a = await siparisVer([{ secenekId: ceviz, adet: 1 }, { secenekId: elma, adet: 1 }]);
    await geriDonus(a.token);
    s = await siparisAl(a.siparisNo);
    await pool.query(`UPDATE siparisler SET odeme_tarihi = NOW() - INTERVAL '2 days' WHERE id = $1`, [s.id]);
    const ilkKalem = s.odeme_detay.itemTransactions[0].paymentTransactionId;
    const ikinciKalem = s.odeme_detay.itemTransactions[1].paymentTransactionId;
    iyz.durum.iadeler.push({ paymentTransactionId: ikinciKalem, conversationId: 'baska' }); // ikinci kalem reddedilecek
    r = await panel(`/siparisler/${s.id}/iade`, { method: 'POST' });
    assert.equal(r.durum, 502);
    assert.match(r.json.hata, /Bazı ürünlerin parası iade edildi/);
    s = await siparisAl(a.siparisNo);
    assert.equal(s.durum, 'odendi');
    assert.deepEqual(s.iade_detay.filter(x => x.tur === 'iade').map(x => x.paymentTransactionId), [ilkKalem]);
    // engeli kaldır, tekrar dene: sadece ikinci kalem gönderilir
    iyz.durum.iadeler = iyz.durum.iadeler.filter(i => !(i.paymentTransactionId === ikinciKalem && i.conversationId === 'baska'));
    const once = iyz.durum.iadeler.length;
    r = await panel(`/siparisler/${s.id}/iade`, { method: 'POST' });
    assert.equal(r.durum, 200, r.metin);
    assert.deepEqual(iyz.durum.iadeler.slice(once).map(i => i.paymentTransactionId), [ikinciKalem]);
    assert.equal((await siparisAl(a.siparisNo)).durum, 'iptal');

    // 4) Teslim edilmiş sipariş: "iade edildi" olur
    a = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    await geriDonus(a.token);
    s = await siparisAl(a.siparisNo);
    await panel(`/siparisler/${s.id}`, { method: 'PATCH', govde: { durum: 'kargoda', kargoTakipNo: '99887766' } });
    await panel(`/siparisler/${s.id}`, { method: 'PATCH', govde: { durum: 'teslim-edildi' } });
    assert.equal((await panel(`/siparisler/${s.id}/iade`, { method: 'POST' })).durum, 200);
    assert.equal((await siparisAl(a.siparisNo)).durum, 'iade-edildi');

    // 5) Elle iade (işletme parayı iyzico panelinden iade ettiyse)
    a = await siparisVer([{ secenekId: ceviz, adet: 1 }]);
    await geriDonus(a.token);
    s = await siparisAl(a.siparisNo);
    assert.equal((await panel(`/siparisler/${s.id}`, { method: 'PATCH', govde: { durum: 'iptal', elleIade: true } })).durum, 200);
    const olay = await tek(`SELECT detay FROM siparis_olaylari WHERE siparis_id = $1 AND olay = 'durum-degisti'`, [s.id]);
    assert.equal(olay.detay.elleIade, true);
  });

  test('e-posta sunucusu çalışmazsa e-posta kaybolmaz, sonra gönderilir', async () => {
    const { token, siparisNo } = await siparisVer([{ secenekId: elma, adet: 1 }]);
    smtp.reddetAyarla(true);
    await geriDonus(token);
    await epostalariGonder();
    let bekleyen = (await pool.query(`SELECT deneme, son_hata FROM eposta_kuyrugu WHERE anahtar = $1`, [`siparis-alindi:${siparisNo}`])).rows[0];
    assert.equal(bekleyen.deneme, 1);
    assert.ok(bekleyen.son_hata);
    smtp.reddetAyarla(false);
    await pool.query('UPDATE eposta_kuyrugu SET sonraki_deneme = NOW() WHERE gonderim IS NULL');
    await epostalariGonder();
    bekleyen = (await pool.query(`SELECT gonderim FROM eposta_kuyrugu WHERE anahtar = $1`, [`siparis-alindi:${siparisNo}`])).rows[0];
    assert.ok(bekleyen.gonderim);
  });

  test('yasal sayfalar ve bilinmeyen sayfalar', async () => {
    for (const ad of ['mesafeli-satis-sozlesmesi', 'on-bilgilendirme-formu', 'kvkk-aydinlatma-metni', 'iptal-ve-iade-kosullari', 'teslimat-kosullari', 'gizlilik-ve-cerez-politikasi', 'iletisim']) {
      const r = await istek(`/sayfa/${ad}`);
      assert.equal(r.durum, 200, ad);
      assert.match(r.metin, /Xsportgym/);
    }
    assert.equal((await istek('/sayfa/constructor')).durum, 404);
    assert.equal((await istek('/sayfa/__proto__')).durum, 404);
    const on = await istek('/api/sozlesme/onizleme', { method: 'POST', govde: { sepet: [{ secenekId: elma, adet: 1 }], musteri: { ad: '<b>x</b>' } } });
    assert.match(on.json.html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.equal((await istek('/api/iller')).json.length, 81);
  });

  test('panel: görsel ve ürün silme', async () => {
    const urunler = (await panel('/urunler')).json;
    const elmaUrun = urunler.find(u => u.slug === 'asili-elma-fidani');
    assert.equal((await panel(`/gorseller/${elmaUrun.gorseller[0]}`, { method: 'DELETE' })).durum, 200);
    assert.equal((await panel(`/urunler/${elmaUrun.id}/gorsel-sirasi`, { method: 'PUT', govde: { idler: [1, 2] } })).durum, 409);
    const yeni = (await panel('/urunler', { method: 'POST', govde: { ad: 'Silinecek', kategori: 'Deneme' } })).json.id;
    assert.equal((await panel(`/urunler/${yeni}`, { method: 'DELETE' })).durum, 200);
    assert.equal((await panel(`/urunler/${yeni}`, { method: 'DELETE' })).durum, 404);
  });

  test('üyelik: kayıt, giriş, üye siparişi, bilgiler, şifre değiştirme/sıfırlama, hesap silme', async () => {
    const h = (yol, ayar = {}) => istek(`/api/hesap${yol}`, { ...ayar, basliklar: { 'X-Istek': 'panel', ...(ayar.basliklar || {}) } });
    const cerezAl = r => r.basliklar.getSetCookie().find(c => c.startsWith('oturum=')).split(';')[0];

    assert.equal((await h('/kayit', { method: 'POST', govde: { ad: 'Zeynep', soyad: 'Kaya', email: 'zeynep@example.com', sifre: 'uzun-sifre-1' } })).durum, 400, 'KVKK onayı şart');
    assert.equal((await h('/kayit', { method: 'POST', govde: { ad: 'Zeynep', soyad: 'Kaya', email: 'zeynep@example.com', sifre: '12345678', kvkkOnay: true } })).durum, 400, 'zayıf şifre');
    let r = await h('/kayit', { method: 'POST', govde: { ad: 'Zeynep', soyad: 'Kaya', email: 'Zeynep@Example.com', telefon: '0533 222 33 44', sifre: 'uzun-sifre-1', kvkkOnay: true } });
    assert.equal(r.durum, 201, r.metin);
    let cerez = cerezAl(r);
    assert.equal((await h('/kayit', { method: 'POST', govde: { ad: 'Başka', soyad: 'Kişi', email: 'zeynep@example.com', sifre: 'uzun-sifre-2', kvkkOnay: true } })).durum, 409);

    r = await h('/ben', { cerez });
    assert.equal(r.json.girisli, true);
    assert.equal(r.json.kullanici.email, 'zeynep@example.com');
    assert.equal(r.json.kullanici.sifre_hash, undefined);
    assert.equal((await h('/ben')).json.girisli, false);

    // müşteri yönetim paneline giremez
    assert.equal((await istek('/api/admin/siparisler', { cerez })).durum, 403);
    assert.equal((await h('/giris', { method: 'POST', govde: { kimlik: 'zeynep@example.com', sifre: 'yanlis-sifre' } })).durum, 401);
    assert.equal((await h('/giris', { method: 'POST', govde: { kimlik: 'yok@example.com', sifre: 'yanlis-sifre' } })).json.hata,
      'E-posta/kullanıcı adı veya şifre yanlış.', 'hangi e-postanın üye olduğu anlaşılmamalı');

    // üye siparişi: hesaba bağlanır, adres kaydedilir
    r = await istek('/api/odeme/baslat', { method: 'POST', cerez, govde: { sepet: [{ secenekId: ceviz, adet: 1 }], musteri: { ...MUSTERI, ad: 'Zeynep', soyad: 'Kaya' }, sozlesmeOnay: true, adresiKaydet: true } });
    assert.equal(r.durum, 200, r.metin);
    await geriDonus(r.json.odemeUrl.split('/').pop());
    const uyeSiparisi = await siparisAl(r.json.siparisNo);
    assert.ok(uyeSiparisi.kullanici_id);
    r = await h('/ben', { cerez });
    assert.equal(r.json.kullanici.il, 'Denizli');
    assert.equal(r.json.kullanici.ilce, 'Pamukkale');
    const liste = (await h('/siparislerim', { cerez })).json;
    assert.equal(liste.length, 1);
    assert.equal(liste[0].durumAdi, 'Ödeme alındı');
    assert.equal(liste[0].k, uyeSiparisi.takip_kodu);
    // üye olmadan verilen siparişler bu listede görünmez (aynı e-postayla bile)
    assert.equal((await h('/siparislerim')).durum, 401);

    // bilgileri güncelle
    r = await h('/bilgiler', { method: 'PATCH', cerez, govde: { ad: 'Zeynep', soyad: 'Kaya Yıldız', telefon: '05332223344', il: 'İzmir', ilce: 'Bornova', adres: 'Yeni adres sok. 1', postaKodu: '35000' } });
    assert.equal(r.durum, 200, r.metin);
    assert.equal(r.json.kullanici.il, 'İzmir');

    // şifre değiştir: eski oturum (başka cihaz) kapanır, yeni çerez çalışır
    const eskiCerez = cerez;
    assert.equal((await h('/sifre-degistir', { method: 'POST', cerez, govde: { mevcutSifre: 'yanlis', yeniSifre: 'yeni-sifre-22' } })).durum, 401);
    r = await h('/sifre-degistir', { method: 'POST', cerez, govde: { mevcutSifre: 'uzun-sifre-1', yeniSifre: 'yeni-sifre-22' } });
    assert.equal(r.durum, 200);
    cerez = cerezAl(r);
    assert.equal((await h('/ben', { cerez: eskiCerez })).json.girisli, false, 'eski oturum kapanmalı');
    assert.equal((await h('/ben', { cerez })).json.girisli, true);

    // şifremi unuttum: kayıtlı olmayan e-posta için de aynı cevap
    assert.equal((await h('/sifremi-unuttum', { method: 'POST', govde: { email: 'yok@example.com' } })).durum, 200);
    assert.equal((await h('/sifremi-unuttum', { method: 'POST', govde: { email: 'zeynep@example.com' } })).durum, 200);
    const posta = await tek(`SELECT html FROM eposta_kuyrugu WHERE alici = 'zeynep@example.com' AND konu LIKE '%şifre sıfırlama' ORDER BY id DESC LIMIT 1`);
    const kod = /t=([0-9a-f]{64})/.exec(posta.html)[1];
    assert.equal((await h('/sifre-sifirla', { method: 'POST', govde: { kod: 'a'.repeat(64), sifre: 'sifirlanmis-3' } })).durum, 400);
    r = await h('/sifre-sifirla', { method: 'POST', govde: { kod, sifre: 'sifirlanmis-3' } });
    assert.equal(r.durum, 200);
    assert.equal((await h('/sifre-sifirla', { method: 'POST', govde: { kod, sifre: 'baska-sifre-4' } })).durum, 400, 'bağlantı tek kullanımlık');
    assert.equal((await h('/ben', { cerez })).json.girisli, false, 'sıfırlama diğer oturumları kapatmalı');
    r = await h('/giris', { method: 'POST', govde: { kimlik: 'ZEYNEP@example.com', sifre: 'sifirlanmis-3' } });
    assert.equal(r.durum, 200);
    cerez = cerezAl(r);

    // panelde üyeler listesi
    const uyeler = (await panel('/uyeler')).json;
    assert.equal(uyeler.find(u => u.email === 'zeynep@example.com').siparis_sayisi, 1);

    // hesabı sil: sipariş kalır, bağı kopar
    assert.equal((await h('', { method: 'DELETE', cerez, govde: { sifre: 'yanlis' } })).durum, 401);
    assert.equal((await h('', { method: 'DELETE', cerez, govde: { sifre: 'sifirlanmis-3' } })).durum, 200);
    assert.equal((await siparisAl(uyeSiparisi.siparis_no)).kullanici_id, null);
    assert.equal((await h('/ben', { cerez })).json.girisli, false);
  });

  test('yönetici: kullanıcı adı ve şifre değiştirme', async () => {
    let r = await panel('/hesabim', { method: 'PATCH', govde: { mevcutSifre: 'yanlis', kullaniciAdi: 'fidanci' } });
    assert.equal(r.durum, 401);
    r = await panel('/hesabim', { method: 'PATCH', govde: { mevcutSifre: SIFRE, kullaniciAdi: 'fidanci', yeniSifre: 'yeni-yonetici-sifresi' } });
    assert.equal(r.durum, 200, r.metin);
    const eski = adminCerez;
    adminCerez = r.basliklar.getSetCookie().find(c => c.startsWith('oturum=')).split(';')[0];
    assert.equal((await istek('/api/admin/ben', { cerez: eski })).durum, 401, 'eski yönetici oturumu kapanmalı');
    assert.equal((await panel('/ben')).json.kullaniciAdi, 'fidanci');
    r = await istek('/api/hesap/giris', { method: 'POST', govde: { kimlik: 'fidanci', sifre: 'yeni-yonetici-sifresi' }, basliklar: { 'X-Istek': 'panel' } });
    assert.equal(r.json.rol, 'admin');
  });

  test('giriş denemesi sınırı', async () => {
    let son;
    for (let i = 0; i < 11; i++) {
      son = await istek('/api/hesap/giris', { method: 'POST', govde: { kimlik: 'admin', sifre: 'yanlis' }, basliklar: { 'X-Istek': 'panel' } });
    }
    assert.equal(son.durum, 429);
  });
}
