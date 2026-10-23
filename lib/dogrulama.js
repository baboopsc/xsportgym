'use strict';
const { KullaniciHatasi } = require('./yardimci');
const iller = require('./iller');

// Kontrol karakterlerini temizle, boşlukları sadeleştir
function temizle(deger, cokSatirli = false) {
  if (typeof deger !== 'string') return '';
  let metin = deger.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  metin = cokSatirli
    ? metin.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : metin.replace(/\s+/g, ' ');
  return metin.trim();
}

function metinAlani(deger, { ad, min = 1, maks, zorunlu = true, cokSatirli = false, desen, desenMesaji }) {
  const metin = temizle(deger, cokSatirli);
  if (!metin) {
    if (zorunlu) throw new KullaniciHatasi(`${ad} boş bırakılamaz.`);
    return '';
  }
  if (metin.length < min) throw new KullaniciHatasi(`${ad} en az ${min} karakter olmalı.`);
  if (metin.length > maks) throw new KullaniciHatasi(`${ad} en fazla ${maks} karakter olabilir.`);
  if (desen && !desen.test(metin)) throw new KullaniciHatasi(desenMesaji || `${ad} geçersiz.`);
  return metin;
}

// "0555 111 22 33", "5551112233", "+90 555 111 22 33" -> "+905551112233"
function telefon(deger) {
  let rakamlar = String(deger ?? '').replace(/\D/g, '');
  if (rakamlar.startsWith('90') && rakamlar.length === 12) rakamlar = rakamlar.slice(2);
  if (rakamlar.startsWith('0') && rakamlar.length === 11) rakamlar = rakamlar.slice(1);
  if (!/^5\d{9}$/.test(rakamlar)) {
    throw new KullaniciHatasi('Cep telefonu numarasını 05xx xxx xx xx şeklinde yazın.');
  }
  return `+90${rakamlar}`;
}

function eposta(deger) {
  const metin = temizle(deger).toLowerCase();
  if (metin.length > 120 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(metin)) {
    throw new KullaniciHatasi('E-posta adresi geçersiz.');
  }
  return metin;
}

const ISIM = /^[\p{L}][\p{L} .'-]*$/u;

// Ödeme sayfasındaki müşteri formu
function musteriBilgileri(girdi) {
  const m = girdi && typeof girdi === 'object' ? girdi : {};
  const il = temizle(m.il);
  if (!iller.includes(il)) throw new KullaniciHatasi('Lütfen listeden il seçin.');

  const postaKodu = temizle(m.postaKodu);
  if (postaKodu && !/^\d{5}$/.test(postaKodu)) throw new KullaniciHatasi('Posta kodu 5 haneli olmalı.');

  return {
    ad: metinAlani(m.ad, { ad: 'Ad', min: 2, maks: 50, desen: ISIM, desenMesaji: 'Ad sadece harf içerebilir.' }),
    soyad: metinAlani(m.soyad, { ad: 'Soyad', min: 2, maks: 50, desen: ISIM, desenMesaji: 'Soyad sadece harf içerebilir.' }),
    email: eposta(m.email),
    telefon: telefon(m.telefon),
    il,
    ilce: metinAlani(m.ilce, { ad: 'İlçe', min: 2, maks: 50 }),
    adres: metinAlani(m.adres, { ad: 'Adres', min: 10, maks: 300, cokSatirli: true }),
    postaKodu,
    not: metinAlani(m.not, { ad: 'Sipariş notu', maks: 500, zorunlu: false, cokSatirli: true })
  };
}

// Sepet: [{ secenekId, adet }]. Aynı seçenek iki kez gelirse adetler toplanır.
function sepet(girdi) {
  if (!Array.isArray(girdi) || girdi.length === 0) throw new KullaniciHatasi('Sepetiniz boş.');
  if (girdi.length > 30) throw new KullaniciHatasi('Sepette çok fazla paket var.');
  const adetler = new Map();
  for (const satir of girdi) {
    const id = Number(satir && satir.secenekId);
    const adet = Number(satir && satir.adet);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(adet) || adet < 1 || adet > 50) {
      throw new KullaniciHatasi('Sepette geçersiz bir paket var.');
    }
    adetler.set(id, (adetler.get(id) || 0) + adet);
  }
  for (const adet of adetler.values()) {
    if (adet > 50) throw new KullaniciHatasi('Bir paketten en fazla 50 adet alınabilir.');
  }
  return adetler;
}

function pozitifTamSayi(deger, ad = 'Kayıt') {
  const sayi = Number(deger);
  if (!Number.isSafeInteger(sayi) || sayi < 1) throw new KullaniciHatasi(`${ad} geçersiz.`, 400);
  return sayi;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(deger) {
  if (typeof deger !== 'string' || !UUID.test(deger)) throw new KullaniciHatasi('Geçersiz sipariş.', 400);
  return deger.toLowerCase();
}

module.exports = { temizle, metinAlani, telefon, eposta, musteriBilgileri, sepet, pozitifTamSayi, uuid };
