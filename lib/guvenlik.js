'use strict';
const rateLimit = require('express-rate-limit');
const ayarlar = require('./ayarlar');

// Tarayıcıya "bu sitede sadece bu siteden gelen kod çalışsın" der (XSS'e karşı ikinci kat koruma).
// NOT: Tasarım aşamasında Google Fonts gibi dış bir kaynak eklenirse buraya izin eklemek gerekir.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(ayarlar.uretim ? ['upgrade-insecure-requests'] : [])
].join('; ');

function guvenlikBasliklari(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (ayarlar.uretim) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// Sözleşme kopyası gibi kendi içinde <style> barındıran, script içermeyen belgeler için
function belgeBasliklari(res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
}

// Giriş ve panelde veri değiştiren isteklere karşı CSRF koruması:
// başka bir site, tarayıcıya bu özel başlığı ekletemez ve farklı bir Origin ile istek atamaz.
const siteOrigin = (() => {
  try { return new URL(ayarlar.siteUrl).origin; } catch { return null; }
})();

function istekKontrolu(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Istek') !== 'panel') return res.status(403).json({ hata: 'İzin verilmeyen istek.' });
  const origin = req.get('Origin');
  if (origin && origin !== siteOrigin) {
    // Yerelde farklı adresle açılmış olabilir (ör. 127.0.0.1 ile localhost): aynı host ise kabul et
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* "null" gibi geçersiz origin */ }
    if (!originHost || originHost !== req.get('Host')) return res.status(403).json({ hata: 'İzin verilmeyen istek.' });
  }
  next();
}

function hizSiniri(dakika, limit, mesaj) {
  return rateLimit({
    windowMs: dakika * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { hata: mesaj }
  });
}

module.exports = { guvenlikBasliklari, belgeBasliklari, istekKontrolu, adminIstekKontrolu: istekKontrolu, hizSiniri };
