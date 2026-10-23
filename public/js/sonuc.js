'use strict';
// Ödemeden sonra açılan sayfa: siparişin gerçek durumunu sunucudan alır.
(() => {
  const { esc, tl, api, parametre, sepetiBosalt, ikon, hazirla, azHareket } = Site;
  const kutu = document.getElementById('sonuc');
  const no = parametre('no');
  const k = parametre('k');
  const ODENMIS = ['inceleme', 'odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi'];

  if (kutu.dataset.sayfa === 'basarisiz') return; // başarısız sayfası sabit metin gösterir

  function goster(html) {
    kutu.innerHTML = html;
    hazirla(kutu);
  }

  if (!no || !k) {
    goster(`<div class="sonuc-ikon"><i data-ikon="sorgu"></i></div><h1>Sipariş <em>bulunamadı</em></h1>
      <p>Bağlantı eksik görünüyor. Siparişinizi numarası ve e-posta adresinizle sorgulayabilirsiniz.</p>
      <div class="sonuc-butonlar"><a class="btn" href="/siparis.html">Siparişimi sorgula</a></div>`);
    return;
  }

  const takipLinki = `/siparis.html?no=${encodeURIComponent(no)}&k=${encodeURIComponent(k)}`;
  let deneme = 0;

  // Sevinç: ekranın üstünden kiraz çiçeği yaprakları dökülür
  function yaprakYagdir() {
    if (azHareket) return;
    const kap = document.createElement('div');
    kap.className = 'yapraklar sabit';
    kap.setAttribute('aria-hidden', 'true');
    const r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 34; i++) {
      const y = document.createElement('span');
      y.className = 'yaprakcik tek';
      y.innerHTML = '<i></i>';
      y.style.setProperty('--x', `${r(-5, 105)}%`);
      y.style.setProperty('--b', `${r(9, 17)}px`);
      y.style.setProperty('--sure', `${r(5, 9)}s`);
      y.style.setProperty('--g', `${r(0, 1.8)}s`);
      y.style.setProperty('--dx', `${r(-260, 120)}px`);
      y.style.setProperty('--don', `${r(200, 620)}deg`);
      kap.appendChild(y);
    }
    document.body.appendChild(kap);
    setTimeout(() => kap.remove(), 12000);
  }

  function durumuGoster(s) {
    if (ODENMIS.includes(s.durum)) {
      sepetiBosalt();
      try { sessionStorage.removeItem('ozyurt-odeme-formu'); } catch { /* önemsiz */ }
      let ilkKez = true; // yapraklar sadece ilk açılışta dökülsün
      try {
        ilkKez = !sessionStorage.getItem(`kutlandi-${s.siparisNo}`);
        sessionStorage.setItem(`kutlandi-${s.siparisNo}`, '1');
      } catch { /* önemsiz */ }
      goster(`
        <p class="ust-baslik">Siparişiniz alındı</p>
        <h1 class="dev-baslik">Teşekkürler<em>.</em></h1>
        <p>Seni salonda görmek için sabırsızlanıyoruz. Sipariş özetiniz ve sözleşmeleriniz e-posta adresinize gönderildi.</p>
        ${s.durum === 'inceleme' ? `<div class="uyari-kutu">${ikon('saat')}<span>Ödemeniz kısa bir güvenlik kontrolünden geçiyor. Onaylanınca siparişiniz hazırlanacak.</span></div>` : ''}
        <div class="siparis-no">Sipariş no <strong>#${esc(s.siparisNo)}</strong></div>
        <div class="ozet-kart sonuc-ozet">
          ${s.kalemler.map(x => `<div class="ozet-satir"><span>${esc(x.urunAdi)} <span class="soluk">(${esc(x.secenekAdi)}) × ${x.adet}</span></span><span class="noktalar"></span><span>${tl(x.birimFiyatKurus * x.adet)}</span></div>`).join('')}
          <div class="ozet-satir"><span>Kargo</span><span class="noktalar"></span><span class="ucretsiz">Ücretsiz</span></div>
          <div class="ozet-satir toplam"><span>Toplam</span><span class="noktalar"></span><span>${tl(s.toplamKurus)}</span></div>
        </div>
        <div class="sonuc-butonlar">
          <a class="btn buyuk" href="${takipLinki}">Siparişimi takip et ${ikon('ok-sag')}</a>
          <a class="btn ikincil buyuk" href="/paketler.html">Alışverişe devam et</a>
        </div>`);
      document.title = 'Teşekkürler | Xsportgym';
      if (ilkKez) yaprakYagdir();
      return;
    }
    if (s.durum === 'odeme-bekliyor' && deneme < 12) {
      deneme++;
      goster(`
        <div class="bekle-yaprak">${ikon('yaprak')}</div>
        <p class="ust-baslik">Bir saniye</p>
        <h1>Ödemeniz <em>kontrol ediliyor</em></h1>
        <p>Bu birkaç saniye sürebilir, lütfen sayfayı kapatmayın.</p>
        <div class="siparis-no">Sipariş no <strong>#${esc(s.siparisNo)}</strong></div>`);
      setTimeout(yukle, 5000);
      return;
    }
    if (s.durum === 'odeme-bekliyor') {
      goster(`
        <div class="sonuc-ikon"><i data-ikon="saat"></i></div>
        <h1>Ödemeniz henüz <em>doğrulanmadı</em></h1>
        <p>Kartınızdan para çekildiyse siparişiniz birkaç dakika içinde otomatik olarak onaylanacaktır.
           Durumu sipariş sayfanızdan takip edebilirsiniz.</p>
        <div class="siparis-no">Sipariş no <strong>#${esc(s.siparisNo)}</strong></div>
        <div class="sonuc-butonlar"><a class="btn" href="${takipLinki}">Sipariş sayfam</a></div>`);
      return;
    }
    location.replace(`/basarisiz.html?no=${encodeURIComponent(no)}&k=${encodeURIComponent(k)}`);
  }

  function yukle() {
    api(`/api/siparis/${encodeURIComponent(no)}?k=${encodeURIComponent(k)}`)
      .then(durumuGoster)
      .catch((hata) => goster(`<div class="sonuc-ikon kirmizi"><i data-ikon="uyari"></i></div><h1>Bir sorun <em>oluştu</em></h1><p>${esc(hata.message)}</p>`));
  }
  yukle();
})();
