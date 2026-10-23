'use strict';
// Ürün sayfası: galeri, seçenekler, sepete ekleme, bakım bilgileri, benzer fidanlar
(() => {
  const { esc, tlKisa, api, gorselUrl, parametre, bildir, sepeteEkle, sepetOku, ikon, urunKarti, yerlestir, hazirla, sepeteUcur, isletmeAl, dolu } = Site;
  const $ = id => document.getElementById(id);
  let urun = null;

  // [alan, ikon, başlık]
  const BAKIM = [
    ['dikim', 'takvim', 'Dikim zamanı'], ['gunes', 'gunes', 'Güneş'], ['sulama', 'damla', 'Sulama'],
    ['toprak', 'toprak', 'Toprak'], ['meyve', 'agac', 'Meyve verme'], ['hasat', 'elma', 'Hasat'],
    ['soguk', 'kar', 'Soğuğa dayanıklılık'], ['boy', 'boy', 'Ağaç boyu'], ['tozlasma', 'cicek', 'Tozlaşma']
  ];

  function seciliSecenek() {
    const secili = document.querySelector('input[name="secenek"]:checked');
    return secili ? urun.secenekler.find(s => s.id === Number(secili.value)) : null;
  }

  function enFazlaAdet(s) {
    const sepettekiAdet = s ? (sepetOku().find(x => x.secenekId === s.id)?.adet || 0) : 0;
    return s ? Math.max(Math.min(s.stok, 10) - sepettekiAdet, 0) : 0;
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
    const metin = !s ? 'Seçenek seçin' : (s.stok === 0 ? 'Tükendi' : (enFazla === 0 ? 'Hepsi sepetinizde' : 'Sepete ekle'));
    for (const btn of [$('ekleBtn'), $('yEkle')]) {
      btn.disabled = !s || enFazla === 0;
      btn.textContent = metin;
    }
    $('hemenAl').disabled = !s || (s.stok === 0);
    $('secenekBilgi').textContent = s && s.stok > 0 && s.stok <= 3 ? `Son ${s.stok} adet` : '';
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
    $('kategori').textContent = urun.kategori;
    $('ad').textContent = urun.ad;
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
    } else {
      $('anaGorsel').classList.add('gizli');
      $('bosGorsel').classList.remove('gizli');
      $('anaCerceve').style.cursor = 'default';
    }

    // Seçenekler
    const ilkStoktaki = urun.secenekler.find(s => s.stok > 0);
    $('secenekler').innerHTML = urun.secenekler.map(s => `
      <label class="secenek ${s.stok === 0 ? 'pasif' : ''}">
        <input type="radio" name="secenek" value="${s.id}" ${s === ilkStoktaki ? 'checked' : ''} ${s.stok === 0 ? 'disabled' : ''}>
        <span class="secenek__tik">${ikon('tik')}</span>
        <span class="secenek__ad">${esc(s.ad)}</span>
        <span class="secenek__fiyat">${tlKisa(s.fiyatKurus)}</span>
        ${s.stok === 0 ? '<span class="secenek__stok">Tükendi</span>' : (s.stok <= 3 ? `<span class="secenek__stok">Son ${s.stok} adet</span>` : '')}
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

  $('yEkle').addEventListener('click', () => $('sepetForm').requestSubmit());

  // Bildirimdeki "Sepete git" mini sepeti açsın
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-sepet-goster]')) return;
    e.preventDefault();
    Site.cekmeceAc();
  });

  // Mobilde "Sepete ekle" butonu ekrandan çıkınca altta yapışkan çubuk görünür
  function yapiskanKur() {
    if (!('IntersectionObserver' in window)) return;
    const cubuk = $('yapiskan');
    new IntersectionObserver(([g]) => {
      const goster = !g.isIntersecting && g.boundingClientRect.top < 0;
      cubuk.classList.toggle('gorun', goster);
      cubuk.setAttribute('aria-hidden', String(!goster));
      $('yEkle').tabIndex = goster ? 0 : -1;
    }).observe($('ekleBtn'));
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

  isletmeAl().then((i) => { if (dolu(i.kargoyaVerilmeSuresi)) $('kargoBilgi').textContent = i.kargoyaVerilmeSuresi; });

  const slug = parametre('u');
  if (!slug) {
    $('durum').className = 'hata-kutu';
    $('durum').innerHTML = `${ikon('uyari')}<span>Ürün bulunamadı. <a href="/paketler.html">Tüm paketler</a></span>`;
  } else {
    api(`/api/urunler/${encodeURIComponent(slug)}`)
      .then((veri) => { urun = veri; ciz(); })
      .catch((hata) => {
        $('durum').className = 'hata-kutu';
        $('durum').innerHTML = `${ikon('uyari')}<span>${esc(hata.message)} <a href="/paketler.html">Tüm paketler</a></span>`;
      });
  }
})();
