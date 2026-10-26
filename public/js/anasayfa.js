'use strict';
// Ana sayfa: online koçluk paket afişleri ve iletişim kartı
(() => {
  const { esc, ikon, yerlestir, isletmeAl, dolu, whatsappLink, paketSecenekleriAl, posterKart } = Site;
  const $ = id => document.getElementById(id);

  // ---------- Fiyat kartları ----------
  $('urunler').innerHTML = '<p class="yukleniyor-yazi">Paketler yükleniyor</p>';
  paketSecenekleriAl()
    .then((liste) => {
      yerlestir($('urunler'), liste.length
        ? liste.slice(0, 8).map(posterKart).join('')
        : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Paketler çok yakında burada</h3><p>Online koçluk fiyatları için bize yazın.</p><a class="btn" href="#iletisim">İletişime geç ${ikon('ok-capraz')}</a></div>`);
    })
    .catch((hata) => { $('urunler').innerHTML = `<div class="hata-kutu">${ikon('uyari')}<span>${esc(hata.message)}</span></div>`; });

  // ---------- İletişim kartı (sık sorulanların yanında) ----------
  isletmeAl().then((i) => {
    if (dolu(i.haritaLinki)) document.querySelectorAll('[data-harita-link]').forEach((a) => { a.href = i.haritaLinki; });
    const satirlar = [
      dolu(i.whatsapp) && `<a href="${esc(whatsappLink(i.whatsapp))}" target="_blank" rel="noopener"><span class="ikon-kutu">${ikon('whatsapp')}</span>WhatsApp'tan yaz</a>`,
      dolu(i.telefon) && `<a href="tel:${esc(String(i.telefon).replace(/\s/g, ''))}"><span class="ikon-kutu">${ikon('telefon')}</span>${esc(i.telefon)}</a>`,
      dolu(i.haritaLinki) && `<a href="${esc(i.haritaLinki)}" target="_blank" rel="noopener"><span class="ikon-kutu">${ikon('konum')}</span>Yol tarifi al</a>`,
      dolu(i.instagram) && `<a href="https://www.instagram.com/${esc(i.instagram)}/" target="_blank" rel="noopener"><span class="ikon-kutu">${ikon('instagram')}</span>@${esc(i.instagram)}</a>`,
      dolu(i.eposta) && `<a href="mailto:${esc(i.eposta)}"><span class="ikon-kutu">${ikon('eposta')}</span>${esc(i.eposta)}</a>`
    ].filter(Boolean);
    $('sssIletisim').innerHTML = satirlar.length ? satirlar.join('')
      : `<a href="/sayfa/iletisim"><span class="ikon-kutu">${ikon('mesaj')}</span>İletişim bilgilerimiz</a>`;
  });
})();
