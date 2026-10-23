'use strict';
// Yönetim paneli şifresinin "hash"ini üretir. Şifrenin kendisi hiçbir yere kaydedilmez.
// Kullanım:  node sifre-olustur.js 'YeniGüçlüŞifre-2026'
// Çıkan satırı .env dosyasına tek tırnak içinde yazın:  ADMIN_SIFRE_HASH='$2b$12$...'
const bcrypt = require('bcryptjs');

const sifre = process.argv[2];
if (!sifre || sifre.length < 10) {
  console.log("En az 10 karakterli bir şifre verin:  node sifre-olustur.js 'SIFRENIZ'");
  process.exit(1);
}
const hash = bcrypt.hashSync(sifre, 12);
console.log(`\n.env dosyasına bu satırı yazın (tek tırnaklarla birlikte):\n\nADMIN_SIFRE_HASH='${hash}'\n`);
console.log('Not: Şifreyi değiştirdikten sonra sunucuyu yeniden başlatın.');
