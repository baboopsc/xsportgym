'use strict';
// Veritabanını kurar/günceller. Sunucu açılırken bunu zaten otomatik yapar;
// elle çalıştırmak isterseniz:  node kurulum.js
// Deneme paketlerini eklemek için (veritabanında paket yoksa):  node kurulum.js --ornek
const ayarlar = require('./lib/ayarlar');
const { pool, islem } = require('./lib/db');
const { gocleriUygula, bosSlugBul } = require('./lib/gocler');

// [seçenek adı, fiyat TL, kontenjan]. FİYATLAR DENEME İÇİN YER TUTUCUDUR: panelden Selen'in gerçek fiyatlarıyla değiştirin.
// Kontenjan 999 = pratikte sınırsız (her satışta 1 azalır).
const ORNEK_URUNLER = [
  {
    ad: 'Online Koçluk', slogan: 'Değişime benimle başla', kategori: 'Online Koçluk',
    aciklama: 'Hedefine, seviyene ve programına ayırabildiğin zamana göre hazırlanan kişiye özel antrenman ve beslenme programı. '
      + 'Paket süresi boyunca ilerlemen takip edilir, programın gerektikçe güncellenir.\n\n'
      + 'Ödemeden sonra seninle iletişime geçip hedefini konuşuyoruz. Programını hazırlayıp sana iletiyoruz; '
      + 'sen salonda ya da evde uygularken her adımda yanında oluyoruz.',
    bakim: {
      sure: 'Seçtiğin süre boyunca', program: 'Kişiye özel, haftalık', beslenme: 'Hedefine göre hazırlanır',
      takip: 'Düzenli kontrol', iletisim: 'WhatsApp ve e-posta', guncelleme: 'İlerlemene göre',
      seviye: 'Her seviye', yer: 'Salonda veya evde', baslangic: 'Ödemeden sonra iletişime geçilir'
    },
    secenekler: [['1 aylık', 1500, 999], ['3 aylık', 4000, 999], ['6 aylık', 7500, 999]]
  },
  {
    ad: 'Antrenman Programı + Beslenme Planı', slogan: 'Kendi temponla ilerle', kategori: 'Program',
    aciklama: 'Kişiye özel antrenman programı ve beslenme planı, tek seferlik. Düzenli takip istemeyen, '
      + 'programını kendi başına uygulamak isteyenler için.',
    bakim: {
      program: 'Kişiye özel', beslenme: 'Kişiye özel', iletisim: 'WhatsApp ve e-posta',
      seviye: 'Her seviye', yer: 'Salonda veya evde', baslangic: 'Ödemeden sonra iletişime geçilir'
    },
    secenekler: [['Tek seferlik', 900, 999]]
  }
];

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
  console.log('✔ Deneme paketleri eklendi (fiyatlar yer tutucu, panelden değiştirin)');
}

async function main() {
  if (!ayarlar.databaseUrl) throw new Error('.env dosyasında DATABASE_URL yok');
  await gocleriUygula();
  if (process.argv.includes('--ornek')) await ornekUrunleriEkle();
}

main()
  .catch((hata) => { console.error('Kurulum hatası:', hata.message); process.exitCode = 1; })
  .finally(() => pool.end());
