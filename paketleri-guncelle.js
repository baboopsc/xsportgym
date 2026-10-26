'use strict';
// Veritabanındaki paketleri lib/paket-listesi.js'teki listeye göre günceller (bir kez çalıştırmanız yeter):
//   node paketleri-guncelle.js
// - Listedeki paket yoksa eklenir, varsa açıklaması ve içerikleri güncellenir.
// - Seçenekler (1 aylık, 3 aylık) fiyatlarıyla eklenir/güncellenir; listede olmayan seçenekler satıştan kaldırılır.
// - Listede olmayan paketler silinmez (eski siparişlerde adı geçiyor), sadece satıştan kaldırılır.
const ayarlar = require('./lib/ayarlar');
const { pool, islem } = require('./lib/db');
const { gocleriUygula, bosSlugBul } = require('./lib/gocler');
const PAKETLER = require('./lib/paket-listesi');

async function main() {
  if (!ayarlar.databaseUrl) throw new Error('.env dosyasında DATABASE_URL yok');
  await gocleriUygula({ sessiz: true });
  await islem(async (client) => {
    const kalanlar = [];
    for (const [sira, p] of PAKETLER.entries()) {
      let { rows: [u] } = await client.query('SELECT id FROM urunler WHERE ad = $1 ORDER BY id LIMIT 1', [p.ad]);
      if (u) {
        await client.query(
          'UPDATE urunler SET kategori = $2, sira = $3, aciklama = $4, latince_ad = $5, bakim = $6, aktif = TRUE WHERE id = $1',
          [u.id, p.kategori, sira, p.aciklama, p.slogan, JSON.stringify(p.bakim)]
        );
        console.log(`✔ Güncellendi: ${p.ad}`);
      } else {
        ({ rows: [u] } = await client.query(
          `INSERT INTO urunler (ad, slug, kategori, sira, aciklama, latince_ad, bakim, aktif)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id`,
          [p.ad, await bosSlugBul(client, p.ad), p.kategori, sira, p.aciklama, p.slogan, JSON.stringify(p.bakim)]
        ));
        console.log(`✔ Eklendi: ${p.ad}`);
      }
      kalanlar.push(u.id);

      await client.query('UPDATE urun_secenekleri SET aktif = FALSE WHERE urun_id = $1', [u.id]);
      for (const [i, [ad, fiyatTl, stok]] of p.secenekler.entries()) {
        const { rowCount } = await client.query(
          'UPDATE urun_secenekleri SET fiyat_kurus = $3, stok = GREATEST(stok, $4), sira = $5, aktif = TRUE WHERE urun_id = $1 AND ad = $2',
          [u.id, ad, fiyatTl * 100, stok, i]
        );
        if (!rowCount) {
          await client.query(
            'INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok, sira) VALUES ($1, $2, $3, $4, $5)',
            [u.id, ad, fiyatTl * 100, stok, i]
          );
        }
        console.log(`   ${ad}: ${fiyatTl.toLocaleString('tr-TR')} TL`);
      }
    }
    const { rows } = await client.query('UPDATE urunler SET aktif = FALSE WHERE aktif AND NOT (id = ANY($1)) RETURNING ad', [kalanlar]);
    for (const r of rows) console.log(`– Satıştan kaldırıldı: ${r.ad}`);
  });
  console.log('Bitti. Siteyi yenileyince yeni paketler görünür.');
}

main()
  .catch((hata) => { console.error('Hata:', hata.message); process.exitCode = 1; })
  .finally(() => pool.end());
