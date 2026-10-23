'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = deger => String(deger ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const tl = kurus => (Number(kurus) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  const tlYaz = kurus => (kurus % 100 === 0 ? String(kurus / 100) : (kurus / 100).toFixed(2).replace('.', ','));
  const tarih = t => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const ikon = ad => Ikon.svg(ad);
  const tamam = metin => `<span class="tamam">${ikon('tik-daire')} ${esc(metin)}</span>`;

  // Paket sayfasındaki "Paket içeriği" alanları: [anahtar, ikon, başlık, örnek]
  const BAKIM = [
    ['sure', 'takvim', 'Süre', '4 hafta'], ['program', 'dambil', 'Antrenman programı', 'Haftalık, kişiye özel'],
    ['beslenme', 'elma', 'Beslenme planı', 'Hedefe göre hazırlanır'], ['takip', 'grafik', 'Takip', 'Haftalık kontrol'],
    ['iletisim', 'whatsapp', 'İletişim', 'WhatsApp üzerinden'], ['guncelleme', 'yenile', 'Program güncelleme', 'Her 2 haftada bir'],
    ['seviye', 'yildiz', 'Seviye', 'Başlangıç ve orta'], ['yer', 'konum', 'Nerede uygulanır', 'Salonda veya evde'],
    ['baslangic', 'yildirim', 'Başlangıç', 'Ödemeden sonra 24 saat içinde']
  ];
  const BASLIKLAR = { siparisler: 'Öğrenciler ve siparişler', urunler: 'Paketler', uyeler: 'Üyeler', hesap: 'Hesabım' };

  let DURUM_ADLARI = {};
  let GECISLER = {};
  let IADE_EDILEBILIR = [];
  const ODENMEMIS = ['odeme-bekliyor', 'baslatilamadi', 'odeme-basarisiz', 'terk-edildi'];
  const OLAY_ADLARI = {
    'siparis-olusturuldu': 'Sipariş oluşturuldu',
    'odeme-sayfasi-acildi': 'Ödeme sayfası açıldı',
    'odeme-baslatilamadi': 'Ödeme sayfası açılamadı',
    'odeme-alindi': 'Ödeme alındı',
    'odeme-incelemede': 'Ödeme incelemeye alındı',
    'odeme-basarisiz': 'Ödeme başarısız',
    'odeme-sonucu-belirsiz': 'Ödeme sonucu alınamadı',
    'terk-edildi': 'Ödeme yarım kaldı',
    'stok-yetersiz': 'Kontenjan yetersizdi',
    'stok-geri-eklendi': 'Kontenjan geri eklendi',
    'durum-degisti': 'Durum değişti',
    'kargo-takip-no': 'Kargo takip no girildi',
    'admin-notu': 'Not güncellendi',
    'eposta-gonderilemedi': 'E-posta gönderilemedi',
    'iade-yapildi': 'Para iade edildi',
    'iade-basarisiz': 'İade yapılamadı'
  };
  const KAYNAK_ADLARI = {
    callback: 'müşteri siteye döndü', bildirim: 'iyzico bildirimi', kontrol: 'otomatik kontrol',
    panel: 'panelden kontrol', sayfa: 'sipariş sayfası'
  };

  // ---------- Ortak ----------

  // Giriş yapılmamışsa ortak giriş sayfasına git, girişten sonra panele geri dönülür
  function ekran(hangisi) {
    if (hangisi === 'giris') {
      location.replace('/giris.html?r=' + encodeURIComponent('/admin.html'));
      return;
    }
    $('panel').classList.toggle('gizli', hangisi !== 'panel');
  }

  async function api(url, { method = 'GET', govde, ham, tur } = {}) {
    const ayar = { method, headers: { 'X-Istek': 'panel' }, credentials: 'same-origin' };
    if (ham) {
      ayar.body = ham;
      ayar.headers['Content-Type'] = tur;
    } else if (govde !== undefined) {
      ayar.body = JSON.stringify(govde);
      ayar.headers['Content-Type'] = 'application/json';
    }
    let cevap;
    try {
      cevap = await fetch(url, ayar);
    } catch {
      throw new Error('Sunucuya ulaşılamadı.');
    }
    if (cevap.status === 401 || cevap.status === 403) {
      if (url === '/api/admin/ben' || cevap.status === 401) {
        ekran('giris');
        throw new Error('Oturum kapandı, tekrar giriş yapın.');
      }
    }
    let veri = null;
    try { veri = await cevap.json(); } catch { /* boş cevap */ }
    if (!cevap.ok) throw new Error((veri && veri.hata) || 'Bir hata oluştu.');
    return veri;
  }

  async function panelAc() {
    const ben = await api('/api/admin/ben');
    DURUM_ADLARI = ben.durumAdlari;
    $('kullaniciAdiGoster').textContent = ben.kullaniciAdi || '';
    $('avatar').textContent = (ben.kullaniciAdi || 'A').charAt(0).toLocaleUpperCase('tr-TR');
    $('panelTarih').textContent = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('hKullaniciAdi').value = ben.kullaniciAdi || '';
    GECISLER = ben.gecisler;
    IADE_EDILEBILIR = ben.iadeEdilebilir || [];
    $('uyarilar').innerHTML = ben.uyarilar.map(u => `<div class="uyari ${esc(u.tur)}">${ikon(u.tur === 'hata' ? 'uyari' : 'bilgi')}<span>${esc(u.mesaj)}</span></div>`).join('');
    ekran('panel');
    await filtreleriDoldur();
    siparisleriYukle();
  }

  document.querySelector('.sekmeler').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sekme]');
    if (!btn) return;
    document.querySelectorAll('.sekme').forEach(s => s.classList.toggle('secili', s === btn));
    const sekme = btn.dataset.sekme;
    $('panelBaslik').textContent = BASLIKLAR[sekme];
    $('siparislerSekmesi').classList.toggle('gizli', sekme !== 'siparisler');
    $('urunlerSekmesi').classList.toggle('gizli', sekme !== 'urunler');
    $('uyelerSekmesi').classList.toggle('gizli', sekme !== 'uyeler');
    $('hesapSekmesi').classList.toggle('gizli', sekme !== 'hesap');
    $('urunDuzenle').classList.add('gizli');
    if (sekme === 'urunler') urunleriYukle();
    else if (sekme === 'uyeler') uyeleriYukle();
    else if (sekme === 'siparisler') siparisleriYukle();
  });

  // ---------- Çıkış ve yönetici hesabı ----------

  $('cikis').addEventListener('click', async () => {
    await api('/api/hesap/cikis', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  $('hesapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mesaj = $('hesapMesaj');
    mesaj.textContent = '';
    const yeniSifre = $('hYeniSifre').value;
    if (yeniSifre && yeniSifre !== $('hYeniSifre2').value) { mesaj.textContent = 'Yeni şifreler aynı değil.'; return; }
    try {
      const r = await api('/api/admin/hesabim', {
        method: 'PATCH',
        govde: { mevcutSifre: $('hMevcutSifre').value, kullaniciAdi: $('hKullaniciAdi').value.trim(), yeniSifre: yeniSifre || undefined }
      });
      e.target.reset();
      $('hKullaniciAdi').value = r.kullaniciAdi;
      $('kullaniciAdiGoster').textContent = r.kullaniciAdi;
      mesaj.innerHTML = tamam('Kaydedildi. Diğer cihazlardaki oturumlar kapatıldı.');
    } catch (hata) {
      mesaj.textContent = hata.message;
    }
  });

  // ---------- Üyeler ----------

  async function uyeleriYukle() {
    const kutu = $('uyeListesi');
    kutu.innerHTML = '<p class="yukleniyor-yazi">Yükleniyor</p>';
    try {
      const uyeler = await api('/api/admin/uyeler');
      kutu.innerHTML = uyeler.length ? `
        <div class="kart"><p class="kucuk soluk">${uyeler.length} üye. Üye olmadan sipariş verenler bu listede yoktur.</p>
        <div class="tablo-kaydir"><table class="veri-tablo">
          <tr><th>Ad Soyad</th><th>İletişim</th><th>Kayıt</th><th class="sag">Sipariş</th></tr>
          ${uyeler.map(u => `
            <tr><td>${esc(u.ad)} ${esc(u.soyad)}<div class="kucuk">${esc(u.il || '')}</div></td>
              <td>${esc(u.email)}<div class="kucuk">${esc(u.telefon || '')}</div></td>
              <td class="kucuk">${esc(tarih(u.olusturma))}</td>
              <td class="sag">${esc(u.siparis_sayisi)}<div class="kucuk">${tl(u.toplam_kurus)}</div></td></tr>`).join('')}
        </table></div></div>` : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Henüz üye yok</h3><p>Müşteriler üye olduğunda burada listelenir.</p></div>`;
    } catch (hata) {
      kutu.innerHTML = `<p class="hata">${esc(hata.message)}</p>`;
    }
  }

  // ---------- Siparişler ----------

  const FILTRELER = [
    ['', 'Aktif öğrenciler'], ['odendi', 'Yeni öğrenciler'], ['inceleme', 'İncelemede'], ['hazirlaniyor', 'Program hazırlanıyor'],
    ['kargoda', 'Koçluk sürüyor'], ['teslim-edildi', 'Tamamlandı'], ['iptal', 'İptal'], ['iade-edildi', 'İade edildi'],
    ['odeme-bekliyor', 'Ödeme bekleyen'], ['terk-edildi', 'Yarım kalan ödemeler'], ['odeme-basarisiz', 'Başarısız ödemeler'],
    ['tum', 'Tüm siparişler']
  ];

  async function filtreleriDoldur() {
    const secili = $('filtre').value;
    let sayilar = {};
    try { sayilar = await api('/api/admin/ozet'); } catch { /* sayılar olmadan da çalışır */ }
    const aktif = ['odendi', 'inceleme', 'hazirlaniyor', 'kargoda'].reduce((t, d) => t + (sayilar[d] || 0), 0);
    $('filtre').innerHTML = FILTRELER.map(([deger, ad]) => {
      const adet = deger === '' ? aktif : (deger === 'tum' ? null : sayilar[deger] || 0);
      return `<option value="${deger}">${esc(ad)}${adet !== null ? ` (${adet})` : ''}</option>`;
    }).join('');
    $('filtre').value = secili;

    const KARTLAR = [['odendi', 'Yeni öğrenci', 'yildiz'], ['inceleme', 'İncelemede', 'uyari'], ['hazirlaniyor', 'Program hazırlanıyor', 'not'], ['kargoda', 'Koçluk sürüyor', 'dambil']];
    $('ozetKartlari').innerHTML = KARTLAR.map(([d, ad, ik]) => `
      <button type="button" class="ozet-karti ${d} ${secili === d ? 'secili' : ''} ${(sayilar[d] || 0) > 0 ? 'dolu' : ''}" data-filtre="${d}">
        <span class="ozet-karti__ikon">${ikon(ik)}</span>
        <strong>${sayilar[d] || 0}</strong><span>${ad}</span>
      </button>`).join('');
    const yeni = (sayilar.odendi || 0) + (sayilar.inceleme || 0);
    $('yeniSayi').textContent = yeni;
    $('yeniSayi').classList.toggle('gizli', yeni === 0);
  }

  $('ozetKartlari').addEventListener('click', (e) => {
    const k = e.target.closest('[data-filtre]');
    if (!k) return;
    $('filtre').value = $('filtre').value === k.dataset.filtre ? '' : k.dataset.filtre;
    document.querySelectorAll('.ozet-karti').forEach(x => x.classList.toggle('secili', x.dataset.filtre === $('filtre').value));
    siparisleriYukle();
  });

  function siparisKarti(s) {
    // İptal/iade menüde yok: parası alınmış sipariş "İptal et ve parayı iade et" butonuyla iptal edilir
    const sonrakiler = (GECISLER[s.durum] || []).filter(d => d !== 'iptal' && d !== 'iade-edildi');
    const iadeEdilebilir = IADE_EDILEBILIR.includes(s.durum);
    const odenmemis = ODENMEMIS.includes(s.durum);
    return `
      <div class="kart siparis-kart" data-id="${esc(s.id)}">
        <div class="siparis-kart__ust">
          <div><strong class="siparis-no-yazi">#${esc(s.siparis_no)}</strong> <span class="kucuk soluk">${esc(tarih(s.olusturma))}</span></div>
          <span class="rozet ${esc(s.durum)}">${esc(DURUM_ADLARI[s.durum] || s.durum)}</span>
        </div>
        <div class="musteri">
          <strong>${esc(s.musteri_ad)} ${esc(s.musteri_soyad)}</strong>
          <span>${ikon('telefon')}<a href="tel:${esc(s.telefon)}">${esc(s.telefon)}</a></span>
          <span>${ikon('eposta')}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a></span>
          <span>${ikon('konum')}${esc(s.adres)}, ${esc(s.ilce)} / ${esc(s.sehir)} ${esc(s.posta_kodu)}</span>
        </div>
        ${s.musteri_notu ? `<p class="uyari bilgi">${ikon('mesaj')}<span><strong>Hedefi:</strong> ${esc(s.musteri_notu)}</span></p>` : ''}
        ${s.stok_uyarisi ? `<p class="uyari hata">${ikon('uyari')}<span>Bu pakette kontenjan doluydu. Öğrenciyi arayın veya iptal edin.</span></p>` : ''}
        ${s.durum === 'inceleme' ? `<p class="uyari hata">${ikon('uyari')}<span>Ödeme incelemede. Ayrıntılara bakın ve koçluğa başlamadan önce iyzico panelinden kontrol edin.</span></p>` : ''}
        <table class="kalem-tablo">
          ${s.kalemler.map(k => `
            <tr><td>${esc(k.urun)} (${esc(k.secenek)})</td><td>${k.adet > 1 ? `${esc(k.adet)} adet` : ''}</td>
            <td class="sag">${tl(k.birimFiyatKurus * k.adet)}</td></tr>`).join('')}
          <tr><td colspan="2"><strong>Toplam</strong>${s.taksit > 1 ? ` <span class="kucuk">(${esc(s.taksit)} taksit)</span>` : ''}</td>
            <td class="sag"><strong>${tl(s.toplam_kurus)}</strong></td></tr>
        </table>
        ${s.admin_notu ? `<div class="bilgi-cip">${ikon('not')} ${esc(s.admin_notu)}</div>` : ''}
        <div class="islem">
          ${sonrakiler.length ? `
            <select class="yeniDurum" aria-label="Yeni durum">
              <option value="">— Durumu değiştirme —</option>
              ${sonrakiler.map(d => `<option value="${esc(d)}">${esc(DURUM_ADLARI[d])}</option>`).join('')}
            </select>` : ''}
          ${sonrakiler.length ? '<button class="ana kaydet">Kaydet</button>' : ''}
          ${odenmemis ? `<button class="odemeKontrol">${ikon('yenile')} Ödemeyi iyzico'dan kontrol et</button>` : ''}
          ${iadeEdilebilir ? `<button class="tehlike iadeEt">${ikon('iade')} ${s.durum === 'teslim-edildi' ? 'Parayı iade et' : 'İptal et ve parayı iade et'}</button>` : ''}
          <button class="ayrintiAc">Ayrıntılar ${ikon('asagi')}</button>
          <span class="hata mesaj"></span>
        </div>
        <div class="detay gizli"></div>
      </div>`;
  }

  async function siparisleriYukle() {
    const filtre = $('filtre').value;
    const ara = $('ara').value.trim();
    const liste = $('siparisListesi');
    liste.innerHTML = '<p class="yukleniyor-yazi">Yükleniyor</p>';
    try {
      const q = new URLSearchParams();
      if (filtre) q.set('durum', filtre);
      if (ara) q.set('ara', ara);
      const siparisler = await api(`/api/admin/siparisler?${q}`);
      liste.innerHTML = siparisler.length ? siparisler.map(siparisKarti).join('')
        : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Burada sipariş yok</h3><p>${ara ? 'Aramanıza uyan sipariş bulunamadı.' : 'Bu durumda bekleyen sipariş yok.'}</p></div>`;
    } catch (hata) {
      liste.innerHTML = `<p class="hata">${esc(hata.message)}</p>`;
    }
  }

  async function ayrintiGoster(kart) {
    const kutu = kart.querySelector('.detay');
    if (!kutu.classList.contains('gizli')) { kutu.classList.add('gizli'); kart.classList.remove('acik'); return; }
    kutu.classList.remove('gizli');
    kart.classList.add('acik');
    kutu.innerHTML = '<p class="yukleniyor-yazi">Yükleniyor</p>';
    try {
      const s = await api(`/api/admin/siparisler/${kart.dataset.id}`);
      const d = s.odeme_detay || {};
      kutu.innerHTML = `
        ${s.odeme_id ? `
          <p><strong>Ödeme:</strong> iyzico ödeme no <strong>${esc(s.odeme_id)}</strong> ·
          ${esc(d.cardAssociation || '')} ${d.lastFourDigits ? `**** ${esc(d.lastFourDigits)}` : ''} ·
          ${esc(s.taksit || 1)} taksit · tahsil edilen ${tl(s.odenen_kurus || s.toplam_kurus)} · ${esc(tarih(s.odeme_tarihi))}</p>
          ${s.iade_kurus ? `<p class="uyari bilgi">${ikon('iade')} İade edilen: <strong>${tl(s.iade_kurus)}</strong>
            ${(s.iade_detay || []).filter(x => x.tur === 'iptal').length ? '(ödeme tamamen iptal edildi, müşterinin ekstresine yansımaz)' : '(kartına iade edildi, yansıması bankaya göre birkaç gün sürebilir)'}</p>` : ''}
          ${IADE_EDILEBILIR.includes(s.durum) ? `<p class="kucuk">Parayı iyzico panelinden kendiniz iade ettiyseniz:
            <button class="elleIptal">Sadece iptal olarak işaretle</button></p>` : ''}` : ''}
        ${s.sozlesme_var ? `<p><a href="/api/admin/siparisler/${esc(s.id)}/sozlesme" target="_blank" rel="noopener">Müşterinin onayladığı sözleşmeyi aç</a>
          <span class="kucuk">(onay: ${esc(tarih(s.sozlesme_onay_tarihi))}, IP: ${esc(s.ip || '-')})</span></p>` : ''}
        <h4>Geçmiş</h4>
        <ul class="olaylar">
          ${s.olaylar.map(o => {
            const det = o.detay || {};
            const ek = [
              det.kaynak ? KAYNAK_ADLARI[det.kaynak] || det.kaynak : '',
              det.eski && det.yeni && o.olay === 'durum-degisti' ? `${DURUM_ADLARI[det.eski] || det.eski} → ${DURUM_ADLARI[det.yeni] || det.yeni}` : '',
              o.olay === 'kargo-takip-no' ? det.yeni : '',
              det.neden || '', det.hata || '',
              Array.isArray(det.urunler) ? det.urunler.map(u => `${u.urun}: istenen ${u.istenen}, stok ${u.stok}`).join('; ') : ''
            ].filter(Boolean).join(' · ');
            return `<li>${esc(tarih(o.olusturma))} — ${esc(OLAY_ADLARI[o.olay] || o.olay)}${ek ? ` <span class="kucuk">(${esc(ek)})</span>` : ''}</li>`;
          }).join('')}
        </ul>
        <h4>E-postalar</h4>
        ${s.epostalar.length ? `<ul class="olaylar">${s.epostalar.map(e => `
          <li>${esc(e.konu)} → ${esc(e.alici)}:
            ${e.gonderim ? `<span class="tamam">gönderildi ${esc(tarih(e.gonderim))}</span>`
              : (e.deneme === 0 ? 'sırada' : `<span class="hata">gönderilemedi (${esc(e.deneme)} deneme) ${esc(e.son_hata || '')}</span>`)}
            ${e.gonderim && e.son_hata ? `<span class="kucuk">(${esc(e.son_hata)})</span>` : ''}</li>`).join('')}</ul>`
          : '<p class="kucuk">E-posta yok.</p>'}
        <h4>Not (sadece siz görürsünüz)</h4>
        <textarea class="notAlani" rows="2" maxlength="1000">${esc(s.admin_notu)}</textarea>
        <p><button class="notKaydet">Notu kaydet</button> <span class="kucuk notMesaj"></span></p>`;
    } catch (hata) {
      kutu.innerHTML = `<p class="hata">${esc(hata.message)}</p>`;
    }
  }

  $('siparisListesi').addEventListener('click', async (e) => {
    const kart = e.target.closest('[data-id]');
    if (!kart) return;
    const mesaj = kart.querySelector('.mesaj');
    const id = kart.dataset.id;

    const hedef = e.target.closest('button') || e.target;
    if (hedef.classList.contains('ayrintiAc')) return ayrintiGoster(kart);

    if (hedef.classList.contains('notKaydet')) {
      const not = kart.querySelector('.notAlani').value;
      try {
        await api(`/api/admin/siparisler/${id}`, { method: 'PATCH', govde: { adminNotu: not } });
        kart.querySelector('.notMesaj').innerHTML = tamam('Kaydedildi');
      } catch (hata) {
        kart.querySelector('.notMesaj').textContent = hata.message;
      }
      return;
    }

    if (hedef.classList.contains('odemeKontrol')) {
      hedef.disabled = true;
      mesaj.textContent = '';
      try {
        const sonuc = await api(`/api/admin/siparisler/${id}/kontrol`, { method: 'POST' });
        mesaj.textContent = `Sonuç: ${DURUM_ADLARI[sonuc.durum] || sonuc.karar}`;
        setTimeout(() => { filtreleriDoldur(); siparisleriYukle(); }, 1200);
      } catch (hata) {
        mesaj.textContent = hata.message;
        hedef.disabled = false;
      }
      return;
    }

    if (hedef.classList.contains('iadeEt')) {
      if (!confirm('Müşterinin ödediği para iyzico üzerinden KARTINA İADE EDİLECEK ve sipariş iptal edilecek.\nMüşteriye e-posta gider. Bu işlem geri alınamaz.\n\nDevam edilsin mi?')) return;
      hedef.disabled = true;
      hedef.innerHTML = 'İade ediliyor...';
      mesaj.textContent = '';
      try {
        await api(`/api/admin/siparisler/${id}/iade`, { method: 'POST' });
        filtreleriDoldur();
        siparisleriYukle();
      } catch (hata) {
        mesaj.textContent = hata.message;
        hedef.disabled = false;
        hedef.innerHTML = 'Tekrar dene: parayı iade et';
      }
      return;
    }

    if (hedef.classList.contains('elleIptal')) {
      if (!confirm('Sipariş, para iyzico üzerinden İADE EDİLMEDEN iptal olarak işaretlenecek.\nBunu sadece parayı iyzico panelinden kendiniz iade ettiyseniz yapın.\n\nParayı iade ettiğinizden emin misiniz?')) return;
      try {
        const yeni = (await api(`/api/admin/siparisler/${id}`)).durum === 'teslim-edildi' ? 'iade-edildi' : 'iptal';
        await api(`/api/admin/siparisler/${id}`, { method: 'PATCH', govde: { durum: yeni, elleIade: true } });
        filtreleriDoldur();
        siparisleriYukle();
      } catch (hata) {
        alert(hata.message);
      }
      return;
    }

    if (hedef.classList.contains('kaydet')) {
      const durum = kart.querySelector('.yeniDurum')?.value || '';
      mesaj.textContent = '';
      if (!durum) { mesaj.textContent = 'Önce yeni durumu seçin.'; return; }
      if (durum === 'odendi' && !confirm('iyzico panelinden ödemeyi kontrol ettiniz ve sorun olmadığından emin misiniz?')) return;
      hedef.disabled = true;
      try {
        await api(`/api/admin/siparisler/${id}`, { method: 'PATCH', govde: { durum } });
        filtreleriDoldur();
        siparisleriYukle();
      } catch (hata) {
        mesaj.textContent = hata.message;
        hedef.disabled = false;
      }
    }
  });

  $('filtre').addEventListener('change', siparisleriYukle);
  $('yenile').addEventListener('click', () => { filtreleriDoldur(); siparisleriYukle(); });
  let araZamani = null;
  $('ara').addEventListener('input', () => { clearTimeout(araZamani); araZamani = setTimeout(siparisleriYukle, 400); });

  // ---------- Paketler (veritabanında "urunler") ----------

  let urunler = [];
  let duzenlenen = null; // düzenlenen paketin id'si (yeni paket için null)

  async function urunleriYukle() {
    const liste = $('urunListesi');
    liste.innerHTML = '<p class="yukleniyor-yazi">Yükleniyor</p>';
    try {
      urunler = await api('/api/admin/urunler');
      liste.innerHTML = urunler.length ? urunler.map(u => `
        <div class="urun-satir" data-duzenle="${u.id}">
          <span class="kucuk-cerceve">${u.gorseller.length ? `<img src="/api/gorsel/${u.gorseller[0]}" alt="">` : Ikon.cizim('dambil')}</span>
          <div class="urun-satir__metin">
            <strong>${esc(u.ad)}</strong>
            <span class="kucuk soluk">${esc(u.kategori)}${u.latinceAd ? ` · <em>${esc(u.latinceAd)}</em>` : ''} · sıra ${esc(u.sira)}</span>
            <span class="secenek-cipleri">${u.secenekler.length
              ? u.secenekler.map(s => `<span class="${s.aktif ? '' : 'kapali'} ${s.stok === 0 ? 'bitti' : ''}">${esc(s.ad)} · ${tl(s.fiyatKurus)} · kontenjan ${s.stok}</span>`).join('')
              : '<span class="bitti">Süre seçeneği yok, sitede görünmez</span>'}</span>
          </div>
          <span class="rozet ${u.aktif ? 'teslim-edildi' : ''}">${u.aktif ? 'Satışta' : 'Gizli'}</span>
          <button type="button" data-duzenle="${u.id}">${ikon('duzenle')} Düzenle</button>
        </div>`).join('') : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Henüz paket yok</h3><p>"Yeni paket" butonuyla ilk koçluk paketini ekleyin.</p></div>`;
    } catch (hata) {
      liste.innerHTML = `<p class="hata">${esc(hata.message)}</p>`;
    }
  }

  async function kategorileriDoldur() {
    try {
      const k = await api('/api/admin/kategoriler');
      $('kategoriListesi').innerHTML = k.map(x => `<option value="${esc(x)}">`).join('');
    } catch { /* önemsiz */ }
  }

  function duzenleyiciAc(id) {
    duzenlenen = id;
    const u = urunler.find(x => x.id === id) || null;
    $('urunlerSekmesi').classList.add('gizli');
    $('urunDuzenle').classList.remove('gizli');
    // "Online" gibi İngilizce kelimeler büyük harfte "ONLİNE" olmasın
    $('urunBaslik').innerHTML = u ? esc(u.ad).replace(/\b(online|coaching|personal|training|fitness)\b/gi, k => `<span lang="en">${k}</span>`) : 'Yeni paket';
    $('uAd').value = u ? u.ad : '';
    $('uLatince').value = u ? (u.latinceAd || '') : '';
    for (const [anahtar] of BAKIM) $(`b-${anahtar}`).value = u && u.bakim ? (u.bakim[anahtar] || '') : '';
    $('uKategori').value = u ? u.kategori : '';
    $('uAciklama').value = u ? u.aciklama : '';
    $('uSira').value = u ? u.sira : String(urunler.length);
    $('uAktif').checked = u ? u.aktif : false;
    $('urunMesaj').textContent = u ? '' : 'Önce paketi kaydedin, sonra süre seçenekleri ve fotoğraf ekleyin.';
    $('urunEkler').classList.toggle('gizli', !u);
    $('secenekHata').textContent = '';
    $('gorselMesaj').textContent = '';
    if (u) { secenekleriCiz(u); gorselleriCiz(u); }
    kategorileriDoldur();
    window.scrollTo(0, 0);
  }

  async function duzenleneniTazele() {
    urunler = await api('/api/admin/urunler');
    const u = urunler.find(x => x.id === duzenlenen);
    if (u) {
      secenekleriCiz(u);
      gorselleriCiz(u);
      $('uAktif').checked = u.aktif;
    }
  }

  $('urunListesi').addEventListener('click', (e) => {
    const satir = e.target.closest('[data-duzenle]');
    if (satir) duzenleyiciAc(Number(satir.dataset.duzenle));
  });
  $('yeniUrun').addEventListener('click', () => duzenleyiciAc(null));
  $('urunlereDon').addEventListener('click', () => {
    $('urunDuzenle').classList.add('gizli');
    $('urunlerSekmesi').classList.remove('gizli');
    urunleriYukle();
  });

  $('urunForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const govde = {
      ad: $('uAd').value, kategori: $('uKategori').value, aciklama: $('uAciklama').value,
      latinceAd: $('uLatince').value, bakim: Object.fromEntries(BAKIM.map(([a]) => [a, $(`b-${a}`).value])),
      sira: Number($('uSira').value || 0), aktif: $('uAktif').checked
    };
    $('urunKaydet').disabled = true;
    $('urunMesaj').textContent = '';
    try {
      if (duzenlenen) {
        await api(`/api/admin/urunler/${duzenlenen}`, { method: 'PATCH', govde });
      } else {
        const { id } = await api('/api/admin/urunler', { method: 'POST', govde: { ...govde, aktif: false } });
        duzenlenen = id;
        $('urunEkler').classList.remove('gizli');
      }
      await duzenleneniTazele();
      $('urunBaslik').innerHTML = esc(govde.ad).replace(/\b(online|coaching|personal|training|fitness)\b/gi, k => `<span lang="en">${k}</span>`);
      $('urunMesaj').innerHTML = tamam('Kaydedildi');
      if (govde.aktif && !$('uAktif').checked) $('urunMesaj').innerHTML = tamam('Kaydedildi. Sitede görünmesi için en az bir süre seçeneği ekleyip tekrar kaydedin.');
    } catch (hata) {
      $('urunMesaj').textContent = hata.message;
    } finally {
      $('urunKaydet').disabled = false;
    }
  });

  $('urunSil').addEventListener('click', async () => {
    const u = urunler.find(x => x.id === duzenlenen);
    if (!u || !confirm(`"${u.ad}" kalıcı olarak silinsin mi?`)) return;
    try {
      await api(`/api/admin/urunler/${u.id}`, { method: 'DELETE' });
      $('urunlereDon').click();
    } catch (hata) {
      alert(hata.message);
    }
  });

  // Seçenekler
  function secenekleriCiz(u) {
    const satir = (s) => `
      <tr data-secenek="${s ? s.id : 'yeni'}">
        <td><input class="sAd" value="${s ? esc(s.ad) : ''}" placeholder="ör. 3 aylık" maxlength="60" aria-label="Seçenek adı"></td>
        <td><input class="sFiyat" value="${s ? tlYaz(s.fiyatKurus) : ''}" placeholder="750" inputmode="decimal" aria-label="Fiyat"></td>
        <td><input class="sStok" type="number" min="0" value="${s ? s.stok : ''}" placeholder="0" aria-label="Kontenjan"></td>
        <td><input class="sAktif" type="checkbox" ${!s || s.aktif ? 'checked' : ''} aria-label="Satışta"></td>
        <td>${s
          ? `<button type="button" class="sKaydet">Kaydet</button> <button type="button" class="sSil tehlike ikon-yalniz" aria-label="Sil" title="Sil">${ikon('cop')}</button>`
          : `<button type="button" class="sEkle ana">${ikon('arti')} Ekle</button>`}</td>
      </tr>`;
    $('secenekSatirlari').innerHTML = u.secenekler.map(satir).join('') + satir(null);
  }

  $('secenekSatirlari').addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-secenek]');
    const btn = e.target.closest('button');
    if (!tr || !btn) return;
    const govde = {
      ad: tr.querySelector('.sAd').value,
      fiyat: tr.querySelector('.sFiyat').value,
      stok: Number(tr.querySelector('.sStok').value || 0),
      aktif: tr.querySelector('.sAktif').checked
    };
    $('secenekHata').textContent = '';
    try {
      if (btn.classList.contains('sEkle')) {
        await api(`/api/admin/urunler/${duzenlenen}/secenekler`, { method: 'POST', govde });
      } else if (btn.classList.contains('sKaydet')) {
        await api(`/api/admin/secenekler/${tr.dataset.secenek}`, { method: 'PATCH', govde });
      } else if (btn.classList.contains('sSil')) {
        if (!confirm('Bu seçenek silinsin mi? (Satışı durdurmak için "Satışta" kutusunu kaldırmanız yeterli.)')) return;
        await api(`/api/admin/secenekler/${tr.dataset.secenek}`, { method: 'DELETE' });
      }
      await duzenleneniTazele();
    } catch (hata) {
      $('secenekHata').textContent = hata.message;
    }
  });

  // Görseller
  function gorselleriCiz(u) {
    $('gorseller').innerHTML = u.gorseller.length ? u.gorseller.map((id, i) => `
      <div class="gorsel-kutu ${i === 0 ? 'kapak' : ''}" data-gorsel="${id}">
        <img src="/api/gorsel/${id}" alt="">
        ${i === 0 ? '<span class="kapak-etiket">Kapak</span>' : ''}
        <div class="gorsel-araclar">
          <button type="button" class="ikon-yalniz" data-tasi="-1" ${i === 0 ? 'disabled' : ''} aria-label="Sola taşı" title="Sola taşı">${ikon('sol')}</button>
          <button type="button" class="ikon-yalniz tehlike" data-gsil aria-label="Sil" title="Sil">${ikon('cop')}</button>
          <button type="button" class="ikon-yalniz" data-tasi="1" ${i === u.gorseller.length - 1 ? 'disabled' : ''} aria-label="Sağa taşı" title="Sağa taşı">${ikon('sag')}</button>
        </div>
      </div>`).join('') : '<p class="kucuk soluk">Henüz fotoğraf yok.</p>';
  }

  $('gorseller').addEventListener('click', async (e) => {
    const kutu = e.target.closest('[data-gorsel]');
    const btn = e.target.closest('button');
    if (!kutu || !btn) return;
    const u = urunler.find(x => x.id === duzenlenen);
    const id = Number(kutu.dataset.gorsel);
    try {
      if (btn.hasAttribute('data-gsil')) {
        if (!confirm('Bu fotoğraf silinsin mi?')) return;
        await api(`/api/admin/gorseller/${id}`, { method: 'DELETE' });
      } else {
        const idler = [...u.gorseller];
        const i = idler.indexOf(id);
        const j = i + Number(btn.dataset.tasi);
        if (j < 0 || j >= idler.length) return;
        [idler[i], idler[j]] = [idler[j], idler[i]];
        await api(`/api/admin/urunler/${duzenlenen}/gorsel-sirasi`, { method: 'PUT', govde: { idler } });
      }
      await duzenleneniTazele();
    } catch (hata) {
      $('gorselMesaj').textContent = hata.message;
    }
  });

  // Fotoğrafı tarayıcıda küçült (en uzun kenar 1600px). Telefon fotoğrafları 5-10 MB olabiliyor.
  function resmiYukle(dosya) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(dosya);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${dosya.name} açılamadı.`)); };
      img.src = url;
    });
  }

  async function resmiKucult(dosya, maks = 1600) {
    const img = await resmiYukle(dosya);
    const oran = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * oran);
    canvas.height = Math.round(img.naturalHeight * oran);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blobAl = tur => new Promise(r => canvas.toBlob(r, tur, 0.85));
    let blob = await blobAl('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await blobAl('image/jpeg');
    if (!blob) throw new Error(`${dosya.name} işlenemedi.`);
    return blob;
  }

  async function gorselleriYukle(dosyalar) {
    const mesaj = $('gorselMesaj');
    dosyalar = dosyalar.filter(d => /^image\/(jpeg|png|webp)$/.test(d.type));
    if (!dosyalar.length) { mesaj.textContent = 'Sadece JPEG, PNG veya WebP fotoğraf yükleyebilirsiniz.'; return; }
    for (const [i, dosya] of dosyalar.entries()) {
      mesaj.textContent = `Yükleniyor ${i + 1}/${dosyalar.length}...`;
      try {
        const blob = await resmiKucult(dosya);
        await api(`/api/admin/urunler/${duzenlenen}/gorseller`, { method: 'POST', ham: blob, tur: blob.type });
      } catch (hata) {
        mesaj.textContent = hata.message;
        await duzenleneniTazele();
        return;
      }
    }
    mesaj.innerHTML = tamam('Yüklendi');
    await duzenleneniTazele();
  }

  $('gorselSec').addEventListener('change', (e) => {
    const dosyalar = [...e.target.files];
    e.target.value = '';
    gorselleriYukle(dosyalar);
  });
  const yukleAlani = document.querySelector('.yukle-alani');
  yukleAlani.addEventListener('dragover', (e) => { e.preventDefault(); yukleAlani.classList.add('surukle'); });
  yukleAlani.addEventListener('dragleave', () => yukleAlani.classList.remove('surukle'));
  yukleAlani.addEventListener('drop', (e) => {
    e.preventDefault();
    yukleAlani.classList.remove('surukle');
    gorselleriYukle([...e.dataTransfer.files]);
  });

  // Bakım alanlarını çiz
  $('bakimAlanlari').innerHTML = BAKIM.map(([anahtar, ik, baslik, ornek]) => `
    <label class="bakim-alan" for="b-${anahtar}">
      <span class="bakim-alan__ust">${ikon(ik)}${esc(baslik)}</span>
      <input id="b-${anahtar}" maxlength="80" placeholder="ör. ${esc(ornek)}">
    </label>`).join('');

  // ---------- Açılış ----------
  panelAc().catch(() => ekran('giris'));
})();
