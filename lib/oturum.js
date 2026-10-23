'use strict';
// Giriş oturumu: hem müşteri hem yönetici aynı çerezi kullanır, rolü veritabanından okunur.
// Çerezde sadece imzalı kullanıcı numarası ve "oturum sürümü" durur. Şifre değişince sürüm artar
// ve eski cihazlardaki bütün oturumlar geçersiz olur.
const jwt = require('jsonwebtoken');
const ayarlar = require('./ayarlar');
const { pool } = require('./db');

const CEREZ = 'oturum';
const SURE = { musteri: 30 * 24 * 60 * 60 * 1000, admin: 12 * 60 * 60 * 1000 };

function cerezAyari(rol) {
  return {
    httpOnly: true,         // JavaScript okuyamaz
    sameSite: 'lax',        // başka sitelerden gelen form/istekle gönderilmez
    secure: ayarlar.uretim, // canlıda sadece https
    path: '/',
    maxAge: SURE[rol] || SURE.musteri
  };
}

function oturumAc(res, kullanici) {
  const token = jwt.sign(
    { sub: String(kullanici.id), sv: kullanici.oturum_surumu },
    ayarlar.admin.jwtSecret,
    { expiresIn: Math.floor((SURE[kullanici.rol] || SURE.musteri) / 1000), algorithm: 'HS256' }
  );
  res.cookie(CEREZ, token, cerezAyari(kullanici.rol));
}

function oturumKapat(res) {
  const { maxAge, ...ayar } = cerezAyari('musteri');
  res.clearCookie(CEREZ, ayar);
}

// Her API isteğinde: çerez geçerliyse req.kullanici doldurulur (değilse null)
async function oturumuOku(req, res, next) {
  req.kullanici = null;
  const token = req.cookies?.[CEREZ];
  if (!token) return next();
  try {
    const veri = jwt.verify(token, ayarlar.admin.jwtSecret, { algorithms: ['HS256'] });
    const { rows: [k] } = await pool.query(
      `SELECT id, rol, email, kullanici_adi, ad, soyad, telefon, il, ilce, adres, posta_kodu, oturum_surumu
       FROM kullanicilar WHERE id = $1`, [Number(veri.sub)]
    );
    if (k && k.oturum_surumu === veri.sv) req.kullanici = k;
    else oturumKapat(res);
  } catch {
    oturumKapat(res);
  }
  next();
}

function girisGerekli(req, res, next) {
  if (!req.kullanici) return res.status(401).json({ hata: 'Giriş yapmanız gerekiyor.' });
  next();
}

function adminGerekli(req, res, next) {
  if (!req.kullanici) return res.status(401).json({ hata: 'Giriş yapmanız gerekiyor.' });
  if (req.kullanici.rol !== 'admin') return res.status(403).json({ hata: 'Bu sayfaya erişim yetkiniz yok.' });
  res.set('Cache-Control', 'private, no-store');
  next();
}

module.exports = { oturumAc, oturumKapat, oturumuOku, girisGerekli, adminGerekli };
