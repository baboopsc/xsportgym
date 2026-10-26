'use strict';
// Tüm ayarlar tek yerden okunur. Başka dosyalar process.env'e doğrudan bakmaz.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const uretim = process.env.NODE_ENV === 'production';
const RESMI_IYZICO_ADRESLERI = ['https://sandbox-api.iyzipay.com', 'https://api.iyzipay.com'];

function metin(ad, varsayilan = '') {
  const deger = process.env[ad];
  return typeof deger === 'string' && deger.trim() !== '' ? deger.trim() : varsayilan;
}

function sayi(ad, varsayilan) {
  const deger = Number.parseInt(metin(ad), 10);
  return Number.isInteger(deger) ? deger : varsayilan;
}

// "trust proxy": site Render gibi bir sunucunun arkasında çalışırken
// müşterinin gerçek IP adresini doğru görmek için gerekli.
function trustProxyAyari() {
  const deger = metin('TRUST_PROXY');
  if (!deger) return uretim ? 1 : false;
  if (deger === 'false' || deger === '0') return false;
  if (/^\d+$/.test(deger)) return Number(deger);
  return deger;
}

const iyzicoAdresi = metin('IYZICO_BASE_URL').replace(/\/+$/, '');

const ayarlar = {
  uretim,
  port: sayi('PORT', 3000),
  siteUrl: metin('SITE_URL').replace(/\/+$/, ''),
  databaseUrl: metin('DATABASE_URL'),
  trustProxy: trustProxyAyari(),
  islerKapali: metin('ISLER_KAPALI') === '1',

  // Ödeme yöntemi: 'havale' (IBAN'a havale/EFT, varsayılan) ya da 'iyzico' (kartla ödeme)
  odemeYontemi: metin('ODEME_YONTEMI', 'havale') === 'iyzico' ? 'iyzico' : 'havale',

  iyzico: {
    apiKey: metin('IYZICO_API_KEY'),
    secretKey: metin('IYZICO_SECRET_KEY'),
    baseUrl: iyzicoAdresi,
    testModu: metin('ODEME_YONTEMI', 'havale') === 'iyzico' && iyzicoAdresi !== 'https://api.iyzipay.com',
    zamanAsimiMs: sayi('IYZICO_ZAMAN_ASIMI_MS', 20000),
    // Taksit seçenekleri (1 = tek çekim). Taksit komisyonunu iyzico panelinden ayarlarsınız.
    taksitler: metin('TAKSITLER', '1,2,3,6,9')
      .split(',').map(t => Number.parseInt(t, 10)).filter(t => [1, 2, 3, 6, 9, 12].includes(t))
  },

  admin: {
    // Sadece ilk kurulumda: veritabanında yönetici yoksa bu şifreyle "ADMIN_KULLANICI_ADI" hesabı açılır
    sifreHash: metin('ADMIN_SIFRE_HASH'),
    kullaniciAdi: metin('ADMIN_KULLANICI_ADI', 'admin'),
    jwtSecret: metin('JWT_SECRET')
  },

  eposta: {
    smtpHost: metin('SMTP_HOST'),
    smtpPort: sayi('SMTP_PORT', 465),
    smtpGuvenli: metin('SMTP_SECURE', '') ? metin('SMTP_SECURE') === 'true' : sayi('SMTP_PORT', 465) === 465,
    smtpKullanici: metin('SMTP_KULLANICI'),
    smtpSifre: metin('SMTP_SIFRE'),
    gonderen: metin('EPOSTA_GONDEREN'),
    adminAlici: metin('ADMIN_EPOSTA')
  },

  // {NO} yerine kargo takip numarası yazılır. Aras'ın adresi değişirse sadece .env'den güncelleyin.
  arasTakipUrl: metin('ARAS_TAKIP_URL', 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code={NO}'),

  // Ödeme sayfası bu süre içinde tamamlanmazsa sipariş "yarım kaldı" sayılır (iyzico token'ı 30 dk geçerli).
  terkSuresiDk: sayi('TERK_SURESI_DK', 45),

  // Bir IP adresinden 10 dakikada en fazla kaç kez ödeme başlatılabilir (kötüye kullanıma karşı)
  odemeBaslatmaLimiti: sayi('ODEME_BASLATMA_LIMITI', 15)
};

// ---------- İşletme bilgileri (sözleşmelerde ve sitenin altında görünür) ----------
const ISLETME_DOSYASI = path.join(__dirname, '..', 'isletme-bilgileri.json');

function isletmeBilgileriniOku() {
  const ham = JSON.parse(fs.readFileSync(ISLETME_DOSYASI, 'utf8'));
  const bilgiler = {};
  for (const [anahtar, deger] of Object.entries(ham)) {
    if (anahtar.startsWith('_')) continue; // açıklama satırları
    bilgiler[anahtar] = typeof deger === 'string' ? deger.trim() : deger;
  }
  return bilgiler;
}

ayarlar.isletme = isletmeBilgileriniOku();

// Doldurulmamış alanlar ("DOLDURULACAK" yazanlar) panelde uyarı olarak gösterilir
ayarlar.isletmeEksikAlanlar = Object.entries(ayarlar.isletme)
  .filter(([, deger]) => typeof deger === 'string' && (deger === '' || deger.includes('DOLDURULACAK')))
  .map(([anahtar]) => anahtar)
  .filter(anahtar => (ayarlar.odemeYontemi === 'havale' || !['iban', 'ibanAlici', 'banka'].includes(anahtar)))
  .filter(anahtar => !['mersisNo', 'kepAdresi', 'whatsapp', 'kargoFirmasi', 'kargoyaVerilmeSuresi', 'teslimSuresi'].includes(anahtar)); // bunlar zorunlu değil (spor salonunda kargo yok)

// ---------- Kontrol ----------
function ayarlariDogrula() {
  const hatalar = [];
  const uyarilar = [];

  const zorunlular = {
    ...(ayarlar.odemeYontemi === 'iyzico' ? {
      IYZICO_API_KEY: ayarlar.iyzico.apiKey,
      IYZICO_SECRET_KEY: ayarlar.iyzico.secretKey,
      IYZICO_BASE_URL: ayarlar.iyzico.baseUrl
    } : {}),
    SITE_URL: ayarlar.siteUrl,
    DATABASE_URL: ayarlar.databaseUrl,
    JWT_SECRET: ayarlar.admin.jwtSecret
  };
  for (const [ad, deger] of Object.entries(zorunlular)) {
    if (!deger) hatalar.push(`${ad} eksik`);
  }

  if (ayarlar.admin.jwtSecret && ayarlar.admin.jwtSecret.length < 32) {
    hatalar.push('JWT_SECRET en az 32 karakter olmalı');
  }
  if (ayarlar.admin.sifreHash && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(ayarlar.admin.sifreHash)) {
    hatalar.push("ADMIN_SIFRE_HASH geçersiz (node sifre-olustur.js 'ŞİFRE' çıktısını tek tırnak içinde yazın)");
  }

  if (ayarlar.siteUrl) {
    try {
      const url = new URL(ayarlar.siteUrl);
      if (uretim && url.protocol !== 'https:') hatalar.push('Canlıda SITE_URL https:// ile başlamalı');
    } catch {
      hatalar.push('SITE_URL geçerli bir adres değil');
    }
  }

  if (uretim && ayarlar.iyzico.baseUrl && !RESMI_IYZICO_ADRESLERI.includes(ayarlar.iyzico.baseUrl)) {
    hatalar.push('IYZICO_BASE_URL sadece iyzico adreslerinden biri olabilir');
  }
  if (ayarlar.iyzico.taksitler.length === 0) ayarlar.iyzico.taksitler = [1];

  if (uretim) {
    for (const [ad, deger] of Object.entries({
      SMTP_HOST: ayarlar.eposta.smtpHost,
      EPOSTA_GONDEREN: ayarlar.eposta.gonderen,
      ADMIN_EPOSTA: ayarlar.eposta.adminAlici
    })) {
      if (!deger) hatalar.push(`${ad} eksik (canlıda e-posta zorunlu)`);
    }
  } else if (!ayarlar.eposta.smtpHost) {
    uyarilar.push('SMTP ayarlı değil: e-postalar gönderilmeyecek, sadece terminale yazılacak');
  }

  if (ayarlar.iyzico.testModu) uyarilar.push('iyzico TEST modunda: gerçek ödeme alınmıyor');
  if (ayarlar.isletmeEksikAlanlar.length) {
    uyarilar.push(`isletme-bilgileri.json içinde doldurulmamış alanlar var: ${ayarlar.isletmeEksikAlanlar.join(', ')}`);
  }

  return { hatalar, uyarilar };
}

ayarlar.ayarlariDogrula = ayarlariDogrula;

module.exports = ayarlar;
