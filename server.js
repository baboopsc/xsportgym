'use strict';
// Giriş noktası: ayarları kontrol et, veritabanını güncelle, sunucuyu ve arka plan işlerini başlat.
const ayarlar = require('./lib/ayarlar');

const { hatalar, uyarilar } = ayarlar.ayarlariDogrula();
if (hatalar.length) {
  console.error('\n.env ayarlarında sorun var, sunucu başlatılmadı:');
  for (const h of hatalar) console.error(`  ✘ ${h}`);
  console.error('');
  process.exit(1);
}

const app = require('./app');
const { pool } = require('./lib/db');
const { gocleriUygula } = require('./lib/gocler');
const isler = require('./lib/isler');
const { yoneticiyiHazirla } = require('./lib/hesap');

async function baslat() {
  await gocleriUygula();
  await yoneticiyiHazirla();
  const sunucu = app.listen(ayarlar.port, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${ayarlar.port}`);
    for (const u of uyarilar) console.log(`  ⚠ ${u}`);
  });
  if (!ayarlar.islerKapali) isler.baslat();

  // Kapatılırken yarım iş bırakma (Ctrl+C veya sunucu yeniden başlatılırken)
  let kapaniyor = false;
  const kapat = (sinyal) => {
    if (kapaniyor) return;
    kapaniyor = true;
    console.log(`\n${sinyal} alındı, sunucu kapatılıyor...`);
    isler.durdur();
    sunucu.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
}

process.on('unhandledRejection', (hata) => {
  console.error('Yakalanmamış hata:', hata);
});

baslat().catch((hata) => {
  console.error('Sunucu başlatılamadı:', hata.message);
  if (/ENOTFOUND|ECONNREFUSED|password|authentication/i.test(hata.message)) {
    console.error('  → DATABASE_URL doğru mu? Neon panelinden bağlantı adresini kontrol edin.');
  }
  process.exit(1);
});
