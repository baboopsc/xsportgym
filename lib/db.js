'use strict';
const { Pool } = require('pg');
const ayarlar = require('./ayarlar');

// Neon gibi uzak veritabanlarında en sıkı SSL modunu (verify-full) kullan.
// Bu, terminaldeki "SECURITY WARNING: The SSL modes ..." uyarısını da kaldırır.
function baglantiAyari(adres) {
  if (!adres) return {}; // ayar kontrolü (server.js) eksik adresi zaten bildirir
  const url = new URL(adres);
  const yerel = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (yerel) return { connectionString: url.toString() };

  const mod = url.searchParams.get('sslmode');
  if (!mod || ['prefer', 'require', 'verify-ca'].includes(mod)) {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return { connectionString: url.toString() };
}

const pool = new Pool({
  ...baglantiAyari(ayarlar.databaseUrl),
  max: 10,
  idleTimeoutMillis: 10000,      // boşta kalan bağlantıyı kapat (Neon uyuyabilsin)
  connectionTimeoutMillis: 15000 // Neon uykudan uyanırken birkaç saniye sürebilir
});

// Neon uyku moduna geçince boştaki bağlantıları kapatır. Bu olay dinlenmezse sunucu çöker.
pool.on('error', (hata) => {
  console.error('Veritabanı bağlantı hatası (boştaki bağlantı):', hata.message);
});

// Ya hep ya hiç: fn içindeki bütün sorgular birlikte kaydedilir ya da hiçbiri kaydedilmez.
async function islem(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sonuc = await fn(client);
    await client.query('COMMIT');
    return sonuc;
  } catch (hata) {
    try { await client.query('ROLLBACK'); } catch { /* bağlantı kopmuş olabilir */ }
    throw hata;
  } finally {
    client.release();
  }
}

module.exports = { pool, islem };
