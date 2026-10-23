'use strict';
// Üyelik ve yönetici hesabı: kayıt, giriş, bilgiler, şifre değiştirme, şifre sıfırlama, hesap silme.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ayarlar = require('./ayarlar');
const { pool, islem } = require('./db');
const dogrulama = require('./dogrulama');
const eposta = require('./eposta');
const iller = require('./iller');
const { KullaniciHatasi, esc } = require('./yardimci');

const BCRYPT_TURU = 12;
// Kullanıcı bulunamasa bile aynı sürede cevap verelim (hangi e-postaların üye olduğu anlaşılmasın)
const SAHTE_HASH = bcrypt.hashSync('kullanilmayan-sahte-sifre', BCRYPT_TURU);

let epostaTetikle = () => {};
function tetikleyiciAyarla(fn) { epostaTetikle = fn; }

function sifreKontrol(sifre, { min = 8 } = {}) {
  if (typeof sifre !== 'string' || sifre.length < min) throw new KullaniciHatasi(`Şifre en az ${min} karakter olmalı.`);
  if (sifre.length > 200) throw new KullaniciHatasi('Şifre çok uzun.');
  if (/^\d+$/.test(sifre) || /^(.)\1+$/.test(sifre)) throw new KullaniciHatasi('Daha güçlü bir şifre seçin (sadece rakam veya tek karakter olmasın).');
  return sifre;
}

const kodOzeti = kod => crypto.createHash('sha256').update(kod).digest('hex');

// ---------- Yönetici ----------

// Veritabanında hiç yönetici yoksa .env'deki ADMIN_SIFRE_HASH ile ilk hesabı aç
async function yoneticiyiHazirla() {
  const { rows: [{ adet }] } = await pool.query(`SELECT COUNT(*)::int AS adet FROM kullanicilar WHERE rol = 'admin'`);
  if (adet > 0) return null;
  if (!ayarlar.admin.sifreHash) {
    console.log("  ⚠ Yönetici hesabı yok. Oluşturmak için: node yonetici-olustur.js KULLANICI_ADI 'ŞİFRE'");
    return null;
  }
  await pool.query(
    `INSERT INTO kullanicilar (rol, kullanici_adi, sifre_hash, ad) VALUES ('admin', $1, $2, 'Yönetici')`,
    [ayarlar.admin.kullaniciAdi, ayarlar.admin.sifreHash]
  );
  console.log(`✔ Yönetici hesabı oluşturuldu. Kullanıcı adı: ${ayarlar.admin.kullaniciAdi} (şifre: .env'deki eski panel şifreniz)`);
  return ayarlar.admin.kullaniciAdi;
}

function kullaniciAdiKontrol(ad) {
  const metin = dogrulama.temizle(ad);
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(metin)) {
    throw new KullaniciHatasi('Kullanıcı adı 3-30 karakter olmalı (harf, rakam, nokta, tire). Türkçe karakter ve @ kullanmayın.');
  }
  return metin;
}

// Yönetici kendi kullanıcı adını/şifresini değiştirir
async function yoneticiHesabiniGuncelle(kullanici, { mevcutSifre, kullaniciAdi, yeniSifre }) {
  const { rows: [k] } = await pool.query('SELECT * FROM kullanicilar WHERE id = $1', [kullanici.id]);
  if (!(await bcrypt.compare(String(mevcutSifre || ''), k.sifre_hash))) throw new KullaniciHatasi('Mevcut şifre yanlış.', 401);
  const yeniAd = kullaniciAdi ? kullaniciAdiKontrol(kullaniciAdi) : k.kullanici_adi;
  let hash = k.sifre_hash;
  let surum = k.oturum_surumu;
  if (yeniSifre) {
    hash = await bcrypt.hash(sifreKontrol(yeniSifre, { min: 10 }), BCRYPT_TURU);
    surum += 1; // diğer cihazlardaki oturumları kapat
  }
  try {
    const { rows: [yeni] } = await pool.query(
      `UPDATE kullanicilar SET kullanici_adi = $2, sifre_hash = $3, oturum_surumu = $4, guncelleme = NOW() WHERE id = $1 RETURNING *`,
      [k.id, yeniAd, hash, surum]
    );
    return yeni;
  } catch (e) {
    if (e.code === '23505') throw new KullaniciHatasi('Bu kullanıcı adı kullanılıyor.');
    throw e;
  }
}

// ---------- Müşteri ----------

async function kayitOl(girdi) {
  const g = girdi && typeof girdi === 'object' ? girdi : {};
  if (g.kvkkOnay !== true) throw new KullaniciHatasi('Üye olmak için KVKK Aydınlatma Metni\'ni okuduğunuzu onaylayın.');
  const ad = dogrulama.metinAlani(g.ad, { ad: 'Ad', min: 2, maks: 50, desen: /^[\p{L}][\p{L} .'-]*$/u, desenMesaji: 'Ad sadece harf içerebilir.' });
  const soyad = dogrulama.metinAlani(g.soyad, { ad: 'Soyad', min: 2, maks: 50, desen: /^[\p{L}][\p{L} .'-]*$/u, desenMesaji: 'Soyad sadece harf içerebilir.' });
  const email = dogrulama.eposta(g.email);
  const telefon = g.telefon ? dogrulama.telefon(g.telefon) : '';
  const hash = await bcrypt.hash(sifreKontrol(g.sifre), BCRYPT_TURU);
  try {
    const { rows: [k] } = await pool.query(`
      INSERT INTO kullanicilar (rol, email, sifre_hash, ad, soyad, telefon, son_giris)
      VALUES ('musteri', $1, $2, $3, $4, $5, NOW()) RETURNING *
    `, [email, hash, ad, soyad, telefon]);
    return k;
  } catch (e) {
    if (e.code === '23505') throw new KullaniciHatasi('Bu e-posta adresiyle zaten üyelik var. Giriş yapın veya "Şifremi unuttum"u kullanın.', 409);
    throw e;
  }
}

// kimlik: müşteri için e-posta, yönetici için kullanıcı adı
async function girisYap(kimlik, sifre) {
  if (typeof kimlik !== 'string' || typeof sifre !== 'string' || !kimlik.trim() || !sifre || kimlik.length > 120 || sifre.length > 200) {
    throw new KullaniciHatasi('E-posta/kullanıcı adı ve şifrenizi yazın.');
  }
  const k0 = kimlik.trim();
  const { rows: [k] } = await pool.query(
    k0.includes('@')
      ? `SELECT * FROM kullanicilar WHERE lower(email) = lower($1)`
      : `SELECT * FROM kullanicilar WHERE lower(kullanici_adi) = lower($1)`,
    [k0]
  );
  const dogru = await bcrypt.compare(sifre, k ? k.sifre_hash : SAHTE_HASH);
  if (!k || !dogru) throw new KullaniciHatasi('E-posta/kullanıcı adı veya şifre yanlış.', 401);
  await pool.query('UPDATE kullanicilar SET son_giris = NOW() WHERE id = $1', [k.id]);
  return k;
}

function gorunum(k) {
  return {
    rol: k.rol,
    email: k.email || null,
    kullaniciAdi: k.kullanici_adi || null,
    ad: k.ad, soyad: k.soyad, telefon: k.telefon,
    il: k.il, ilce: k.ilce, adres: k.adres, postaKodu: k.posta_kodu
  };
}

// Ad, telefon ve kayıtlı teslimat adresi (ödeme sayfası bunlarla dolar)
async function bilgileriGuncelle(kullanici, girdi) {
  const g = girdi && typeof girdi === 'object' ? girdi : {};
  const il = dogrulama.temizle(g.il);
  if (il && !iller.includes(il)) throw new KullaniciHatasi('Lütfen listeden il seçin.');
  const postaKodu = dogrulama.temizle(g.postaKodu);
  if (postaKodu && !/^\d{5}$/.test(postaKodu)) throw new KullaniciHatasi('Posta kodu 5 haneli olmalı.');
  const v = {
    ad: dogrulama.metinAlani(g.ad, { ad: 'Ad', min: 2, maks: 50 }),
    soyad: dogrulama.metinAlani(g.soyad, { ad: 'Soyad', min: 2, maks: 50 }),
    telefon: g.telefon ? dogrulama.telefon(g.telefon) : '',
    il,
    ilce: dogrulama.metinAlani(g.ilce, { ad: 'İlçe', maks: 50, zorunlu: false }),
    adres: dogrulama.metinAlani(g.adres, { ad: 'Adres', maks: 300, zorunlu: false, cokSatirli: true }),
    postaKodu
  };
  const { rows: [k] } = await pool.query(`
    UPDATE kullanicilar SET ad = $2, soyad = $3, telefon = $4, il = $5, ilce = $6, adres = $7, posta_kodu = $8, guncelleme = NOW()
    WHERE id = $1 RETURNING *
  `, [kullanici.id, v.ad, v.soyad, v.telefon, v.il, v.ilce, v.adres, v.postaKodu]);
  return k;
}

// Siparişte kullanılan adresi profile kaydet (ödeme sayfasındaki "adresimi kaydet" kutusu)
async function adresiKaydet(db, kullaniciId, m) {
  await db.query(`
    UPDATE kullanicilar SET ad = $2, soyad = $3, telefon = $4, il = $5, ilce = $6, adres = $7, posta_kodu = $8, guncelleme = NOW()
    WHERE id = $1 AND rol = 'musteri'
  `, [kullaniciId, m.ad, m.soyad, m.telefon, m.il, m.ilce, m.adres, m.postaKodu || '']);
}

async function sifreDegistir(kullanici, mevcutSifre, yeniSifre) {
  const { rows: [k] } = await pool.query('SELECT * FROM kullanicilar WHERE id = $1', [kullanici.id]);
  if (!(await bcrypt.compare(String(mevcutSifre || ''), k.sifre_hash))) throw new KullaniciHatasi('Mevcut şifre yanlış.', 401);
  const hash = await bcrypt.hash(sifreKontrol(yeniSifre, { min: k.rol === 'admin' ? 10 : 8 }), BCRYPT_TURU);
  const { rows: [yeni] } = await pool.query(
    `UPDATE kullanicilar SET sifre_hash = $2, oturum_surumu = oturum_surumu + 1, guncelleme = NOW() WHERE id = $1 RETURNING *`,
    [k.id, hash]
  );
  return yeni;
}

// Bağlantı e-postayla gönderilir. E-posta kayıtlı olmasa da aynı cevap verilir.
async function sifremiUnuttum(emailGirdi) {
  let email;
  try { email = dogrulama.eposta(emailGirdi); } catch { return; }
  const { rows: [k] } = await pool.query(`SELECT * FROM kullanicilar WHERE lower(email) = lower($1) AND rol = 'musteri'`, [email]);
  if (!k) return;
  const kod = crypto.randomBytes(32).toString('hex');
  const link = `${ayarlar.siteUrl}/giris.html?mod=sifirla&t=${kod}`;
  await islem(async (client) => {
    await client.query('UPDATE sifre_sifirlama SET kullanildi = NOW() WHERE kullanici_id = $1 AND kullanildi IS NULL', [k.id]);
    await client.query(
      `INSERT INTO sifre_sifirlama (kullanici_id, kod_ozeti, son_kullanma) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [k.id, kodOzeti(kod)]
    );
    const marka = ayarlar.isletme.marka;
    await eposta.kuyrugaEkle(client, {
      alici: k.email,
      konu: `${marka} şifre sıfırlama`,
      html: `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#2e5d34">${esc(marka)}</h2>
        <p>Merhaba ${esc(k.ad)},</p>
        <p>Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bağlantı <strong>1 saat</strong> geçerlidir ve bir kez kullanılabilir.</p>
        <p><a href="${esc(link)}" style="display:inline-block;background:#2e5d34;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">Şifremi sıfırla</a></p>
        <p style="color:#666;font-size:13px">Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmez.</p>
      </body></html>`,
      metin: `Merhaba ${k.ad},\n\nŞifrenizi sıfırlamak için bu bağlantıyı açın (1 saat geçerli):\n${link}\n\nBu isteği siz yapmadıysanız dikkate almayın.\n\n${marka}`
    });
  });
  epostaTetikle();
}

async function sifreyiSifirla(kod, yeniSifre) {
  if (typeof kod !== 'string' || !/^[0-9a-f]{64}$/.test(kod)) throw new KullaniciHatasi('Bağlantı geçersiz.', 400);
  sifreKontrol(yeniSifre);
  const hash = await bcrypt.hash(yeniSifre, BCRYPT_TURU);
  return islem(async (client) => {
    const { rows: [s] } = await client.query(
      `SELECT * FROM sifre_sifirlama WHERE kod_ozeti = $1 AND kullanildi IS NULL AND son_kullanma > NOW() FOR UPDATE`,
      [kodOzeti(kod)]
    );
    if (!s) throw new KullaniciHatasi('Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeniden "Şifremi unuttum" deyin.', 400);
    await client.query('UPDATE sifre_sifirlama SET kullanildi = NOW() WHERE id = $1', [s.id]);
    const { rows: [k] } = await client.query(
      `UPDATE kullanicilar SET sifre_hash = $2, oturum_surumu = oturum_surumu + 1, guncelleme = NOW() WHERE id = $1 RETURNING *`,
      [s.kullanici_id, hash]
    );
    return k;
  });
}

// KVKK: müşteri hesabını siler. Siparişler yasal saklama süresi boyunca kalır, hesapla bağı kopar.
async function hesabiSil(kullanici, sifre) {
  if (kullanici.rol !== 'musteri') throw new KullaniciHatasi('Yönetici hesabı buradan silinemez.');
  const { rows: [k] } = await pool.query('SELECT * FROM kullanicilar WHERE id = $1', [kullanici.id]);
  if (!(await bcrypt.compare(String(sifre || ''), k.sifre_hash))) throw new KullaniciHatasi('Şifre yanlış.', 401);
  await pool.query('DELETE FROM kullanicilar WHERE id = $1', [k.id]);
}

module.exports = {
  tetikleyiciAyarla, yoneticiyiHazirla, yoneticiHesabiniGuncelle, kullaniciAdiKontrol, sifreKontrol,
  kayitOl, girisYap, gorunum, bilgileriGuncelle, adresiKaydet, sifreDegistir, sifremiUnuttum, sifreyiSifirla, hesabiSil,
  BCRYPT_TURU
};
