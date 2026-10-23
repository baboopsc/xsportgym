'use strict';
// Bütün sayfaların ortak kodu: API çağrısı, sepet, üst menü, alt bilgi, mini sepet,
// bildirimler ve kaydırınca beliren öğeler. İkonlar için önce ikonlar.js yüklenir.
const Site = (() => {
  const SEPET_ANAHTARI = 'xsport-sepet-v1';
  const ikon = (ad, sinif) => (window.Ikon ? Ikon.svg(ad, sinif) : '');
  const azHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (deger) => String(deger ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const tl = kurus => (Number(kurus) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  // Kuruşu yoksa "650 TL", varsa "650,50 TL"
  const tlKisa = (kurus) => {
    const k = Number(kurus);
    return k % 100 === 0 ? (k / 100).toLocaleString('tr-TR') + ' TL' : tl(k);
  };

  const parametre = ad => new URLSearchParams(location.search).get(ad);

  // Büyük harfe çevrilen başlıklarda İngilizce kelimeler Türkçe kurala göre "ONLİNE" olmasın diye
  // lang="en" ile işaretlenir. Girdi düz metindir, çıktı güvenli HTML'dir.
  const INGILIZCE = /\b(online|coaching|personal|training|fitness)\b/gi;
  const adHtml = metin => esc(metin).replace(INGILIZCE, k => `<span lang="en">${k}</span>`);
  const gorselUrl = id => `/api/gorsel/${encodeURIComponent(id)}`;
  // İşletme bilgisinde henüz doldurulmamış alanları gösterme
  const dolu = deger => Boolean(deger) && !String(deger).startsWith('DOLDURULACAK');

  async function api(url, { method = 'GET', govde } = {}) {
    // Veri değiştiren isteklerde özel başlık (CSRF koruması: başka siteler bu başlığı ekleyemez)
    const ayar = { method, headers: method === 'GET' ? {} : { 'X-Istek': 'panel' }, credentials: 'same-origin' };
    if (govde !== undefined) {
      ayar.headers['Content-Type'] = 'application/json';
      ayar.body = JSON.stringify(govde);
    }
    let cevap;
    try {
      cevap = await fetch(url, ayar);
    } catch {
      throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    let veri = null;
    try { veri = await cevap.json(); } catch { /* boş cevap */ }
    if (!cevap.ok) {
      const hata = new Error((veri && veri.hata) || 'Bir hata oluştu, lütfen tekrar deneyin.');
      hata.durum = cevap.status;
      throw hata;
    }
    return veri;
  }

  // ---------- Sepet (sadece bu tarayıcıda tutulur) ----------
  function sepetOku() {
    try {
      const veri = JSON.parse(localStorage.getItem(SEPET_ANAHTARI) || '[]');
      if (!Array.isArray(veri)) return [];
      return veri.filter(s => s && Number.isInteger(s.secenekId) && Number.isInteger(s.adet) && s.adet > 0)
        .map(s => ({ secenekId: s.secenekId, adet: Math.min(s.adet, 50) }));
    } catch {
      return [];
    }
  }

  function sepetYaz(sepet) {
    try { localStorage.setItem(SEPET_ANAHTARI, JSON.stringify(sepet)); } catch { /* gizli sekme vb. */ }
    rozetiGuncelle();
    document.dispatchEvent(new CustomEvent('sepet-degisti'));
  }

  function sepeteEkle(secenekId, adet = 1, enFazla = 50) {
    const sepet = sepetOku();
    const satir = sepet.find(s => s.secenekId === secenekId);
    if (satir) satir.adet = Math.min(satir.adet + adet, enFazla);
    else sepet.push({ secenekId, adet: Math.min(adet, enFazla) });
    sepetYaz(sepet);
    rozetiZiplat();
  }

  function sepetAdetAyarla(secenekId, adet) {
    sepetYaz(sepetOku().map(s => (s.secenekId === secenekId ? { ...s, adet } : s)).filter(s => s.adet > 0));
  }

  function sepettenCikar(secenekId) {
    sepetYaz(sepetOku().filter(s => s.secenekId !== secenekId));
  }

  function sepetiBosalt() { sepetYaz([]); }

  const sepetAdedi = () => sepetOku().reduce((t, s) => t + s.adet, 0);

  function rozetiGuncelle() {
    const adet = sepetAdedi();
    document.querySelectorAll('[data-sepet-sayi]').forEach((el) => {
      el.textContent = adet > 99 ? '99+' : adet;
      el.classList.toggle('gizli', adet === 0);
    });
  }

  function rozetiZiplat() {
    document.querySelectorAll('[data-sepet-sayi]').forEach((el) => {
      el.classList.remove('zipla');
      void el.offsetWidth; // animasyonu yeniden başlat
      el.classList.add('zipla');
    });
  }

  // ---------- Kısa bildirim ----------
  let bildirimZamani = null;
  function bildir(mesajHtml, sure = 4000, ikonAdi = 'tik-daire') {
    let kutu = document.querySelector('.bildirim');
    if (!kutu) {
      kutu = document.createElement('div');
      kutu.className = 'bildirim gizli';
      kutu.setAttribute('role', 'status');
      document.body.appendChild(kutu);
    }
    kutu.innerHTML = `<span class="ikon-kutu">${ikon(ikonAdi)}</span><span>${mesajHtml}</span>`;
    kutu.classList.remove('gizli');
    clearTimeout(bildirimZamani);
    bildirimZamani = setTimeout(() => kutu.classList.add('gizli'), sure);
  }

  // ---------- Giriş durumu ve işletme bilgisi ----------
  let benSozu = null;
  function benAl(tazele = false) {
    if (!benSozu || tazele) benSozu = api('/api/hesap/ben').catch(() => ({ girisli: false }));
    return benSozu;
  }

  // Ürün listesi tek sefer istenir; menü ve sayfa aynı cevabı kullanır
  let urunSozu = null;
  function urunleriAl() {
    if (!urunSozu) urunSozu = api('/api/urunler').catch((hata) => { urunSozu = null; throw hata; });
    return urunSozu;
  }

  // Fiyat kartları için: her paketin süre seçeneklerini tek listede toplar.
  // "3 aylık" gibi adlardan ay sayısı çıkarılır; aylık maliyeti en düşük çok aylık seçenek "En avantajlı" işaretlenir.
  let seceneklerSozu = null;
  function paketSecenekleriAl() {
    if (!seceneklerSozu) {
      seceneklerSozu = urunleriAl()
        .then(urunler => Promise.all(urunler.map(u => api(`/api/urunler/${encodeURIComponent(u.slug)}`))))
        .then((detaylar) => {
          const liste = [];
          for (const u of detaylar) {
            for (const s of u.secenekler) {
              const ay = Number((/(\d+)\s*ay/i.exec(s.ad) || [])[1]) || null;
              // Aylık tutar tam liraya yuvarlanır (ör. 4.000 TL / 3 ay = ayda 1.333 TL)
              liste.push({ urun: u, secenek: s, ay, aylikKurus: ay ? Math.round(s.fiyatKurus / ay / 100) * 100 : null });
            }
          }
          const cokAylik = liste.filter(x => x.ay > 1 && x.secenek.stok > 0);
          const tekAy = liste.find(x => x.ay === 1);
          if (cokAylik.length) {
            const enIyi = cokAylik.reduce((a, b) => (b.aylikKurus < a.aylikKurus ? b : a));
            if (!tekAy || enIyi.aylikKurus < tekAy.aylikKurus) enIyi.avantajli = true;
          }
          return liste;
        })
        .catch((hata) => { seceneklerSozu = null; throw hata; });
    }
    return seceneklerSozu;
  }

  let isletmeSozu = null;
  function isletmeAl() {
    if (!isletmeSozu) isletmeSozu = api('/api/isletme').catch(() => ({ marka: 'Xsportgym' }));
    return isletmeSozu;
  }

  // ---------- Paket kartı (ana sayfa, paketler, diğer paketler) ----------
  function cerceve(gorselId, alt, { yukle = 'lazy' } = {}) {
    return `<span class="cerceve"><span class="cerceve__ic">${gorselId
      ? `<img src="${gorselUrl(gorselId)}" alt="${esc(alt)}" loading="${yukle}" decoding="async" data-yukleniyor>`
      : `<span class="cerceve__bos">${window.Ikon ? Ikon.cizim('dambil') : ''}<span>Fotoğraf yakında</span></span>`}</span></span>`;
  }

  // Kartta gösterilecek kısa bilgi: paketin süresi ya da başlangıcı
  function kartBilgisi(u) {
    const b = u.bakim || {};
    if (b.sure) return ['Süre', b.sure];
    return null;
  }

  function urunKarti(u, i = 0) {
    const link = `/urun.html?u=${encodeURIComponent(u.slug)}`;
    const bilgi = kartBilgisi(u);
    const fiyat = u.stokta
      ? `<span class="urun-kart__rozet">${tlKisa(u.enDusukFiyatKurus)}${u.secenekSayisi > 1 ? "'den" : ''}</span>`
      : '<span class="urun-kart__rozet tukendi">Tükendi</span>';
    const secenek = u.stokta && u.secenekSayisi > 1 ? `<span class="urun-kart__rozet ikinci">${esc(u.secenekSayisi)} seçenek</span>` : '';
    const altYazi = [u.kategori, bilgi && `${bilgi[0]}: ${bilgi[1]}`].filter(Boolean).map(esc).join(' · ');
    return `
      <article class="urun-kart" data-reveal data-i="${i}">
        <div class="cerceve-sar">${cerceve(u.gorselId, u.ad)}${fiyat}${secenek}</div>
        <div class="urun-kart__govde">
          <div>
            <h3 class="urun-kart__ad"><a href="${link}">${esc(u.ad)}</a></h3>
            <span class="urun-kart__alt-yazi">${altYazi}</span>
          </div>
          <span class="daire-ok" aria-hidden="true">${ikon('ok-capraz')}</span>
        </div>
      </article>`;
  }

  function iskeletKartlari(adet = 4) {
    return Array.from({ length: adet }, () => `
      <div class="urun-kart iskelet-kart" aria-hidden="true">
        <span class="cerceve"><span class="cerceve__ic"></span></span>
        <div class="urun-kart__govde"><span class="iskelet-cizgi"></span><span class="iskelet-cizgi kisa"></span></div>
      </div>`).join('');
  }

  // Güvenlik kuralı (CSP) "style" özniteliğine izin vermez; sıra/gecikme değerleri data-i ile verilip burada ayarlanır
  function degiskenleriUygula(kok) {
    kok.querySelectorAll('[data-i]').forEach((el) => {
      el.style.setProperty('--i', el.dataset.i);
      el.style.setProperty('--sira', el.dataset.i % 4);
    });
  }

  // Büyük görsel yerleri: <div class="gorsel-yeri" data-yer="kahraman"> -> gorseller.js'teki dosya ya da sade yer tutucu
  function gorselYerleri(kok) {
    const liste = typeof GORSELLER === 'object' ? GORSELLER : {};
    kok.querySelectorAll('.gorsel-yeri[data-yer]:not([data-hazir])').forEach((el) => {
      el.setAttribute('data-hazir', '');
      const yol = liste[el.dataset.yer];
      if (yol) {
        const img = document.createElement('img');
        img.alt = el.dataset.alt || '';
        img.decoding = 'async';
        if (el.dataset.oncelik !== undefined) img.fetchPriority = 'high'; else img.loading = 'lazy';
        img.setAttribute('data-yukleniyor', '');
        const bitti = () => img.removeAttribute('data-yukleniyor');
        img.addEventListener('load', bitti, { once: true });
        img.addEventListener('error', () => { img.remove(); el.insertAdjacentHTML('beforeend', bosYer()); }, { once: true });
        img.src = yol;
        if (el.dataset.srcset) { img.srcset = el.dataset.srcset; img.sizes = el.dataset.sizes || '100vw'; }
        el.appendChild(img);
      } else {
        el.insertAdjacentHTML('beforeend', bosYer());
      }
    });
  }
  const bosYer = () => `<span class="gorsel-yeri__bos">${window.Ikon ? Ikon.cizim('dambil') : ''}</span>`;

  // HTML'i yerleştirir, ikonları çizer, görselleri yumuşak açar, beliren öğeleri izler
  function yerlestir(el, html) {
    el.innerHTML = html;
    hazirla(el);
  }

  function hazirla(kok) {
    degiskenleriUygula(kok);
    gorselYerleri(kok);
    if (window.Ikon) Ikon.yerlestir(kok);
    kok.querySelectorAll('img[data-yukleniyor]').forEach((img) => {
      const bitti = () => img.removeAttribute('data-yukleniyor');
      if (img.complete) bitti(); else { img.addEventListener('load', bitti, { once: true }); img.addEventListener('error', bitti, { once: true }); }
    });
    gozle(kok);
  }

  // ---------- Kaydırınca beliren öğeler ----------
  const gozlemci = 'IntersectionObserver' in window
    ? new IntersectionObserver((girdiler) => {
      for (const g of girdiler) {
        if (!g.isIntersecting) continue;
        g.target.classList.add('gorundu');
        gozlemci.unobserve(g.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;

  function gozle(kok = document) {
    kok.querySelectorAll('[data-reveal-grup]').forEach((grup) => {
      [...grup.querySelectorAll('[data-reveal]')].forEach((el, i) => el.style.setProperty('--sira', i));
    });
    kok.querySelectorAll('[data-reveal]:not(.gorundu), [data-gozle]:not(.gorundu), .cizim-anim:not(.gorundu)').forEach((el) => {
      if (gozlemci && !azHareket) gozlemci.observe(el); else el.classList.add('gorundu');
    });
  }

  // ---------- Üst menü ----------
  const MENU = [
    ['/', 'Ana sayfa'],
    ['/paketler.html', '<span><span lang="en">Online</span> koçluk</span>'],
    ['/hakkimizda.html', 'Hakkımızda'],
    ['/#kampanyalar', 'Kampanyalar'],
    ['/#iletisim', 'İletişim']
  ];
  const logoHtml = () => `<span class="logo__isaret"><img src="/img/logo-x.svg" alt="" width="48" height="48"></span><span class="logo__yazi"><b>xsport</b><span>gym</span></span>`;

  // Test şeridinin yüksekliği CSS'e verilir; üst menünün kendi yüksekliği CSS'te (--ust-h)
  function ustMenuYuksekligi() {
    const serit = document.querySelector('.test-seridi');
    document.documentElement.style.setProperty('--serit', `${serit ? serit.offsetHeight : 0}px`);
  }

  function ustCiz() {
    const ust = document.getElementById('ust');
    if (!ust) return;
    const yol = location.pathname;
    const secili = href => href === yol || (href === '/' && yol === '/index.html');
    ust.className = 'ust-alan';
    ust.innerHTML = `
      <div class="ust" data-ust>
        <div class="kap ust__ic">
          <a class="logo" href="/" aria-label="Xsportgym ana sayfa">${logoHtml()}</a>
          <nav class="ust__menu" aria-label="Ana menü">
            ${MENU.map(([href, ad]) => (href === '/paketler.html'
              ? `<div class="menu-acilir"><a href="${href}" ${secili(href) ? 'aria-current="page"' : ''} aria-haspopup="true">${ad}${ikon('asagi')}</a><div class="menu-panel" data-tur-paneli></div></div>`
              : `<a href="${href}" ${secili(href) ? 'aria-current="page"' : ''}>${ad}</a>`)).join('')}
          </nav>
          <div class="ust__araclar">
            <a class="ikon-btn" href="https://www.instagram.com/xsportgymm/" target="_blank" rel="noopener" aria-label="Instagram'da Xsportgym">${ikon('instagram')}</a>
            <a class="ikon-btn" href="/giris.html" data-hesap-link aria-label="Giriş yap">${ikon('hesap')}</a>
            <a class="ikon-btn sepet-btn" href="/sepet.html" data-sepet-ac aria-label="Sepetim">${ikon('sepet')}<span class="sepet-sayi gizli" data-sepet-sayi>0</span></a>
            <a class="btn" href="/#online-kocluk">Hemen başla</a>
            <button class="ikon-btn menu-btn" type="button" aria-label="Menüyü aç" aria-expanded="false" aria-controls="mobilMenu">${ikon('menu')}</button>
          </div>
        </div>
      </div>
      <nav class="mobil-menu" id="mobilMenu" aria-label="Mobil menü">
        ${MENU.map(([href, ad], i) => `<a href="${href}" data-i="${i}" ${secili(href) ? 'aria-current="page"' : ''}>${ad}</a>`).join('')}
        <a href="/sepet.html" data-i="5">Sepetim</a>
        <div class="mobil-menu__alt"><a class="btn sari buyuk" href="/#online-kocluk"><span><span lang="en">Online</span> koçluk</span> ${ikon('ok-capraz')}</a></div>
      </nav>`;
    degiskenleriUygula(ust);
    rozetiGuncelle();
    ustMenuYuksekligi();

    const btn = ust.querySelector('.menu-btn');
    const menu = ust.querySelector('#mobilMenu');
    const ustBar = ust.querySelector('[data-ust]');
    const menuyuAyarla = (acik) => {
      menu.classList.toggle('acik', acik);
      ustBar.classList.toggle('menu-acik', acik);
      btn.setAttribute('aria-expanded', String(acik));
      btn.setAttribute('aria-label', acik ? 'Menüyü kapat' : 'Menüyü aç');
      btn.innerHTML = ikon(acik ? 'kapat' : 'menu');
      document.body.style.overflow = acik ? 'hidden' : '';
    };
    btn.addEventListener('click', () => menuyuAyarla(!menu.classList.contains('acik')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) menuyuAyarla(false); });

    // "Paketler" açılır listesi: türler ilk açılışta yüklenir (sayfa açılırken fazladan istek yapılmaz)
    const acilir = ust.querySelector('.menu-acilir');
    if (acilir) {
      const panel = acilir.querySelector('[data-tur-paneli]');
      let yuklendi = false;
      const doldur = () => {
        if (yuklendi) return;
        yuklendi = true;
        panel.innerHTML = '<p class="yukleniyor-yazi">Yükleniyor</p>';
        urunleriAl().then((urunler) => {
          const turler = new Map();
          urunler.forEach(u => turler.set(u.kategori, (turler.get(u.kategori) || 0) + 1));
          panel.innerHTML = `<a class="tumu" href="/paketler.html">Tüm paketler<sup>${urunler.length}</sup></a>`
            + [...turler.entries()].map(([ad, adet]) => `<a href="/paketler.html?kategori=${encodeURIComponent(ad)}">${adHtml(ad)}<sup>${adet}</sup></a>`).join('');
        }).catch(() => { yuklendi = false; panel.innerHTML = '<a href="/paketler.html">Tüm paketler</a>'; });
      };
      acilir.addEventListener('pointerenter', doldur);
      acilir.addEventListener('focusin', doldur);
    }

    ust.querySelector('[data-sepet-ac]').addEventListener('click', (e) => {
      if (location.pathname === '/sepet.html' || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      cekmeceAc();
    });

    benAl().then((ben) => {
      const link = ust.querySelector('[data-hesap-link]');
      if (!link || !ben.girisli) return;
      const admin = ben.kullanici.rol === 'admin';
      link.href = admin ? '/admin.html' : '/hesabim.html';
      link.setAttribute('aria-label', admin ? 'Yönetim paneli' : `Hesabım (${ben.kullanici.ad})`);
      link.title = admin ? 'Yönetim paneli' : 'Hesabım';
    });
  }

  function testSeridiEkle(i) {
    const ust = document.getElementById('ust');
    if (!ust || !i.testModu || ust.querySelector('.test-seridi')) return;
    ust.insertAdjacentHTML('afterbegin', `<div class="test-seridi">${ikon('bilgi')} Test modu · Bu sitede gerçek ödeme alınmaz</div>`);
    ustMenuYuksekligi();
  }

  // ---------- Xsportgym: iletişim yardımcıları ----------
  // "0532 123 45 67" -> https://wa.me/905321234567
  function whatsappLink(numara, mesaj = 'Merhaba, Xsportgym hakkında bilgi almak istiyorum.') {
    let n = String(numara).replace(/\D/g, '');
    if (n.startsWith('0')) n = '90' + n.slice(1);
    else if (n.length === 10) n = '90' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(mesaj)}`;
  }
  // Çalışma saatleri "·" ile ayrılmış tek satır olarak tutulur, sitede alt alta gösterilir
  const saatSatirlari = i => (dolu(i.calismaSaatleri) ? String(i.calismaSaatleri).split('·').map(s => s.trim()).filter(Boolean) : []);

  // ---------- Alt bilgi ----------
  function altCiz(i) {
    const alt = document.getElementById('alt');
    if (!alt) return;
    const yil = new Date().getFullYear();
    const iletisim = [
      dolu(i.telefon) && `<li>${ikon('telefon')}<a href="tel:${esc(String(i.telefon).replace(/\s/g, ''))}">${esc(i.telefon)}</a></li>`,
      dolu(i.whatsapp) && `<li>${ikon('whatsapp')}<a href="${esc(whatsappLink(i.whatsapp))}" target="_blank" rel="noopener">WhatsApp'tan yazın</a></li>`,
      dolu(i.eposta) && `<li>${ikon('eposta')}<a href="mailto:${esc(i.eposta)}">${esc(i.eposta)}</a></li>`,
      dolu(i.adres) && `<li>${ikon('konum')}${dolu(i.haritaLinki) ? `<a href="${esc(i.haritaLinki)}" target="_blank" rel="noopener">${esc(i.adres)}</a>` : `<span>${esc(i.adres)}</span>`}</li>`,
      ...saatSatirlari(i).map(s => `<li>${ikon('saat')}<span>${esc(s)}</span></li>`)
    ].filter(Boolean).join('');
    alt.className = 'alt';
    alt.innerHTML = `
      <div class="alt__kutu">
      <div class="kap">
        <div class="alt__cta">
          <p class="ust-baslik">Xsportgym</p>
          <h2>Bugün başla, <em>daha güçlü</em> ol.</h2>
          <a class="btn sari buyuk" href="/#online-kocluk">Hemen başla ${ikon('ok-capraz')}</a>
        </div>
        <div class="alt__izgara">
          <div>
            <a class="logo" href="/">${logoHtml()}</a>
            <p>Antakya Güzelburç'ta spor salonu ve online koçluk. Kişiye özel antrenman ve beslenme programı.</p>
          </div>
          <div>
            <h4>Salon</h4>
            <ul>
              <li><a href="/paketler.html">Online koçluk paketleri</a></li>
              <li><a href="/#kampanyalar">Kampanyalar</a></li>
              <li><a href="/hakkimizda.html">Hakkımızda</a></li>
              <li><a href="/link">Tüm linkler</a></li>
              <li><a href="/giris.html">Hesabım</a></li>
            </ul>
          </div>
          <div>
            <h4>Bilgilendirme</h4>
            <ul>
              <li><a href="/sayfa/kvkk-aydinlatma-metni">KVKK aydınlatma metni</a></li>
              <li><a href="/sayfa/gizlilik-ve-cerez-politikasi">Gizlilik ve çerezler</a></li>
              <li><a href="/sayfa/iptal-ve-iade-kosullari">İptal ve iade</a></li>
              <li><a href="/sayfa/hizmet-kosullari">Hizmet koşulları</a></li>
              <li><a href="/sayfa/mesafeli-satis-sozlesmesi">Mesafeli satış sözleşmesi</a></li>
            </ul>
          </div>
          <div>
            <h4>İletişim</h4>
            <ul class="alt__iletisim">
              ${iletisim || `<li>${ikon('mesaj')}<a href="/sayfa/iletisim">İletişim bilgileri</a></li>`}
              ${dolu(i.instagram) ? `<li>${ikon('instagram')}<a href="https://www.instagram.com/${esc(i.instagram)}/" target="_blank" rel="noopener">@${esc(i.instagram)}</a></li>` : ''}
            </ul>
          </div>
        </div>
        <div class="alt__alt">
          <span>© ${yil} ${esc(i.marka || 'Xsportgym')}</span>
          <span class="alt__guven">
            <span>${ikon('kalkan')} iyzico ile güvenli ödeme</span>
            <span>${ikon('kilit')} Kart bilgileriniz bu sitede saklanmaz</span>
          </span>
          <a class="yukari-btn" href="#">Yukarı çık ${ikon('ok-yukari')}</a>
        </div>
      </div>
      </div>`;
    alt.querySelector('.yukari-btn').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: azHareket ? 'auto' : 'smooth' }); });
    gozle(alt);
  }

  // ---------- Mini sepet çekmecesi ----------
  let cekmece = null;
  let oncekiOdak = null;

  function cekmeceKur() {
    cekmece = document.createElement('div');
    cekmece.className = 'cekmece';
    cekmece.innerHTML = `
      <div class="cekmece__perde" data-kapat></div>
      <aside class="cekmece__panel" role="dialog" aria-modal="true" aria-labelledby="cekmeceBaslik" tabindex="-1">
        <div class="cekmece__ust">
          <h2 id="cekmeceBaslik">Sepetim<sup data-cekmece-sayi></sup></h2>
          <button class="ikon-btn" type="button" data-kapat aria-label="Kapat">${ikon('kapat')}</button>
        </div>
        <div class="cekmece__govde" data-cekmece-govde></div>
        <div class="cekmece__alt" data-cekmece-alt></div>
      </aside>`;
    document.body.appendChild(cekmece);
    cekmece.addEventListener('click', (e) => {
      if (e.target.closest('[data-kapat]')) cekmeceKapat();
      const sil = e.target.closest('[data-cekmece-sil]');
      if (sil) {
        sepettenCikar(Number(sil.dataset.cekmeceSil));
        cekmeceDoldur();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cekmece.classList.contains('acik')) cekmeceKapat();
    });
  }

  async function cekmeceDoldur() {
    const govde = cekmece.querySelector('[data-cekmece-govde]');
    const alt = cekmece.querySelector('[data-cekmece-alt]');
    const sepet = sepetOku();
    cekmece.querySelector('[data-cekmece-sayi]').textContent = sepet.length ? sepetAdedi() : '';
    if (!sepet.length) {
      govde.innerHTML = `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Sepetin boş</h3><p>Hedefine uygun online koçluk paketini seç.</p></div>`;
      alt.innerHTML = `<a class="btn tam" href="/paketler.html">Paketlere göz at ${ikon('ok-capraz')}</a>`;
      return;
    }
    if (!govde.children.length || govde.querySelector('.bos-durum')) govde.innerHTML = '<p class="yukleniyor-yazi">Sepet yükleniyor</p>';
    try {
      const v = await api('/api/sepet/fiyatla', { method: 'POST', govde: { sepet } });
      const gecerli = new Set(v.kalemler.map(k => k.secenekId));
      if (gecerli.size !== sepet.length) { sepetYaz(sepet.filter(s => gecerli.has(s.secenekId))); if (!v.kalemler.length) return cekmeceDoldur(); }
      yerlestir(govde, v.kalemler.map((k, i) => `
        <div class="cekmece__satir" data-i="${i}">
          <a href="/urun.html?u=${encodeURIComponent(k.slug)}">${cerceve(k.gorselId, k.urunAdi)}</a>
          <div><strong>${esc(k.urunAdi)}</strong><span>${esc(k.secenekAdi)} · ${tlKisa(k.birimFiyatKurus * k.adet)}</span></div>
          <button class="ikon-btn sil" type="button" data-cekmece-sil="${k.secenekId}" aria-label="${esc(k.urunAdi)} paketini sepetten çıkar">${ikon('cop')}</button>
        </div>`).join(''));
      alt.innerHTML = `
        ${v.sorunlar.length ? `<div class="uyari-kutu">${ikon('uyari')}<span>${esc(v.sorunlar[0].mesaj)}</span></div>` : ''}
        <div class="cekmece__kargo">${ikon('whatsapp')} Ödemeden sonra seninle iletişime geçiyoruz</div>
        <div class="ozet-satir toplam"><span>Toplam</span><span class="noktalar"></span><span>${tl(v.toplamKurus)}</span></div>
        <a class="btn tam buyuk ${v.sorunlar.length ? 'gizli' : ''}" href="/odeme.html">Ödemeye geç ${ikon('ok-capraz')}</a>
        <a class="btn ikincil tam" href="/sepet.html">Sepeti düzenle</a>`;
    } catch (hata) {
      govde.innerHTML = `<div class="hata-kutu">${ikon('uyari')}<span>${esc(hata.message)}</span></div>`;
      alt.innerHTML = `<a class="btn tam" href="/sepet.html">Sepete git</a>`;
    }
  }

  function cekmeceAc() {
    if (!cekmece) cekmeceKur();
    oncekiOdak = document.activeElement;
    document.querySelector('.bildirim')?.classList.add('gizli');
    cekmece.classList.add('acik');
    document.body.style.overflow = 'hidden';
    cekmeceDoldur();
    setTimeout(() => cekmece.querySelector('.cekmece__panel').focus(), 60);
  }

  function cekmeceKapat() {
    if (!cekmece) return;
    cekmece.classList.remove('acik');
    document.body.style.overflow = '';
    if (oncekiOdak && oncekiOdak.focus) oncekiOdak.focus();
  }

  // Ürün görseli sepete uçar
  function sepeteUcur(kaynak) {
    const hedef = document.querySelector('.sepet-btn');
    if (!kaynak || !hedef || azHareket || !kaynak.animate) return Promise.resolve();
    const a = kaynak.getBoundingClientRect();
    const b = hedef.getBoundingClientRect();
    if (!a.width) return Promise.resolve();
    const kopya = document.createElement(kaynak.tagName === 'IMG' ? 'img' : 'div');
    if (kaynak.tagName === 'IMG') kopya.src = kaynak.currentSrc || kaynak.src;
    kopya.className = 'ucan-gorsel';
    const gen = Math.min(a.width, 220);
    const yuk = gen * (a.height / a.width);
    kopya.style.left = `${a.left + (a.width - gen) / 2}px`;
    kopya.style.top = `${a.top + (a.height - yuk) / 2}px`;
    kopya.style.width = `${gen}px`;
    kopya.style.height = `${yuk}px`;
    if (kaynak.tagName !== 'IMG') kopya.style.background = 'var(--zemin-koyu)';
    document.body.appendChild(kopya);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = kopya.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 80}px) scale(0.5)`, opacity: 0.9, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.3 }
    ], { duration: 850, easing: 'cubic-bezier(.5,0,.25,1)' });
    return anim.finished.then(() => { kopya.remove(); rozetiZiplat(); }).catch(() => kopya.remove());
  }

  // ---------- Kaydırma ----------
  const kaydirmaIsleri = [];
  let kareBekliyor = false;
  function kaydirinca(fn) { kaydirmaIsleri.push(fn); fn(window.scrollY); }
  window.addEventListener('scroll', () => {
    if (kareBekliyor) return;
    kareBekliyor = true;
    requestAnimationFrame(() => {
      kareBekliyor = false;
      const y = window.scrollY;
      for (const fn of kaydirmaIsleri) fn(y);
    });
  }, { passive: true });

  // ---------- Başlat ----------
  // Script sayfanın sonunda olduğu için üst menü hemen çizilir (yanıp sönme olmaz)
  ustCiz();
  kaydirinca((y) => document.querySelector('[data-ust]')?.classList.toggle('kaydi', y > 30));
  window.addEventListener('resize', ustMenuYuksekligi);
  hazirla(document.body);
  isletmeAl().then((i) => { testSeridiEkle(i); altCiz(i); });

  // Başka sekmede sepet değişirse sayıyı güncelle
  window.addEventListener('storage', (e) => { if (e.key === SEPET_ANAHTARI) rozetiGuncelle(); });

  return {
    esc, adHtml, tl, tlKisa, api, whatsappLink, saatSatirlari, parametre, gorselUrl, bildir, isletmeAl, benAl, urunleriAl, paketSecenekleriAl, dolu, ikon, azHareket,
    sepetOku, sepetYaz, sepeteEkle, sepetAdetAyarla, sepettenCikar, sepetiBosalt, sepetAdedi,
    cerceve, urunKarti, iskeletKartlari, yerlestir, hazirla, gozle, kaydirinca, cekmeceAc, cekmeceKapat, sepeteUcur
  };
})();
