'use strict';
(() => {
  const { esc, tl, api, parametre, ikon, hazirla } = Site;
  const $ = id => document.getElementById(id);
  const ADIMLAR = [
    ['odendi', 'Sipariş alındı', 'liste'],
    ['hazirlaniyor', 'Hazırlanıyor', 'paket'],
    ['kargoda', 'Kargoda', 'kargo'],
    ['teslim-edildi', 'Teslim edildi', 'agac']
  ];
  const SIRA = { 'inceleme': 0, 'odendi': 0, 'hazirlaniyor': 1, 'kargoda': 2, 'teslim-edildi': 3 };
  const tarih = t => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '');
  const kutu = (tur, ik, metin) => `<div class="${tur}">${ikon(ik)}<span>${metin}</span></div>`;

  function siparisiGoster(s, no, k) {
    const sira = SIRA[s.durum];
    const adimlar = sira === undefined ? '' : `
      <div class="takip-adimlar" id="takipAdimlar">
        ${ADIMLAR.map(([, ad, ik], i) => `
          <div class="takip-adim ${i < sira || (i === sira && sira === 3) ? 'tamam' : ''} ${i === sira && sira < 3 ? 'simdi' : ''}">
            <span class="takip-adim__ikon">${ikon(i < sira ? 'tik' : ik)}</span>${ad}
          </div>`).join('')}
      </div>`;
    const bilgi = {
      'odeme-bekliyor': kutu('uyari-kutu', 'saat', 'Ödemeniz kontrol ediliyor. Kartınızdan para çekildiyse siparişiniz birkaç dakika içinde onaylanır.'),
      'inceleme': kutu('uyari-kutu', 'saat', 'Ödemeniz kısa bir güvenlik kontrolünden geçiyor. Onaylanınca siparişiniz hazırlanacak.'),
      'odeme-basarisiz': kutu('hata-kutu', 'uyari', 'Bu siparişin ödemesi tamamlanmadı. Kartınızdan para çekilmedi.'),
      'terk-edildi': kutu('hata-kutu', 'uyari', 'Bu siparişin ödemesi tamamlanmadı. Kartınızdan para çekilmedi.'),
      'baslatilamadi': kutu('hata-kutu', 'uyari', 'Bu siparişin ödemesi başlatılamadı. Kartınızdan para çekilmedi.'),
      'iptal': kutu('hata-kutu', 'iade', 'Bu sipariş iptal edildi. Ödemeniz kartınıza iade edilir; yansıması bankanıza göre birkaç gün sürebilir.'),
      'iade-edildi': kutu('basari-kutu', 'iade', 'Bu siparişin iadesi tamamlandı.')
    }[s.durum] || '';

    $('siparis').innerHTML = `
      <div class="siparis-baslik">
        <h2>Sipariş <em>#${esc(s.siparisNo)}</em></h2>
        <span class="durum-etiket ${['iptal', 'odeme-basarisiz', 'terk-edildi', 'baslatilamadi'].includes(s.durum) ? 'kirmizi' : (['odeme-bekliyor', 'inceleme'].includes(s.durum) ? 'sari' : '')}">${esc(s.durumAdi)}</span>
      </div>
      <p class="soluk kucuk">${esc(tarih(s.tarih))}</p>
      ${adimlar}
      ${bilgi}
      ${s.kargoTakipNo ? `
        <div class="basari-kutu">${ikon('kargo')}<span>
          ${esc(s.kargoFirmasi)} takip numaranız: <strong>${esc(s.kargoTakipNo)}</strong><br>
          <a href="${esc(s.kargoTakipUrl)}" target="_blank" rel="noopener noreferrer">Kargonuzu takip edin →</a></span>
        </div>` : ''}
      <div class="ozet-kart">
        ${s.kalemler.map(x => `<div class="ozet-satir"><span>${esc(x.urunAdi)} <span class="soluk">(${esc(x.secenekAdi)}) × ${x.adet}</span></span><span class="noktalar"></span><span>${tl(x.birimFiyatKurus * x.adet)}</span></div>`).join('')}
        <div class="ozet-satir"><span>Kargo</span><span class="noktalar"></span><span class="ucretsiz">Ücretsiz</span></div>
        <div class="ozet-satir toplam"><span>Toplam</span><span class="noktalar"></span><span>${tl(s.toplamKurus)}</span></div>
      </div>
      <div class="bilgi-satirlari">
        <div><small>Teslimat</small>${esc(s.alici.adSoyad)}<br><span class="soluk">${esc(s.alici.ilce)} / ${esc(s.alici.il)}</span></div>
        <div><small>Kargo</small>${esc(s.kargoFirmasi || 'Aras Kargo')}<br><span class="soluk">Ücretsiz gönderim</span></div>
        ${s.sozlesmeVar ? `<div><small>Belgeler</small><a href="/siparis/${encodeURIComponent(no)}/sozlesme?k=${encodeURIComponent(k)}" target="_blank" rel="noopener">Sözleşmelerimi görüntüle</a></div>` : ''}
      </div>`;
    $('siparis').classList.remove('gizli');
    $('basAciklama').textContent = 'Siparişinizin son durumu aşağıda. Kargoya verildiğinde takip numaranız burada ve e-postanızda görünür.';
    hazirla($('siparis'));
    // İlerleme çizgisi yavaşça dolsun
    const cizgi = $('takipAdimlar');
    if (cizgi) requestAnimationFrame(() => setTimeout(() => cizgi.style.setProperty('--ilerleme', String(sira / 3)), 120));
  }

  const no = parametre('no');
  const k = parametre('k');
  if (no && k) {
    $('siparis').innerHTML = '<p class="yukleniyor-yazi">Sipariş yükleniyor</p>';
    $('siparis').classList.remove('gizli');
    api(`/api/siparis/${encodeURIComponent(no)}?k=${encodeURIComponent(k)}`)
      .then(s => siparisiGoster(s, no, k))
      .catch((hata) => {
        $('siparis').innerHTML = kutu('hata-kutu', 'uyari', esc(hata.message));
        $('sorguForm').classList.remove('gizli');
      });
  } else {
    $('sorguForm').classList.remove('gizli');
  }

  $('sorguForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hata = $('sorguHata');
    hata.classList.add('gizli');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const sonuc = await api('/api/siparis/sorgula', {
        method: 'POST',
        govde: { siparisNo: $('siparisNo').value.trim(), email: $('email').value.trim() }
      });
      location.href = `/siparis.html?no=${encodeURIComponent(sonuc.no)}&k=${encodeURIComponent(sonuc.k)}`;
    } catch (err) {
      hata.innerHTML = `${ikon('uyari')}<span>${esc(err.message)}</span>`;
      hata.classList.remove('gizli');
      btn.disabled = false;
    }
  });
})();
