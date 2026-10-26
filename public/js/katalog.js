'use strict';
// Paketler sayfası: her süre seçeneği afiş tarzı bir kart olarak gösterilir
(() => {
  const { esc, ikon, yerlestir, paketSecenekleriAl, posterKart } = Site;
  const $ = id => document.getElementById(id);
  $('urunler').innerHTML = '<p class="yukleniyor-yazi">Paketler yükleniyor</p>';
  paketSecenekleriAl()
    .then((liste) => {
      const sayi = document.querySelector('[data-sayi="cesit"]');
      if (sayi) sayi.textContent = String(liste.length);
      yerlestir($('urunler'), liste.length ? liste.map(posterKart).join('')
        : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Paketler çok yakında burada</h3><p>Bilgi almak için WhatsApp'tan yazabilirsin.</p></div>`);
    })
    .catch((hata) => { $('urunler').innerHTML = `<div class="hata-kutu">${ikon('uyari')}<span>${esc(hata.message)}</span></div>`; });
})();
