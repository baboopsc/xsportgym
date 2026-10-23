'use strict';
// Link sayfası (/link): Instagram bio'suna konacak tek sayfa.
// Şu an açık mı / kapalı mı Türkiye saatine göre hesaplanır; WhatsApp ve telefon butonları
// isletme-bilgileri.json'da doluysa en üste eklenir.
(() => {
  // Çalışma saatleri (gün: 0 = pazar, 1 = pazartesi ... 6 = cumartesi). Saatler değişirse burayı ve link.html'deki listeyi güncelleyin.
  const SAATLER = {
    0: null,
    1: ['07:00', '22:30'], 2: ['07:00', '22:30'], 3: ['07:00', '22:30'], 4: ['07:00', '22:30'], 5: ['07:00', '22:30'],
    6: ['08:00', '21:00']
  };
  const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

  const dakika = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const saatYaz = s => s.replace(':', '.');

  // Saatin okunuşundaki son kelimeye göre Türkçe ek: 07.00'de, 08.00'e, 22.30'a, 21.00'de
  const BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
  const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli'];
  function sonKelime(s) {
    const [h, m] = s.split(':').map(Number);
    const n = m || h;
    return n % 10 ? BIRLER[n % 10] : ONLAR[Math.floor(n / 10)];
  }
  function ek(s, tur) {
    const k = sonKelime(s);
    const unluler = k.match(/[aeıioöuü]/g) || ['e'];
    const kalin = 'aıou'.includes(unluler[unluler.length - 1]);
    if (tur === 'yonelme') return `${saatYaz(s)}'${/[aeıioöuü]$/.test(k) ? 'y' : ''}${kalin ? 'a' : 'e'}`; // 22.30'a, 07.00'ye
    const sert = /[fstkçşhp]$/.test(k);
    return `${saatYaz(s)}'${sert ? 't' : 'd'}${kalin ? 'a' : 'e'}`; // 07.00'de, 21.00'de, 08.30'da
  }

  // Ziyaretçi nerede olursa olsun Türkiye saatini kullan
  function turkiyeZamani() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const gun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { gun, dk: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  }

  function durumHesapla() {
    const { gun, dk } = turkiyeZamani();
    const bugun = SAATLER[gun];
    if (bugun && dk >= dakika(bugun[0]) && dk < dakika(bugun[1])) {
      const kalan = dakika(bugun[1]) - dk;
      return { acik: true, yazi: kalan <= 60 ? `Şu an açık · ${ek(bugun[1], 'bulunma')} kapanıyor` : `Şu an açık · ${ek(bugun[1], 'yonelme')} kadar` };
    }
    if (bugun && dk < dakika(bugun[0])) return { acik: false, yazi: `Şu an kapalı · Bugün ${ek(bugun[0], 'bulunma')} açılıyor` };
    for (let i = 1; i <= 7; i++) { // sonraki açık gün
      const g = (gun + i) % 7;
      if (SAATLER[g]) return { acik: false, yazi: `Şu an kapalı · ${i === 1 ? 'Yarın' : GUN_ADI[g]} ${ek(SAATLER[g][0], 'bulunma')} açılıyor` };
    }
    return { acik: false, yazi: 'Şu an kapalı' };
  }

  function durumGoster() {
    const d = durumHesapla();
    const kutu = document.getElementById('durum');
    kutu.hidden = false;
    kutu.classList.toggle('acik', d.acik);
    document.getElementById('durumYazi').textContent = d.yazi;
    const { gun } = turkiyeZamani();
    document.querySelectorAll('.link-saatler li').forEach((li) => {
      li.classList.toggle('bugun', li.dataset.gunler.split(',').map(Number).includes(gun));
    });
  }
  durumGoster();
  setInterval(durumGoster, 60 * 1000);

  // ---------- WhatsApp ve telefon ----------
  const esc = d => String(d ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dolu = d => Boolean(d) && !String(d).startsWith('DOLDURULACAK');
  function whatsappLink(numara) {
    let n = String(numara).replace(/\D/g, '');
    if (n.startsWith('0')) n = '90' + n.slice(1);
    else if (n.length === 10) n = '90' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent('Merhaba, Xsportgym hakkında bilgi almak istiyorum.')}`;
  }

  // ---------- Online koçluk seçenekleri (Online Koçluk · 1 aylık / 3 aylık / 6 aylık ...) ----------
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
      if (dolu(i.haritaLinki)) document.getElementById('haritaLink').href = i.haritaLinki;
      const butonlar = [
        dolu(i.whatsapp) && `<a class="link-btn link-btn--ana" href="${esc(whatsappLink(i.whatsapp))}" target="_blank" rel="noopener">
          <span class="link-btn__ikon"><i data-ikon="whatsapp"></i></span>
          <span class="link-btn__yazi"><b>WhatsApp'tan yaz</b><small>Üyelik ve fiyat bilgisi için</small></span><i data-ikon="ok-capraz"></i></a>`,
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
