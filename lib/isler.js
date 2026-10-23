'use strict';
// Arka plan işleri:
//  1) Ödeme kontrolü: Müşteri ödeme yapıp siteye dönmeden tarayıcıyı kapatırsa sipariş "ödeme bekleniyor"da
//     kalır. Bu iş, sonucu belli olmayan ödemeleri iyzico'ya sorar; ödenmişse siparişi onaylar,
//     ödeme süresi dolmuşsa "yarım kaldı" olarak kapatır. Böylece hiçbir ödeme kaybolmaz.
//  2) E-posta gönderimi: kuyruktaki e-postaları gönderir, gönderilemeyenleri tekrar dener.
//
// Veritabanını (Neon) gereksiz yere uyandırmamak için sürekli çalışmazlar: sadece iş olduğunda,
// sunucu açılırken ve 6 saatte bir güvenlik turu olarak çalışırlar.
const { pool } = require('./db');
const siparis = require('./siparis');
const eposta = require('./eposta');
const hesap = require('./hesap');

const zamanlayici = {};
const planliZaman = {};
const calisiyor = {};
let guvenlikTuru = null;
let durduruldu = false;

function planla(ad, gecikmeMs, fn) {
  if (durduruldu) return;
  const zaman = Date.now() + gecikmeMs;
  if (zamanlayici[ad] && planliZaman[ad] <= zaman) return; // zaten daha erken planlı
  clearTimeout(zamanlayici[ad]);
  planliZaman[ad] = zaman;
  zamanlayici[ad] = setTimeout(() => {
    zamanlayici[ad] = null;
    calistir(ad, fn);
  }, gecikmeMs);
  zamanlayici[ad].unref();
}

async function calistir(ad, fn) {
  if (calisiyor[ad]) return planla(ad, 5000, fn);
  calisiyor[ad] = true;
  try {
    await fn();
  } catch (hata) {
    console.error(`Arka plan işi hatası (${ad}):`, hata.message);
    planla(ad, 5 * 60 * 1000, fn);
  } finally {
    calisiyor[ad] = false;
  }
}

async function odemeKontrolTuru() {
  const LIMIT = 25;
  // Her siparişi tek bir işçiye ayır (iki sunucu çalışsa bile aynı sipariş iki kez sorulmaz)
  const { rows } = await pool.query(`
    UPDATE siparisler SET son_kontrol = NOW()
    WHERE id IN (
      SELECT id FROM siparisler
      WHERE durum = 'odeme-bekliyor' AND iyzico_token IS NOT NULL
        AND olusturma < NOW() - INTERVAL '2 minutes'
        AND olusturma > NOW() - INTERVAL '3 days'
        AND (son_kontrol IS NULL OR son_kontrol < NOW() - INTERVAL '3 minutes')
      ORDER BY olusturma
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING iyzico_token
  `, [LIMIT]);

  for (const { iyzico_token: token } of rows) {
    await siparis.odemeyiSonuclandir(token, 'kontrol', { suresiDolduysaKapat: true });
  }

  const { rows: [kalan] } = await pool.query(`
    SELECT COUNT(*)::int AS adet FROM siparisler
    WHERE durum = 'odeme-bekliyor' AND iyzico_token IS NOT NULL AND olusturma > NOW() - INTERVAL '3 days'
  `);
  if (kalan.adet > 0) planla('odeme', rows.length === LIMIT ? 2000 : 4 * 60 * 1000, odemeKontrolTuru);
  return { kontrolEdilen: rows.length, bekleyen: kalan.adet };
}

async function epostaTuru() {
  const sonuc = await eposta.bekleyenleriGonder();
  if (sonuc.dahaVar) planla('eposta', 500, epostaTuru);
  else if (sonuc.enYakinTekrarMs) planla('eposta', sonuc.enYakinTekrarMs + 1000, epostaTuru);
  return sonuc;
}

function baslat() {
  durduruldu = false;
  siparis.tetikleyicileriAyarla({
    epostaTetikle: () => planla('eposta', 200, epostaTuru),
    odemeKontrolPlanla: () => planla('odeme', 4 * 60 * 1000, odemeKontrolTuru)
  });
  hesap.tetikleyiciAyarla(() => planla('eposta', 200, epostaTuru));
  planla('odeme', 15 * 1000, odemeKontrolTuru);
  planla('eposta', 5 * 1000, epostaTuru);
  guvenlikTuru = setInterval(() => {
    planla('odeme', 0, odemeKontrolTuru);
    planla('eposta', 0, epostaTuru);
  }, 6 * 60 * 60 * 1000);
  guvenlikTuru.unref();
}

function durdur() {
  durduruldu = true;
  for (const ad of Object.keys(zamanlayici)) clearTimeout(zamanlayici[ad]);
  clearInterval(guvenlikTuru);
}

module.exports = { baslat, durdur, odemeKontrolTuru, epostaTuru };
