'use strict';
// Ana sayfa: online koçluk fiyat kartları ve iletişim kartı
(() => {
  const { esc, adHtml, ikon, tlKisa, yerlestir, isletmeAl, dolu, whatsappLink, paketSecenekleriAl } = Site;
  const $ = id => document.getElementById(id);

  // Paket sayfasındaki içerik alanlarından kartta gösterilecek ilk üç madde
  const MADDE_ALANLARI = [['program', 'Antrenman programı'], ['beslenme', 'Beslenme planı'], ['takip', 'Takip'], ['iletisim', 'İletişim'], ['guncelleme', 'Program güncelleme']];

  function fiyatKarti({ urun, secenek, ay, aylikKurus, avantajli }, i) {
    const b = urun.bakim || {};
    const maddeler = MADDE_ALANLARI.filter(([alan]) => b[alan]).slice(0, 3)
      .map(([alan, ad]) => `<li>${ikon('tik')}<span><b>${esc(ad)}:</b> ${esc(b[alan])}</span></li>`).join('');
    const link = `/urun.html?u=${encodeURIComponent(urun.slug)}&s=${encodeURIComponent(secenek.id)}`;
    const kontenjanDolu = secenek.stok === 0;
    return `
      <article class="fiyat-kart ${avantajli ? 'one-cikan' : ''}" data-reveal data-i="${i}">
        ${avantajli ? '<span class="fiyat-kart__rozet">En avantajlı</span>' : ''}
        <p class="fiyat-kart__ust">${adHtml(urun.ad)}</p>
        <h3 class="fiyat-kart__ad">${esc(secenek.ad)}</h3>
        <div class="fiyat-kart__fiyat"><strong>${tlKisa(secenek.fiyatKurus)}</strong>${ay > 1 ? `<small>ayda ${tlKisa(aylikKurus)}</small>` : ''}</div>
        ${maddeler ? `<ul class="fiyat-kart__liste">${maddeler}</ul>` : ''}
        ${kontenjanDolu
          ? '<span class="btn tam" aria-disabled="true">Kontenjan dolu</span>'
          : `<a class="btn tam ${avantajli ? 'sari' : ''}" href="${link}">Hemen başla ${ikon('ok-capraz')}</a>`}
      </article>`;
  }

  // ---------- Fiyat kartları ----------
  $('urunler').innerHTML = '<p class="yukleniyor-yazi">Paketler yükleniyor</p>';
  paketSecenekleriAl()
    .then((liste) => {
      yerlestir($('urunler'), liste.length
        ? liste.slice(0, 8).map(fiyatKarti).join('')
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
