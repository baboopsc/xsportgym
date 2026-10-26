'use strict';
// Yönetici hesabının kullanıcı adını ve şifresini ayarlar. Şifre unutulursa bu kullanılır.
// Tek yönetici varsa yeni ad verilince onun adı değişir (ör. admin -> selen); hesap yoksa oluşturulur.
// Kullanım:  node yonetici-olustur.js KULLANICI_ADI 'GüçlüBirŞifre-2026'
const bcrypt = require('bcryptjs');
const { pool } = require('./lib/db');
const hesap = require('./lib/hesap');
const { gocleriUygula } = require('./lib/gocler');

async function main() {
  const [kullaniciAdiGirdi, sifre] = process.argv.slice(2);
  if (!kullaniciAdiGirdi || !sifre) {
    console.log("Kullanım:  node yonetici-olustur.js KULLANICI_ADI 'ŞİFRE'");
    process.exitCode = 1;
    return;
  }
  const kullaniciAdi = hesap.kullaniciAdiKontrol(kullaniciAdiGirdi);
  hesap.sifreKontrol(sifre, { min: 10 });
  await gocleriUygula({ sessiz: true });
  const hash = await bcrypt.hash(sifre, hesap.BCRYPT_TURU);
  const { rows: [var_] } = await pool.query(`SELECT id, rol FROM kullanicilar WHERE lower(kullanici_adi) = lower($1)`, [kullaniciAdi]);
  if (var_) {
    if (var_.rol !== 'admin') throw new Error('Bu kullanıcı adı bir müşteriye ait.');
    await pool.query(
      'UPDATE kullanicilar SET sifre_hash = $2, oturum_surumu = oturum_surumu + 1, guncelleme = NOW() WHERE id = $1',
      [var_.id, hash]
    );
    console.log(`✔ "${kullaniciAdi}" şifresi değiştirildi. Açık oturumlar kapatıldı.`);
  } else {
    // Tek bir yönetici varsa yeni hesap açmak yerine onun kullanıcı adı ve şifresi değiştirilir (ör. admin -> selen)
    const { rows: yoneticiler } = await pool.query(`SELECT id, kullanici_adi FROM kullanicilar WHERE rol = 'admin'`);
    if (yoneticiler.length === 1) {
      await pool.query(
        'UPDATE kullanicilar SET kullanici_adi = $2, sifre_hash = $3, oturum_surumu = oturum_surumu + 1, guncelleme = NOW() WHERE id = $1',
        [yoneticiler[0].id, kullaniciAdi, hash]
      );
      console.log(`✔ Yönetici "${yoneticiler[0].kullanici_adi}" -> "${kullaniciAdi}" olarak değiştirildi, şifre güncellendi. Açık oturumlar kapatıldı.`);
    } else {
      await pool.query(`INSERT INTO kullanicilar (rol, kullanici_adi, sifre_hash, ad) VALUES ('admin', $1, $2, 'Yönetici')`, [kullaniciAdi, hash]);
      console.log(`✔ Yönetici hesabı oluşturuldu: ${kullaniciAdi}`);
    }
  }
}

main()
  .catch((e) => { console.error('Hata:', e.kullaniciMesaji || e.message); process.exitCode = 1; })
  .finally(() => pool.end());
