'use strict';
// Link sayfası (/link): Instagram bio'suna konacak tek sayfa.
// Online koçluk paketleri otomatik listelenir; WhatsApp ve telefon butonları
// isletme-bilgileri.json'da doluysa en üste eklenir.
(() => {
  // ---------- WhatsApp ve telefon ----------
  const esc = d => String(d ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dolu = d => Boolean(d) && !String(d).startsWith('DOLDURULACAK');
  function whatsappLink(numara) {
    let n = String(numara).replace(/\D/g, '');
    if (n.startsWith('0')) n = '90' + n.slice(1);
    else if (n.length === 10) n = '90' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent('Merhaba, online koçluk hakkında bilgi almak istiyorum.')}`;
  }

  // ---------- Online koçluk seçenekleri (Online Koçluk · 1 aylık / 3 aylık) ----------
  const tl = k => `${(Math.round(k / 100)).toLocaleString('tr-TR')} TL`;
  const adHtml = m => esc(m).replace(/\b(online|coaching|personal|training|fitness)\b/gi, k => `<span lang="en">${k}</span>`);
  const json = url => fetch(url, { credentials: 'same-origin' }).then(c => (c.ok ? c.json() : Promise.reject(new Error(c.status))));
  json('/api/urunler')
    .then(urunler => Promise.all(urunler.map(u => json(`/api/urunler/${encodeURIComponent(u.slug)}`))))
    .then((detaylar) => {
      const butonlar = [];
      for (const u of detaylar) {
        for (const s of u.secenekler) {
          if (s.stok === 0) continue;
          const ay = Number((/(\d+)\s*ay/i.exec(s.ad) || [])[1]) || 0;
          const alt = ay > 1 ? `${tl(s.fiyatKurus)} · ayda ${tl(s.fiyatKurus / ay)}` : tl(s.fiyatKurus);
          butonlar.push(`<a class="link-btn" href="/urun.html?u=${encodeURIComponent(u.slug)}&s=${encodeURIComponent(s.id)}">
            <span class="link-btn__ikon"><i data-ikon="${u.kategori === 'Program' ? 'not' : 'dambil'}"></i></span>
            <span class="link-btn__yazi"><b>${adHtml(u.ad)} · ${esc(s.ad)}</b><small>${esc(alt)}</small></span><i data-ikon="ok-capraz"></i></a>`);
        }
      }
      if (!butonlar.length) return;
      const liste = document.getElementById('koclukListe');
      liste.innerHTML = butonlar.join('');
      Ikon.yerlestir(liste);
      document.getElementById('kocluk').classList.remove('gizli');
    })
    .catch(() => { /* paketler gelmezse "Tüm paketler" butonu yeterli */ });

  fetch('/api/isletme', { credentials: 'same-origin' })
    .then(c => (c.ok ? c.json() : null))
    .then((i) => {
      if (!i) return;
      const butonlar = [
        dolu(i.whatsapp) && `<a class="link-btn link-btn--ana" href="${esc(whatsappLink(i.whatsapp))}" target="_blank" rel="noopener">
          <span class="link-btn__ikon"><i data-ikon="whatsapp"></i></span>
          <span class="link-btn__yazi"><b>WhatsApp'tan yaz</b><small>Online koçluk ve paket bilgisi için</small></span><i data-ikon="ok-capraz"></i></a>`,
        dolu(i.telefon) && `<a class="link-btn" href="tel:${esc(String(i.telefon).replace(/\s/g, ''))}">
          <span class="link-btn__ikon"><i data-ikon="telefon"></i></span>
          <span class="link-btn__yazi"><b>Hemen ara</b><small>${esc(i.telefon)}</small></span><i data-ikon="ok-capraz"></i></a>`
      ].filter(Boolean).join('');
      if (!butonlar) return;
      const liste = document.getElementById('linkler');
      liste.insertAdjacentHTML('afterbegin', butonlar);
      Ikon.yerlestir(liste);
    })
    .catch(() => { /* bilgiler gelmezse sabit butonlar yeterli */ });
})();
