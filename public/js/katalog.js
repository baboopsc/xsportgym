'use strict';
// Katalog sayfası: tüm paketler, kategori, arama ve sıralama
(() => {
  const { esc, api, ikon, urunKarti, iskeletKartlari, yerlestir, parametre } = Site;
  const $ = id => document.getElementById(id);
  let urunler = [];
  const durum = { kategori: parametre('kategori') || '', ara: '', sirala: '' };

  // Türkçe harfleri sadeleştirerek ara ("kayisi" yazan "Kayısı"yı bulsun)
  const sade = m => String(m).toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');

  function ciz() {
    let liste = urunler.filter(u => !durum.kategori || u.kategori === durum.kategori);
    if (durum.ara) {
      const q = sade(durum.ara);
      liste = liste.filter(u => sade(`${u.ad} ${u.kategori} ${u.latinceAd || ''} ${u.kisaAciklama || ''} ${Object.values(u.bakim || {}).join(' ')}`).includes(q));
    }
    const fiyat = u => (u.stokta ? u.enDusukFiyatKurus : Infinity);
    if (durum.sirala === 'artan') liste = [...liste].sort((a, b) => fiyat(a) - fiyat(b));
    if (durum.sirala === 'azalan') liste = [...liste].sort((a, b) => (b.stokta ? b.enDusukFiyatKurus : -1) - (a.stokta ? a.enDusukFiyatKurus : -1));
    if (durum.sirala === 'ad') liste = [...liste].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

    yerlestir($('urunler'), liste.length ? liste.map(urunKarti).join('') : `
      <div class="bos-durum">${Ikon.cizim('dambil')}<h3>Aradığınız paketi bulamadık</h3>
        <p>Farklı bir kelimeyle aramayı deneyin ya da bize sorun; elimizde olmayan çeşitleri de bulmaya çalışırız.</p>
        <button class="btn ikincil" type="button" data-temizle>Aramayı temizle</button></div>`);
    $('sonucSayisi').textContent = urunler.length ? `${liste.length} paket listeleniyor` : '';

    const kategoriler = [...new Set(urunler.map(u => u.kategori))];
    $('kategoriler').innerHTML = kategoriler.length > 1
      ? ['', ...kategoriler].map((k) => {
        const adet = k ? urunler.filter(u => u.kategori === k).length : urunler.length;
        return `<button type="button" class="cip" aria-pressed="${k === durum.kategori}" data-kategori="${esc(k)}">${k ? esc(k) : 'Tümü'}<sup>${adet}</sup></button>`;
      }).join('')
      : '';
  }

  $('kategoriler').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kategori]');
    if (!btn) return;
    durum.kategori = btn.dataset.kategori;
    const url = new URL(location.href);
    if (durum.kategori) url.searchParams.set('kategori', durum.kategori); else url.searchParams.delete('kategori');
    history.replaceState(null, '', url);
    ciz();
  });
  let zaman = null;
  $('araKutusu').addEventListener('input', (e) => { clearTimeout(zaman); zaman = setTimeout(() => { durum.ara = e.target.value.trim(); ciz(); }, 180); });
  $('sirala').addEventListener('change', (e) => { durum.sirala = e.target.value; ciz(); });
  $('urunler').addEventListener('click', (e) => {
    if (!e.target.closest('[data-temizle]')) return;
    durum.ara = ''; durum.kategori = ''; $('araKutusu').value = '';
    ciz();
  });

  // Üst menüdeki arama ikonu buraya getirir
  if (location.hash === '#ara') setTimeout(() => $('araKutusu').focus({ preventScroll: true }), 300);

  $('urunler').innerHTML = iskeletKartlari(8);
  Site.urunleriAl()
    .then((veri) => {
      urunler = veri;
      const yaz = (ad, deger) => document.querySelectorAll(`[data-sayi="${ad}"]`).forEach((el) => { el.textContent = deger ? String(deger) : '—'; });
      yaz('cesit', veri.length);
      yaz('kategori', new Set(veri.map(u => u.kategori)).size);
      ciz();
    })
    .catch((hata) => { $('urunler').innerHTML = `<div class="hata-kutu">${ikon('uyari')}<span>${esc(hata.message)}</span></div>`; });
})();
