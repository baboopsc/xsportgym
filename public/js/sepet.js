'use strict';
(() => {
  const { esc, tl, tlKisa, api, ikon, cerceve, yerlestir, sepetOku, sepetYaz, sepetAdetAyarla, sepettenCikar, sepetAdedi } = Site;
  const $ = id => document.getElementById(id);
  let sonVeri = null;
  let ilkCizim = true;

  function satir(k, i) {
    const enFazla = Math.max(Math.min(k.stok, 50), 1);
    const link = `/urun.html?u=${encodeURIComponent(k.slug)}`;
    return `
      <div class="sepet-satir" data-satir="${k.secenekId}" ${ilkCizim ? `data-i="${i}"` : ''}>
        <a href="${link}" tabindex="-1" aria-hidden="true">${cerceve(k.gorselId, '')}</a>
        <div>
          <a class="sepet-satir__ad" href="${link}">${esc(k.urunAdi)}</a>
          <div class="soluk kucuk">${esc(k.secenekAdi)} · ${tlKisa(k.birimFiyatKurus)}</div>
          <div class="sepet-satir__alt">
            <div class="adet-kutu kucuk-adet" role="group" aria-label="${esc(k.urunAdi)} adedi">
              <button type="button" data-azalt="${k.secenekId}" aria-label="Azalt" ${k.adet <= 1 ? 'disabled' : ''}>${ikon('eksi')}</button>
              <input type="number" value="${k.adet}" min="1" max="${enFazla}" data-adet-giris="${k.secenekId}" aria-label="Adet">
              <button type="button" data-artir="${k.secenekId}" data-max="${enFazla}" aria-label="Artır" ${k.adet >= enFazla ? 'disabled' : ''}>${ikon('arti')}</button>
            </div>
          </div>
        </div>
        <div class="sepet-satir__sag">
          <strong>${tl(k.satirKurus)}</strong>
          <button type="button" class="metin-btn" data-sil="${k.secenekId}">${ikon('cop')} Kaldır</button>
        </div>
      </div>`;
  }

  async function yukle() {
    const sepet = sepetOku();
    $('yukleniyor').classList.add('gizli');
    $('adetYazi').textContent = sepet.length ? `(${sepetAdedi()})` : '';
    if (sepet.length === 0) {
      $('dolu').classList.add('gizli');
      $('bos').classList.remove('gizli');
      Site.gozle($('bos').parentElement);
      return;
    }
    try {
      sonVeri = await api('/api/sepet/fiyatla', { method: 'POST', govde: { sepet } });
    } catch (hata) {
      $('dolu').classList.remove('gizli');
      $('sorunlar').innerHTML = `<div class="hata-kutu">${ikon('uyari')}<span>${esc(hata.message)}</span></div>`;
      return;
    }

    // Artık satışta olmayan ürünleri sepetten çıkar
    const gecerli = new Set(sonVeri.kalemler.map(k => k.secenekId));
    if (gecerli.size !== sepet.length) sepetYaz(sepet.filter(s => gecerli.has(s.secenekId)));
    if (sonVeri.kalemler.length === 0) return yukle();

    $('bos').classList.add('gizli');
    $('dolu').classList.remove('gizli');
    yerlestir($('satirlar'), sonVeri.kalemler.map(satir).join(''));
    ilkCizim = false;
    $('sorunlar').innerHTML = sonVeri.sorunlar.map(s => `<div class="uyari-kutu">${ikon('uyari')}<span>${esc(s.mesaj)}</span></div>`).join('');
    $('araToplam').textContent = tl(sonVeri.toplamKurus);
    $('toplam').textContent = tl(sonVeri.toplamKurus);
    $('odemeBtn').classList.toggle('gizli', sonVeri.sorunlar.length > 0);
  }

  $('satirlar').addEventListener('click', (e) => {
    const sil = e.target.closest('[data-sil]');
    const azalt = e.target.closest('[data-azalt]');
    const artir = e.target.closest('[data-artir]');
    const mevcut = id => sepetOku().find(s => s.secenekId === id)?.adet || 0;
    if (sil) {
      const id = Number(sil.dataset.sil);
      const el = sil.closest('.sepet-satir');
      el.classList.add('kaldiriliyor');
      setTimeout(() => { sepettenCikar(id); yukle(); }, Site.azHareket ? 0 : 380);
      return;
    }
    if (azalt) { const id = Number(azalt.dataset.azalt); sepetAdetAyarla(id, Math.max(mevcut(id) - 1, 1)); }
    else if (artir) { const id = Number(artir.dataset.artir); sepetAdetAyarla(id, Math.min(mevcut(id) + 1, Number(artir.dataset.max))); }
    else return;
    yukle();
  });

  $('satirlar').addEventListener('change', (e) => {
    const giris = e.target.closest('[data-adet-giris]');
    if (!giris) return;
    const adet = Math.min(Math.max(Number.parseInt(giris.value, 10) || 1, 1), Number(giris.max));
    sepetAdetAyarla(Number(giris.dataset.adetGiris), adet);
    yukle();
  });

  yukle();
})();
