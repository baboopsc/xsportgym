'use strict';
// Veritabanı göçleri (migration). Her göç sadece bir kez çalışır ve hangi göçlerin
// uygulandığı "sema_gocleri" tablosunda tutulur. Yeni değişiklik gerekirse listenin
// SONUNA yeni bir göç eklenir; eski göçler asla değiştirilmez.
const { islem } = require('./db');
const { slugYap } = require('./yardimci');

const GOCLER = [
  {
    surum: 1,
    ad: 'ilk-sema',
    sql: `
      CREATE TABLE IF NOT EXISTS urunler (
        id SERIAL PRIMARY KEY,
        ad TEXT NOT NULL,
        kategori TEXT NOT NULL,
        aciklama TEXT NOT NULL DEFAULT '',
        aktif BOOLEAN NOT NULL DEFAULT TRUE,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS urun_secenekleri (
        id SERIAL PRIMARY KEY,
        urun_id INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
        ad TEXT NOT NULL,
        fiyat_kurus INTEGER NOT NULL CHECK (fiyat_kurus > 0),
        stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
        aktif BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS siparisler (
        id UUID PRIMARY KEY,
        durum TEXT NOT NULL DEFAULT 'odeme-bekliyor',
        toplam_kurus INTEGER NOT NULL,
        musteri_ad TEXT NOT NULL,
        musteri_soyad TEXT NOT NULL,
        email TEXT NOT NULL,
        telefon TEXT NOT NULL,
        adres TEXT NOT NULL,
        sehir TEXT NOT NULL,
        iyzico_token TEXT UNIQUE,
        odeme_id TEXT,
        kargo_takip_no TEXT,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS siparis_kalemleri (
        id SERIAL PRIMARY KEY,
        siparis_id UUID NOT NULL REFERENCES siparisler(id) ON DELETE CASCADE,
        secenek_id INTEGER REFERENCES urun_secenekleri(id) ON DELETE SET NULL,
        urun_adi TEXT NOT NULL,
        secenek_adi TEXT NOT NULL,
        birim_fiyat_kurus INTEGER NOT NULL,
        adet INTEGER NOT NULL CHECK (adet > 0)
      );
    `
  },
  {
    surum: 2,
    ad: 'urun-yonetimi-siparis-takibi-eposta',
    sql: `
      -- Ürünler: adres (slug), sıralama, fotoğraflar
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS slug TEXT;
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS sira INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE urun_secenekleri ADD COLUMN IF NOT EXISTS sira INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS urun_gorselleri (
        id SERIAL PRIMARY KEY,
        urun_id INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
        mime TEXT NOT NULL,
        veri BYTEA NOT NULL,
        boyut INTEGER NOT NULL,
        sira INTEGER NOT NULL DEFAULT 0,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS urun_gorselleri_urun_idx ON urun_gorselleri (urun_id, sira, id);

      -- Siparişler: okunabilir sipariş no, müşteri takip kodu, adres ayrıntıları, ödeme bilgileri
      CREATE SEQUENCE IF NOT EXISTS siparis_no_seq START 100001;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS siparis_no BIGINT;
      UPDATE siparisler SET siparis_no = nextval('siparis_no_seq') WHERE siparis_no IS NULL;
      ALTER TABLE siparisler ALTER COLUMN siparis_no SET DEFAULT nextval('siparis_no_seq');
      ALTER TABLE siparisler ALTER COLUMN siparis_no SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS siparisler_no_idx ON siparisler (siparis_no);

      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS takip_kodu TEXT;
      UPDATE siparisler SET takip_kodu = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
        WHERE takip_kodu IS NULL;
      ALTER TABLE siparisler ALTER COLUMN takip_kodu SET NOT NULL;

      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS ilce TEXT NOT NULL DEFAULT '';
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS posta_kodu TEXT NOT NULL DEFAULT '';
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS musteri_notu TEXT NOT NULL DEFAULT '';
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS admin_notu TEXT NOT NULL DEFAULT '';
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS ip TEXT;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS sozlesme_onay_tarihi TIMESTAMPTZ;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS sozlesme_html TEXT;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odeme_tarihi TIMESTAMPTZ;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odenen_kurus INTEGER;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS taksit INTEGER;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odeme_detay JSONB;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS stok_uyarisi BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS son_kontrol TIMESTAMPTZ;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS kargo_tarihi TIMESTAMPTZ;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS teslim_tarihi TIMESTAMPTZ;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS iptal_tarihi TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS siparisler_durum_idx ON siparisler (durum, olusturma DESC);
      CREATE INDEX IF NOT EXISTS siparisler_email_idx ON siparisler (lower(email));

      -- Siparişin başından geçen her şey (ödeme, durum değişikliği, e-posta...)
      CREATE TABLE IF NOT EXISTS siparis_olaylari (
        id BIGSERIAL PRIMARY KEY,
        siparis_id UUID NOT NULL REFERENCES siparisler(id) ON DELETE CASCADE,
        olay TEXT NOT NULL,
        detay JSONB NOT NULL DEFAULT '{}'::jsonb,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS siparis_olaylari_idx ON siparis_olaylari (siparis_id, id);

      -- Gönderilecek e-postalar. Gönderilemezse tekrar denenir, hiçbiri kaybolmaz.
      CREATE TABLE IF NOT EXISTS eposta_kuyrugu (
        id BIGSERIAL PRIMARY KEY,
        alici TEXT NOT NULL,
        konu TEXT NOT NULL,
        html TEXT NOT NULL,
        metin TEXT NOT NULL,
        ekler JSONB NOT NULL DEFAULT '[]'::jsonb,
        siparis_id UUID REFERENCES siparisler(id) ON DELETE SET NULL,
        anahtar TEXT,
        deneme INTEGER NOT NULL DEFAULT 0,
        son_hata TEXT,
        sonraki_deneme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        gonderim TIMESTAMPTZ,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS eposta_anahtar_idx ON eposta_kuyrugu (anahtar) WHERE anahtar IS NOT NULL;
      CREATE INDEX IF NOT EXISTS eposta_bekleyen_idx ON eposta_kuyrugu (sonraki_deneme) WHERE gonderim IS NULL;
    `,
    // Mevcut ürünlere adres (slug) ver
    async sonra(client) {
      const { rows } = await client.query('SELECT id, ad FROM urunler WHERE slug IS NULL ORDER BY id');
      for (const urun of rows) {
        await client.query('UPDATE urunler SET slug = $1 WHERE id = $2', [await bosSlugBul(client, urun.ad, urun.id), urun.id]);
      }
      await client.query('ALTER TABLE urunler ALTER COLUMN slug SET NOT NULL');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS urunler_slug_idx ON urunler (slug)');
    }
  },
  {
    surum: 3,
    ad: 'otomatik-iade',
    sql: `
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS iade_kurus INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS iade_detay JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS iade_baslangic TIMESTAMPTZ;
    `
  },
  {
    surum: 4,
    ad: 'uyelik-ve-yonetici-hesabi',
    sql: `
      -- Müşteri üyelikleri ve yönetici (fidancı) hesabı
      CREATE TABLE IF NOT EXISTS kullanicilar (
        id SERIAL PRIMARY KEY,
        rol TEXT NOT NULL CHECK (rol IN ('musteri', 'admin')),
        email TEXT,
        kullanici_adi TEXT,
        sifre_hash TEXT NOT NULL,
        ad TEXT NOT NULL DEFAULT '',
        soyad TEXT NOT NULL DEFAULT '',
        telefon TEXT NOT NULL DEFAULT '',
        il TEXT NOT NULL DEFAULT '',
        ilce TEXT NOT NULL DEFAULT '',
        adres TEXT NOT NULL DEFAULT '',
        posta_kodu TEXT NOT NULL DEFAULT '',
        oturum_surumu INTEGER NOT NULL DEFAULT 1,
        son_giris TIMESTAMPTZ,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (email IS NOT NULL OR kullanici_adi IS NOT NULL)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_email_idx ON kullanicilar (lower(email)) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_kadi_idx ON kullanicilar (lower(kullanici_adi)) WHERE kullanici_adi IS NOT NULL;

      ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS siparisler_kullanici_idx ON siparisler (kullanici_id, olusturma DESC);

      -- "Şifremi unuttum" bağlantıları (sadece özeti saklanır, 1 saat geçerli, tek kullanımlık)
      CREATE TABLE IF NOT EXISTS sifre_sifirlama (
        id SERIAL PRIMARY KEY,
        kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
        kod_ozeti TEXT NOT NULL UNIQUE,
        son_kullanma TIMESTAMPTZ NOT NULL,
        kullanildi TIMESTAMPTZ,
        olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    surum: 5,
    ad: 'urun-bakim-bilgileri',
    sql: `
      -- Ürün sayfasındaki "Dikim ve bakım" bölümü: dikim zamanı, güneş, sulama, meyve verme, soğuğa dayanıklılık...
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS latince_ad TEXT NOT NULL DEFAULT '';
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS bakim JSONB NOT NULL DEFAULT '{}'::jsonb;
    `
  }
];

// "elma-fidani" doluysa "elma-fidani-2", "elma-fidani-3" ...
async function bosSlugBul(db, ad, haricId = null) {
  const temel = slugYap(ad);
  for (let i = 1; i < 1000; i++) {
    const aday = i === 1 ? temel : `${temel}-${i}`;
    const { rowCount } = await db.query(
      'SELECT 1 FROM urunler WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)', [aday, haricId]
    );
    if (rowCount === 0) return aday;
  }
  return `${temel}-${Date.now()}`;
}

async function gocleriUygula({ sessiz = false } = {}) {
  const uygulanan = [];
  await islem(async (client) => {
    // Aynı anda iki sunucu açılırsa göçler iki kez çalışmasın
    await client.query('SELECT pg_advisory_xact_lock(8675309)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sema_gocleri (
        surum INTEGER PRIMARY KEY,
        ad TEXT NOT NULL,
        uygulama TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query('SELECT surum FROM sema_gocleri');
    const yapilmis = new Set(rows.map(r => r.surum));

    for (const goc of GOCLER) {
      if (yapilmis.has(goc.surum)) continue;
      await client.query(goc.sql);
      if (goc.sonra) await goc.sonra(client);
      await client.query('INSERT INTO sema_gocleri (surum, ad) VALUES ($1, $2)', [goc.surum, goc.ad]);
      uygulanan.push(`${goc.surum}-${goc.ad}`);
    }
  });
  if (!sessiz) {
    console.log(uygulanan.length ? `✔ Veritabanı güncellendi: ${uygulanan.join(', ')}` : '✔ Veritabanı güncel');
  }
  return uygulanan;
}

module.exports = { gocleriUygula, bosSlugBul };
