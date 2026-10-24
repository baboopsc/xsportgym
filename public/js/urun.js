'use strict';
// Paket sayfası: galeri, seçenekler (1/3/6 ay gibi), satın alma, paket içeriği, diğer paketler
(() => {
  const { esc, adHtml, tlKisa, api, gorselUrl, parametre, bildir, sepeteEkle, sepetOku, ikon, urunKarti, yerlestir, hazirla, sepeteUcur, isletmeAl, dolu } = Site;
  const $ = id => document.getElementById(id);
  let urun = null;

  // [alan, ikon, başlık]
  const BAKIM = [
    ['sure', 'takvim', 'Süre'], ['program', 'dambil', 'Antrenman programı'], ['beslenme', 'elma', 'Beslenme planı'],
    ['takip', 'grafik', 'Takip'], ['iletisim', 'whatsapp', 'İletişim'], ['guncelleme', 'yenile', 'Program güncelleme'],
    ['seviye', 'yildiz', 'Seviye'], ['yer', 'konum', 'Nerede uygulanır'], ['baslangic', 'yildirim', 'Başlangıç']
  ];

  function seciliSecenek() {
    const secili = document.querySelector('input[name="secenek"]:checked');
    return secili ? urun.secenekler.find(s => s.id === Number(secili.value)) : null;
  }

  // Koçluk paketinden bir tane alınır (sepette zaten varsa tekrar eklenmez)
  function enFazlaAdet(s) {
    const sepettekiAdet = s ? (sepetOku().find(x => x.secenekId === s.id)?.adet || 0) : 0;
    return s ? Math.max(Math.min(s.stok, 1) - sepettekiAdet, 0) : 0;
  }

  function adetSiniriniGuncelle() {
    const s = seciliSecenek();
    const enFazla = enFazlaAdet(s);
    const adet = $('adet');
    adet.max = String(Math.max(enFazla, 1));
    if (Number(adet.value) > enFazla) adet.value = String(Math.max(enFazla, 1));
    const fiyat = s ? tlKisa(s.fiyatKurus) : tlKisa(Math.min(...urun.secenekler.map(x => x.fiyatKurus)));
    $('fiyat').textContent = fiyat;
    $('yFiyat').textContent = s ? `${s.ad} · ${fiyat}` : fiyat;
    const metin = !s ? 'Süre seçin' : (s.stok === 0 ? 'Kontenjan dolu' : (enFazla === 0 ? 'Sepetinde' : 'Sepete ekle'));
    $('ekleBtn').disabled = !s || enFazla === 0;
    $('ekleBtn').textContent = metin;
    $('yEkle').disabled = !s || s.stok === 0;
    $('hemenAl').disabled = !s || (s.stok === 0);
    $('secenekBilgi').textContent = s && s.stok > 0 && s.stok <= 3 ? `Son ${s.stok} kontenjan` : '';
  }

  function gorselSec(id) {
    const img = $('anaGorsel');
    $('anaCerceve').classList.remove('yakin');
    img.style.opacity = '0';
    const yeni = new Image();
    yeni.onload = yeni.onerror = () => { img.src = yeni.src; img.style.opacity = ''; };
    yeni.src = gorselUrl(id);
    document.querySelectorAll('#kucukGorseller button').forEach(b => b.classList.toggle('secili', Number(b.dataset.id) === id));
  }

  function paragraflar(metin) {
    return String(metin || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  function ciz() {
    document.title = `${urun.ad} | Xsportgym`;
    $('kategori').innerHTML = adHtml(urun.kategori);
    $('ad').innerHTML = adHtml(urun.ad);
    $('yAd').textContent = urun.ad;
    if (urun.latinceAd) { $('latin').textContent = urun.latinceAd; $('latin').classList.remove('gizli'); }
    $('yol').insertAdjacentHTML('beforeend', `${ikon('sag')}<a href="/paketler.html?kategori=${encodeURIComponent(urun.kategori)}">${esc(urun.kategori)}</a>${ikon('sag')}<span>${esc(urun.ad)}</span>`);

    // Kısa özet + uzun açıklama
    const p = paragraflar(urun.aciklama);
    if (p.length) {
      const ilk = p[0].length > 220 ? `${p[0].slice(0, 210).replace(/\s+\S*$/, '')}…` : p[0];
      $('ozet').textContent = ilk;
      $('ozet').classList.remove('gizli');
    }
    const uzun = p.length > 1 || (p[0] || '').length > 220;
    if (uzun) $('aciklama').innerHTML = p.map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');
    else { $('aciklamaSutun').classList.add('gizli'); $('aciklamaBolum').classList.add('tek'); }
    $('aciklamaBolum').classList.remove('gizli');

    // Galeri
    if (urun.gorseller.length) {
      $('anaGorsel').alt = urun.ad;
      $('kucukGorseller').innerHTML = urun.gorseller.length > 1
        ? urun.gorseller.map((id, i) => `<button type="button" data-id="${id}" aria-label="${i + 1}. fotoğraf"><img src="${gorselUrl(id)}" alt="" loading="lazy"></button>`).join('')
        : '';
      gorselSec(urun.gorseller[0]);
    } else if (typeof GORSELLER === 'object' && GORSELLER.paket) {
      // Panelden fotoğraf eklenmemiş paket: sitenin varsayılan paket görseli
      $('anaGorsel').alt = urun.ad;
      $('anaGorsel').src = GORSELLER.paket;
      $('anaCerceve').style.cursor = 'default';
    } else {
      $('anaGorsel').classList.add('gizli');
      $('bosGorsel').classList.remove('gizli');
      $('anaCerceve').style.cursor = 'default';
    }

    // Seçenekler
    // Adreste ?s=SEÇENEK_NO varsa (ör. link sayfasındaki "3 aylık" butonu) o seçenek seçili gelir
    const istenen = urun.secenekler.find(s => s.id === Number(parametre('s')) && s.stok > 0);
    const ilkStoktaki = istenen || urun.secenekler.find(s => s.stok > 0);
    $('secenekler').innerHTML = urun.secenekler.map(s => `
      <label class="secenek ${s.stok === 0 ? 'pasif' : ''}">
        <input type="radio" name="secenek" value="${s.id}" ${s === ilkStoktaki ? 'checked' : ''} ${s.stok === 0 ? 'disabled' : ''}>
        <span class="secenek__tik">${ikon('tik')}</span>
        <span class="secenek__ad">${esc(s.ad)}</span>
        <span class="secenek__fiyat">${tlKisa(s.fiyatKurus)}</span>
        ${s.stok === 0 ? '<span class="secenek__stok">Kontenjan dolu</span>' : (s.stok <= 3 ? `<span class="secenek__stok">Son ${s.stok} kontenjan</span>` : '')}
      </label>`).join('');

    // Bakım bilgileri
    const bakim = BAKIM.filter(([alan]) => urun.bakim && urun.bakim[alan]);
    if (bakim.length) {
      yerlestir($('bakim'), bakim.map(([alan, ik, baslik]) => `
        <div class="bakim-kart"><span class="ikon-kutu">${ikon(ik)}</span><div><small>${esc(baslik)}</small><strong>${esc(urun.bakim[alan])}</strong></div></div>`).join(''));
      $('bakimBolum').classList.remove('gizli');
    }

    $('durum').classList.add('gizli');
    $('detay').classList.remove('gizli');
    hazirla(document.querySelector('main'));
    adetSiniriniGuncelle();
    yapiskanKur();
    benzerleriGoster();
  }

  // Görsele tıklayınca yakınlaştır, fareyle gez
  $('anaCerceve').addEventListener('click', () => {
    if (!urun || !urun.gorseller.length) return;
    $('anaCerceve').classList.toggle('yakin');
  });
  $('anaCerceve').addEventListener('mousemove', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.querySelector('img').style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.querySelector('img').style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`);
  });

  $('kucukGorseller').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (btn) gorselSec(Number(btn.dataset.id));
  });
  $('secenekler').addEventListener('change', adetSiniriniGuncelle);
  document.querySelector('.adet-kutu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-adet]');
    if (!btn) return;
    const adet = $('adet');
    const yeni = Number(adet.value || 1) + Number(btn.dataset.adet);
    adet.value = String(Math.min(Math.max(yeni, 1), Number(adet.max)));
  });

  function ekle() {
    const s = seciliSecenek();
    if (!s || enFazlaAdet(s) === 0) return null;
    const adet = Math.min(Math.max(Number.parseInt($('adet').value, 10) || 1, 1), Number($('adet').max));
    sepeteEkle(s.id, adet, Math.min(s.stok, 50));
    return { s, adet };
  }

  $('sepetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const sonuc = ekle();
    if (!sonuc) return;
    const kaynak = $('anaGorsel').classList.contains('gizli') ? $('anaCerceve') : $('anaGorsel');
    sepeteUcur(kaynak).then(() => {
      bildir(`<strong>${esc(urun.ad)}</strong> (${esc(sonuc.s.ad)}) sepete eklendi. <a href="/sepet.html" data-sepet-goster>Sepete git</a>`);
    });
    $('adet').value = '1';
    adetSiniriniGuncelle();
  });

  $('hemenAl').addEventListener('click', () => {
    const s = seciliSecenek();
    if (!s) return;
    if (enFazlaAdet(s) > 0) ekle();
    location.href = '/odeme.html';
  });

  $('yEkle').addEventListener('click', () => $('hemenAl').click());

  // Bildirimdeki "Sepete git" mini sepeti açsın
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-sepet-goster]')) return;
    e.preventDefault();
    Site.cekmeceAc();
  });

  // Mobilde "Hemen başla" butonu ekrandan çıkınca altta yapışkan çubuk görünür
  function yapiskanKur() {
    if (!('IntersectionObserver' in window)) return;
    const cubuk = $('yapiskan');
    new IntersectionObserver(([g]) => {
      const goster = !g.isIntersecting && g.boundingClientRect.top < 0;
      cubuk.classList.toggle('gorun', goster);
      cubuk.setAttribute('aria-hidden', String(!goster));
      $('yEkle').tabIndex = goster ? 0 : -1;
    }).observe($('hemenAl'));
  }

  async function benzerleriGoster() {
    try {
      const hepsi = await Site.urunleriAl();
      const digerleri = hepsi.filter(u => u.slug !== urun.slug);
      const sirali = [...digerleri.filter(u => u.kategori === urun.kategori), ...digerleri.filter(u => u.kategori !== urun.kategori)].slice(0, 4);
      if (!sirali.length) return;
      yerlestir($('benzerler'), sirali.map(urunKarti).join(''));
      $('benzerBolum').classList.remove('gizli');
    } catch { /* önemsiz */ }
  }


  const slug = parametre('u');
  if (!slug) {
    $('durum').className = 'hata-kutu';
    $('durum').innerHTML = `${ikon('uyari')}<span>Paket bulunamadı. <a href="/paketler.html">Tüm paketler</a></span>`;
  } else {
    api(`/api/urunler/${encodeURIComponent(slug)}`)
      .then((veri) => { urun = veri; ciz(); })
      .catch((hata) => {
        $('durum').className = 'hata-kutu';
        $('durum').innerHTML = `${ikon('uyari')}<span>${esc(hata.message)} <a href="/paketler.html">Tüm paketler</a></span>`;
      });
  }
})();
