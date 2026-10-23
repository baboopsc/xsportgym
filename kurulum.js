'use strict';
// Veritabanını kurar/günceller. Sunucu açılırken bunu zaten otomatik yapar;
// elle çalıştırmak isterseniz:  node kurulum.js
// Örnek ürün eklemek için (veritabanı boşsa):  node kurulum.js --ornek
// 35 çeşitlik örnek katalog için:  node kurulum.js --katalog
const ayarlar = require('./lib/ayarlar');
const { pool, islem } = require('./lib/db');
const { gocleriUygula, bosSlugBul } = require('./lib/gocler');

// [seçenek adı, fiyat TL, stok]. Bakım bilgileri genel bilgidir; panelden fidancının kendi bilgisiyle düzeltilebilir.
const ORNEK_URUNLER = [
  {
    ad: 'Kiraz Fidanı', latince: 'Prunus avium', kategori: 'Meyve Fidanı',
    aciklama: 'Aşılı kiraz fidanı. Baharda beyaz çiçekleriyle bahçeyi süsler, yaz başında meyve verir.',
    secenekler: [['1 yaşlı', 650, 20], ['2 yaşlı', 800, 12]],
    bakim: { dikim: 'Kasım – Mart', gunes: 'Tam güneş', sulama: 'Haftada bir, derin sulama', toprak: 'Süzek, tınlı toprak', meyve: 'Dikimden 3–4 yıl sonra', hasat: 'Mayıs – Haziran', soguk: "-25 °C'ye kadar", boy: '4–6 m', tozlasma: 'Yakınında tozlayıcı çeşit önerilir' }
  },
  {
    ad: 'Elma Fidanı', latince: 'Malus domestica', kategori: 'Meyve Fidanı',
    aciklama: 'Aşılı elma fidanı. Soğuğa dayanıklı, bakımı kolay, her bahçeye uygun.',
    secenekler: [['1 yaşlı', 650, 20], ['2 yaşlı', 750, 20]],
    bakim: { dikim: 'Kasım – Mart', gunes: 'Tam güneş', sulama: 'Yazın haftada 1–2 kez', toprak: 'Derin, süzek toprak', meyve: 'Dikimden 2–4 yıl sonra', hasat: 'Ağustos – Ekim', soguk: "-30 °C'ye kadar", boy: '3–5 m', tozlasma: 'Tozlayıcı çeşit verimi artırır' }
  },
  {
    ad: 'Aşılı Ceviz Fidanı', latince: 'Juglans regia', kategori: 'Sert Kabuklu',
    aciklama: 'Aşılı ceviz fidanı. Aşısız cevize göre çok daha erken meyveye yatar.',
    secenekler: [['Standart', 900, 15], ['Büyük boy', 1250, 6]],
    bakim: { dikim: 'Kasım – Mart', gunes: 'Tam güneş', sulama: 'Seyrek ama derin sulama', toprak: 'Derin, verimli toprak', meyve: 'Dikimden 3–5 yıl sonra', hasat: 'Eylül – Ekim', soguk: "-25 °C'ye kadar", boy: '10–15 m' }
  },
  {
    ad: 'Kayısı Fidanı', latince: 'Prunus armeniaca', kategori: 'Meyve Fidanı',
    aciklama: 'Aşılı kayısı fidanı. Sıcak ve güneşli bahçeleri sever.',
    secenekler: [['1 yaşlı', 700, 18], ['2 yaşlı', 850, 10]],
    bakim: { dikim: 'Kasım – Şubat', gunes: 'Tam güneş', sulama: 'Haftada bir', toprak: 'Süzek, kireçli toprağa uygun', meyve: 'Dikimden 3 yıl sonra', hasat: 'Haziran – Temmuz', soguk: "-20 °C'ye kadar", boy: '4–6 m', tozlasma: 'Çoğu çeşit kendine verimli' }
  },
  {
    ad: 'Armut Fidanı', latince: 'Pyrus communis', kategori: 'Meyve Fidanı',
    aciklama: 'Aşılı armut fidanı. Uzun ömürlü, bol meyveli.',
    secenekler: [['1 yaşlı', 650, 20], ['2 yaşlı', 780, 14]],
    bakim: { dikim: 'Kasım – Mart', gunes: 'Tam güneş', sulama: 'Haftada bir', toprak: 'Tınlı, nemli toprak', meyve: 'Dikimden 3–5 yıl sonra', hasat: 'Ağustos – Ekim', soguk: "-25 °C'ye kadar", boy: '4–6 m', tozlasma: 'Tozlayıcı çeşit önerilir' }
  },
  {
    ad: 'Vişne Fidanı', latince: 'Prunus cerasus', kategori: 'Meyve Fidanı',
    aciklama: 'Aşılı vişne fidanı. Kendine verimli, tek başına da meyve verir.',
    secenekler: [['1 yaşlı', 620, 20], ['2 yaşlı', 720, 3]],
    bakim: { dikim: 'Kasım – Mart', gunes: 'Tam güneş, yarı gölge', sulama: 'Haftada bir', toprak: 'Süzek toprak', meyve: 'Dikimden 2–3 yıl sonra', hasat: 'Haziran – Temmuz', soguk: "-30 °C'ye kadar", boy: '3–4 m', tozlasma: 'Kendine verimli' }
  }
];

async function ornekUrunleriEkle() {
  const { rows: [{ adet }] } = await pool.query('SELECT COUNT(*)::int AS adet FROM urunler');
  if (adet > 0) {
    console.log('Ürünler zaten var, örnek ürün eklenmedi.');
    return;
  }
  await islem(async (client) => {
    for (const [sira, u] of ORNEK_URUNLER.entries()) {
      const { rows: [yeni] } = await client.query(
        `INSERT INTO urunler (ad, slug, kategori, sira, aciklama, latince_ad, bakim, aktif)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
        [u.ad, await bosSlugBul(client, u.ad), u.kategori, sira, u.aciklama, u.latince, JSON.stringify(u.bakim)]
      );
      for (const [i, [ad, fiyatTl, stok]] of u.secenekler.entries()) {
        await client.query(
          'INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok, sira) VALUES ($1, $2, $3, $4, $5)',
          [yeni.id, ad, fiyatTl * 100, stok, i]
        );
      }
    }
  });
  console.log('✔ Örnek ürünler eklendi');
}

// Örnek katalog (35 çeşit): node kurulum.js --katalog
// Fiyatlar YER TUTUCUDUR (her biri 650 TL); panelden fidancının gerçek fiyatlarıyla değiştirin. Var olan ürünlere dokunulmaz.
const ORNEK_KATALOG = [
  ['Miho Wase Mandarin', 'Mandalina', { hasat: 'Ekim' }, ''],
  ['Satsuma Mandarin', 'Mandalina', { hasat: 'Ekim ortası' }, ''],
  ['Okitsu Mandarin', 'Mandalina', { hasat: 'Ekim' }, ''],
  ['Dobashi Beni Mandarin', 'Mandalina', { hasat: 'Kasım' }, ''],
  ['Robinson Mandarin', 'Mandalina', { hasat: 'Aralık' }, ''],
  ['Nova Mandarin', 'Mandalina', { hasat: 'Aralık' }, ''],
  ['W.Murcott Mandarin', 'Mandalina', { hasat: 'Mart' }, ''],
  ['Fukumoto Portakal', 'Portakal', { hasat: 'Çok erkenci' }, ''],
  ['Navelina Portakal', 'Portakal', { hasat: 'Kasım' }, ''],
  ['Washington Portakal', 'Portakal', { hasat: 'Aralık' }, ''],
  ['Interdonato Limon', 'Limon', { hasat: 'Ekim' }, ''],
  ['Mayer Limon', 'Limon', { hasat: 'Ekim' }, ''],
  ['Kütdiken (Yediveren) Limon', 'Limon', { hasat: 'Kasım–Şubat' }, ''],
  ['Star Ruby Greyfurt', 'Greyfurt', { hasat: 'Ocak' }, ''],
  ['Rio Red Greyfurt', 'Greyfurt', { hasat: 'Şubat' }, ''],
  ['Gemlik Zeytin', 'Zeytin', { hasat: 'Kasım–Ocak' }, ''],
  ['Nizip Zeytin', 'Zeytin', { meyve: 'Dikimden sonraki 2. yıl' }, ''],
  ['Hicaz Nar', 'Nar', { hasat: 'Eylül sonu–Ekim' }, ''],
  ['Katırbaşı Nar', 'Nar', { meyve: 'Dikimden kısa süre sonra' }, ''],
  ['Ninfa Kayısı', 'Kayısı', { hasat: 'Mayıs sonu (erkenci)' }, ''],
  ['Aurora Kayısı', 'Kayısı', { hasat: 'Ninfa ile aynı dönem' }, ''],
  ['Orange Ruby Kayısı', 'Kayısı', { hasat: 'Haziranın 2. haftası' }, ''],
  ['Şekerpare Kayısı', 'Kayısı', { hasat: 'Haziran ortası' }, ''],
  ['Papaz Erik', 'Erik', { hasat: 'Nisan sonu–Mayıs başı' }, ''],
  ['Can Erik', 'Erik', { hasat: 'Mayıs başı' }, ''],
  ['Red Beauty Japon Erik', 'Erik', { hasat: 'Mayısın 2. haftasından itibaren' }, ''],
  ['Black Splendor Japon Erik', 'Erik', { hasat: 'Haziran ortası' }, ''],
  ['Black Amber Japon Erik', 'Erik', { hasat: 'Haziran sonu–Temmuz başı' }, ''],
  ['Black Star Japon Erik', 'Erik', { hasat: 'Haziran sonu' }, ''],
  ['Ferragnes Badem', 'Badem', {}, 'Geç çiçeklenen badem çeşidi.'],
  ['Ferraduel Badem', 'Badem', { meyve: 'Erken yaşta' }, ''],
  ['Texas Badem', 'Badem', { hasat: 'Temmuz ortası' }, ''],
  ['Fuyu Trabzon Hurması', 'Trabzon Hurması', { hasat: 'Ekim sonu' }, ''],
  ['Hachiya Trabzon Hurması', 'Trabzon Hurması', { hasat: 'Ekim' }, ''],
  ['Myrobolan B / GF31 Anaç', 'Anaç', {}, 'Erik yetiştiriciliğinde kullanılan anaç (Can grubu erikleriyle aynı tür).'],
];

async function ornekKataloguEkle() {
  let eklenen = 0;
  await islem(async (client) => {
    const { rows: [{ sira }] } = await client.query('SELECT COALESCE(MAX(sira), -1) + 1 AS sira FROM urunler');
    for (const [i, [ad, kategori, bakim, aciklama]] of ORNEK_KATALOG.entries()) {
      const { rowCount } = await client.query('SELECT 1 FROM urunler WHERE ad = $1', [ad]);
      if (rowCount) continue;
      const { rows: [yeni] } = await client.query(
        `INSERT INTO urunler (ad, slug, kategori, sira, aciklama, bakim, aktif)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [ad, await bosSlugBul(client, ad), kategori, sira + i, aciklama, JSON.stringify(bakim)]
      );
      await client.query(
        'INSERT INTO urun_secenekleri (urun_id, ad, fiyat_kurus, stok, sira) VALUES ($1, $2, $3, $4, 0)',
        [yeni.id, 'Standart', 65000, 20]
      );
      eklenen++;
    }
  });
  console.log(`✔ Örnek katalog: ${eklenen} çeşit eklendi (fiyatlar yer tutucu: 650 TL)`);
}

async function main() {
  if (!ayarlar.databaseUrl) throw new Error('.env dosyasında DATABASE_URL yok');
  await gocleriUygula();
  if (process.argv.includes('--ornek')) await ornekUrunleriEkle();
  if (process.argv.includes('--katalog')) await ornekKataloguEkle();
}

main()
  .catch((hata) => { console.error('Kurulum hatası:', hata.message); process.exitCode = 1; })
  .finally(() => pool.end());
