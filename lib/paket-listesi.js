'use strict';
// Sitede satılan online koçluk paketleri. kurulum.js --ornek ve paketleri-guncelle.js buradan okur.
// Fiyatlar TL. Kontenjan 999 = pratikte sınırsız. Fiyatı sonradan panelden de değiştirebilirsiniz.
module.exports = [
  {
    ad: 'Online Koçluk', slogan: 'Değişime benimle başla', kategori: 'Online Koçluk',
    aciklama: 'Hedefine, seviyene ve ayırabildiğin zamana göre hazırlanan kişiye özel antrenman programı ve beslenme planı. '
      + 'Paket süresi boyunca formun ve ilerlemen düzenli olarak takip edilir, programın gerektikçe güncellenir.\n\n'
      + 'Ödemen onaylandıktan sonra seninle iletişime geçip hedefini, seviyeni ve günlük düzenini konuşuyoruz. '
      + 'Programını hazırlayıp sana iletiyoruz; sen evde ya da salonda uygularken WhatsApp üzerinden her adımda yanında oluyoruz.',
    bakim: {
      sure: 'Seçtiğin süre boyunca',
      program: 'Kişiye özel antrenman programı',
      beslenme: 'Kişiye özel beslenme planı',
      takip: 'Haftalık form ve ilerleme kontrolü',
      iletisim: 'WhatsApp ile birebir destek',
      guncelleme: 'İlerlemene göre güncellenir',
      seviye: 'Yeni başlayandan ileri seviyeye',
      yer: 'Evde veya salonda',
      baslangic: 'Ödeme onayından sonra'
    },
    // [seçenek adı, fiyat TL, kontenjan]
    secenekler: [['1 aylık', 1500, 999], ['3 aylık', 4000, 999]]
  }
];
