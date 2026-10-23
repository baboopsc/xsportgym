'use strict';
// Ürün sayfasındaki "Dikim ve bakım" bilgileri. Panelde doldurulur, boş bırakılanlar sitede görünmez.
const { KullaniciHatasi } = require('./yardimci');
const { metinAlani } = require('./dogrulama');

const BAKIM_ALANLARI = {
  dikim: 'Dikim zamanı',
  gunes: 'Güneş',
  sulama: 'Sulama',
  toprak: 'Toprak',
  meyve: 'Meyve verme',
  hasat: 'Hasat',
  soguk: 'Soğuğa dayanıklılık',
  boy: 'Ağaç boyu',
  tozlasma: 'Tozlaşma'
};

function bakimBilgileri(deger) {
  if (deger === null || deger === undefined) return {};
  if (typeof deger !== 'object' || Array.isArray(deger)) throw new KullaniciHatasi('Bakım bilgileri geçersiz.');
  const sonuc = {};
  for (const [anahtar, ad] of Object.entries(BAKIM_ALANLARI)) {
    const metin = metinAlani(deger[anahtar], { ad, maks: 80, zorunlu: false });
    if (metin) sonuc[anahtar] = metin;
  }
  return sonuc;
}

// Veritabanından gelen değeri sadece bilinen alanlarla dışarı ver
function bakimGoster(deger) {
  const sonuc = {};
  if (!deger || typeof deger !== 'object') return sonuc;
  for (const anahtar of Object.keys(BAKIM_ALANLARI)) {
    if (typeof deger[anahtar] === 'string' && deger[anahtar]) sonuc[anahtar] = deger[anahtar];
  }
  return sonuc;
}

module.exports = { BAKIM_ALANLARI, bakimBilgileri, bakimGoster };
