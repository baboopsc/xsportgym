'use strict';
(() => {
  const { esc, tl, api, sepetOku, sepetiBosalt, benAl, ikon } = Site;
  let uye = null;
  const $ = id => document.getElementById(id);
  const ALANLAR = ['ad', 'soyad', 'telefon', 'email', 'il', 'ilce', 'adres', 'postaKodu', 'not'];
  const FORM_ANAHTARI = 'ozyurt-odeme-formu';

  function formuOku() {
    return Object.fromEntries(ALANLAR.map(a => [a, $(a).value.trim()]));
  }

  // Ödeme başarısız olup geri dönülürse formu tekrar doldurmak zorunda kalmasın (sekme kapanınca silinir)
  function formuSakla() {
    try { sessionStorage.setItem(FORM_ANAHTARI, JSON.stringify(formuOku())); } catch { /* önemsiz */ }
  }
  function formuGeriYukle() {
    try {
      const veri = JSON.parse(sessionStorage.getItem(FORM_ANAHTARI) || '{}');
      for (const a of ALANLAR) if (typeof veri[a] === 'string') $(a).value = veri[a];
    } catch { /* önemsiz */ }
  }

  function hataGoster(mesaj) {
    $('hata').innerHTML = mesaj ? `${ikon('uyari')}<span>${esc(mesaj)}</span>` : '';
    $('hata').classList.toggle('gizli', !mesaj);
  }

  let sozlesmeZamani = null;
  let sozlesmeSirasi = 0;
  async function sozlesmeyiYenile() {
    const sira = ++sozlesmeSirasi;
    try {
      const { html } = await api('/api/sozlesme/onizleme', { method: 'POST', govde: { sepet: sepetOku(), musteri: formuOku() } });
      if (sira === sozlesmeSirasi) $('sozlesme').innerHTML = html; // sunucuda kaçışlanmış güvenli HTML
    } catch (hata) {
      if (sira === sozlesmeSirasi) $('sozlesme').textContent = hata.message;
    }
  }
  function sozlesmeyiBirazSonraYenile() {
    clearTimeout(sozlesmeZamani);
    sozlesmeZamani = setTimeout(sozlesmeyiYenile, 700);
  }

  async function baslat() {
    const sepet = sepetOku();
    $('yukleniyor').classList.add('gizli');
    if (sepet.length === 0) { $('bos').classList.remove('gizli'); return; }

    const [fiyat, iller] = await Promise.all([
      api('/api/sepet/fiyatla', { method: 'POST', govde: { sepet } }),
      api('/api/iller')
    ]);
    if (fiyat.kalemler.length === 0) { $('bos').classList.remove('gizli'); return; }

    $('il').insertAdjacentHTML('beforeend', iller.map(il => `<option>${esc(il)}</option>`).join(''));
    $('ozet').innerHTML = fiyat.kalemler.map(k => `
      <div class="ozet-satir"><span>${esc(k.urunAdi)} <span class="soluk">(${esc(k.secenekAdi)}) × ${k.adet}</span></span><span class="noktalar"></span><span>${tl(k.satirKurus)}</span></div>`).join('');
    $('toplam').textContent = tl(fiyat.toplamKurus);
    $('form').classList.remove('gizli');
    formuGeriYukle();

    // Üye girişi yapılmışsa boş alanları hesaptaki bilgilerle doldur
    const ben = await benAl();
    if (ben.girisli && ben.kullanici.rol === 'musteri') {
      uye = ben.kullanici;
      $('uyeKutu').innerHTML = `${ikon('tik-daire')}<span><strong>${esc(uye.ad)} ${esc(uye.soyad)}</strong> olarak giriş yaptınız. Siparişiniz <a href="/hesabim.html">hesabınızda</a> görünecek.</span>`;
      $('kaydetSatiri').classList.remove('gizli');
      const telefon = String(uye.telefon || '').replace(/^\+90/, '0');
      const kaynak = { ad: uye.ad, soyad: uye.soyad, email: uye.email, telefon, il: uye.il, ilce: uye.ilce, adres: uye.adres, postaKodu: uye.postaKodu };
      for (const [a, v] of Object.entries(kaynak)) if (v && !$(a).value) $(a).value = v;
    }

    if (fiyat.sorunlar.length) {
      hataGoster(`${fiyat.sorunlar[0].mesaj} Lütfen sepetinizi güncelleyin.`);
      $('odeBtn').disabled = true;
    }
    sozlesmeyiYenile();
  }

  $('form').addEventListener('input', () => { formuSakla(); sozlesmeyiBirazSonraYenile(); });
  $('form').addEventListener('change', () => { formuSakla(); sozlesmeyiBirazSonraYenile(); });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hataGoster('');
    const musteri = formuOku();
    const eksik = ['ad', 'soyad', 'telefon', 'email', 'il', 'ilce', 'adres'].find(a => !musteri[a]);
    if (eksik) {
      hataGoster('Lütfen bilgilerini eksiksiz doldur.');
      $(eksik).focus();
      return;
    }
    if (!$('onay').checked) {
      hataGoster('Devam etmek için sözleşmeleri onaylamanız gerekir.');
      return;
    }

    const btn = $('odeBtn');
    btn.disabled = true;
    btn.classList.add('yukleniyor');
    btn.textContent = 'Sipariş oluşturuluyor';
    try {
      const cevap = await api('/api/odeme/baslat', {
        method: 'POST',
        govde: { sepet: sepetOku(), musteri, sozlesmeOnay: true, adresiKaydet: Boolean(uye) && $('adresiKaydet').checked }
      });
      if (cevap.yonlendir) {
        // Havale: sipariş oluştu, sepet boşaltılır ve IBAN bilgilerinin olduğu sipariş sayfası açılır
        sepetiBosalt();
        try { sessionStorage.removeItem(FORM_ANAHTARI); } catch { /* yok */ }
      }
      location.href = cevap.yonlendir || cevap.odemeUrl;
    } catch (hata) {
      hataGoster(hata.message);
      btn.disabled = false;
      btn.classList.remove('yukleniyor');
      btn.textContent = 'Güvenli ödemeye geç';
    }
  });

  baslat().catch((hata) => {
    $('yukleniyor').className = 'hata-kutu';
    $('yukleniyor').innerHTML = `${ikon('uyari')}<span>${esc(hata.message)}</span>`;
  });
})();
