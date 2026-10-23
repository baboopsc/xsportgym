'use strict';
const crypto = require('crypto');

// Kullanıcıya gösterilecek hatalar. Hata yakalayıcı bunları olduğu gibi JSON olarak döner.
class KullaniciHatasi extends Error {
  constructor(mesaj, durumKodu = 400) {
    super(mesaj);
    this.kullaniciMesaji = mesaj;
    this.durumKodu = durumKodu;
  }
}

// HTML içine yazılacak her metin buradan geçer (XSS koruması)
function esc(deger) {
  return String(deger ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 123450 -> "1.234,50 TL"
function tl(kurus) {
  return (Number(kurus) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

// 123450 -> "1234.50" (iyzico'nun beklediği biçim)
function kurustanIyzico(kurus) {
  const tam = Math.trunc(kurus / 100);
  const kalan = String(kurus % 100).padStart(2, '0');
  return `${tam}.${kalan}`;
}

// iyzico'dan gelen 1234.5 / "1234.50" -> 123450 (yuvarlama hatası olmadan)
function iyzicodanKurus(deger) {
  const metin = String(deger ?? '').trim();
  const eslesme = /^(\d+)(?:\.(\d{1,8}))?$/.exec(metin);
  if (!eslesme) return NaN;
  const kurusKismi = (eslesme[2] || '').padEnd(2, '0');
  const ilkIki = Number(kurusKismi.slice(0, 2));
  const yuvarla = kurusKismi.length > 2 && Number(kurusKismi[2]) >= 5 ? 1 : 0;
  return Number(eslesme[1]) * 100 + ilkIki + yuvarla;
}

// Panelde girilen "750" veya "750,50" -> 75050 (binlik ayırıcı kabul edilmez, karışıklık olmasın)
function tlMetnindenKurus(deger) {
  const metin = String(deger ?? '').trim().replace(/\s/g, '');
  const eslesme = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(metin);
  if (!eslesme) return NaN;
  return Number(eslesme[1]) * 100 + Number((eslesme[2] || '').padEnd(2, '0'));
}

// "Aşılı Ceviz Fidanı" -> "asili-ceviz-fidani"
function slugYap(metin) {
  const harfler = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return String(metin)
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[çğıiöşüâîû]/g, h => harfler[h])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'urun';
}

function rastgeleKod(bayt = 20) {
  return crypto.randomBytes(bayt).toString('hex');
}

// "::ffff:127.0.0.1" -> "127.0.0.1"
function ipDuzelt(ip) {
  const metin = String(ip || '');
  return metin.startsWith('::ffff:') ? metin.slice(7) : (metin || '0.0.0.0');
}

// Sabit sürede karşılaştırma (gizli kodları karşılaştırırken zamanlama saldırısını önler)
function guvenliEsit(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function tarihMetni(tarih) {
  return new Date(tarih).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'long', timeStyle: 'short' });
}

module.exports = {
  KullaniciHatasi, esc, tl, kurustanIyzico, iyzicodanKurus, tlMetnindenKurus,
  slugYap, rastgeleKod, ipDuzelt, guvenliEsit, tarihMetni
};
