'use strict';
// Veritabanını kurar/günceller. Sunucu açılırken bunu zaten otomatik yapar;
// elle çalıştırmak isterseniz:  node kurulum.js
// Deneme paketlerini eklemek için (veritabanında paket yoksa):  node kurulum.js --ornek
const ayarlar = require('./lib/ayarlar');
const { pool, islem } = require('./lib/db');
const { gocleriUygula, bosSlugBul } = require('./lib/gocler');

const ORNEK_URUNLER = require('./lib/paket-listesi');

async function ornekUrunleriEkle() {
  const { rows: [{ adet }] } = await pool.query('SELECT COUNT(*)::int AS adet FROM urunler');
  if (adet > 0) {
    console.log('Paketler zaten var, örnek paket eklenmedi.');
    return;
  }
  await islem(async (client) => {
    for (const [sira, u] of ORNEK_URUNLER.entries()) {
      const { rows: [yeni] } = await client.query(
        `INSERT INTO urunler (ad, slug, kategori, sira, aciklama, latince_ad, bakim, aktif)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
        [u.ad, await bosSlugBul(client, u.ad), u.kategori, sira, u.aciklama, u.slogan, JSON.stringify(u.bakim)]
      );
      for (const [i, [ad, fiyatTl, stok]] of u.secenekler.entries()) {
        await client.query(
          'INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok, sira) VALUES ($1, $2, $3, $4, $5)',
          [yeni.id, ad, fiyatTl * 100, stok, i]
        );
      }
    }
  });
  console.log('✔ Online koçluk paketleri eklendi');
}

async function main() {
  if (!ayarlar.databaseUrl) throw new Error('.env dosyasında DATABASE_URL yok');
  await gocleriUygula();
  if (process.argv.includes('--ornek')) await ornekUrunleriEkle();
}

main()
  .catch((hata) => { console.error('Kurulum hatası:', hata.message); process.exitCode = 1; })
  .finally(() => pool.end());
