'use strict';
(() => {
  const { esc, tl, api, benAl, ikon } = Site;
  const $ = id => document.getElementById(id);
  const ALANLAR = ['ad', 'soyad', 'telefon', 'il', 'ilce', 'adres', 'postaKodu'];
  const tarih = t => new Date(t).toLocaleDateString('tr-TR', { dateStyle: 'long' });

  function telefonGoster(t) {
    const r = String(t || '').replace(/^\+90/, '');
    return r.length === 10 ? `0${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6, 8)} ${r.slice(8)}` : (t || '');
  }

  function bilgileriDoldur(k) {
    $('merhaba').innerHTML = `Merhaba <em>${esc(k.ad)}</em>`;
    $('email').value = k.email || '';
    for (const a of ALANLAR) $(a).value = a === 'telefon' ? telefonGoster(k.telefon) : (k[a] || '');
  }

  const durumRengi = d => (['iptal', 'odeme-basarisiz', 'terk-edildi', 'baslatilamadi'].includes(d) ? 'kirmizi'
    : (['odeme-bekliyor', 'inceleme'].includes(d) ? 'sari' : (d === 'iade-edildi' ? 'gri' : '')));
  const tamam = metin => `<span class="tamam">${ikon('tik-daire')} ${esc(metin)}</span>`;

  async function siparisleriYukle() {
    const liste = await api('/api/hesap/siparislerim');
    $('siparisler').innerHTML = liste.length ? liste.map(s => `
      <a class="siparis-satir" href="/siparis.html?no=${encodeURIComponent(s.siparisNo)}&k=${encodeURIComponent(s.k)}">
        <div>
          <strong>#${esc(s.siparisNo)}</strong> <span class="soluk kucuk">· ${esc(tarih(s.tarih))}</span>
          <div class="kucuk soluk">${s.kalemler.map(k => `${esc(k.urun)} (${esc(k.secenek)}) × ${esc(k.adet)}`).join(', ')}</div>
        </div>
        <div class="sag">
          <span>${tl(s.toplamKurus)}</span>
          <span class="durum-etiket ${durumRengi(s.durum)}">${esc(s.durumAdi)}</span>
        </div>
      </a>`).join('') : `<div class="bos-durum">${Ikon.cizim('dambil')}<h3>Henüz siparişiniz yok</h3><p>İlk paketini seçip hemen başlayabilirsin.</p><a class="btn" href="/paketler.html">Paketlere göz at</a></div>`;
  }

  async function baslat() {
    const ben = await benAl();
    if (!ben.girisli) { location.replace('/giris.html?r=' + encodeURIComponent('/hesabim.html')); return; }
    if (ben.kullanici.rol === 'admin') { location.replace('/admin.html'); return; }
    const iller = await api('/api/iller');
    $('il').insertAdjacentHTML('beforeend', iller.map(il => `<option>${esc(il)}</option>`).join(''));
    bilgileriDoldur(ben.kullanici);
    siparisleriYukle().catch(e => { $('siparisler').innerHTML = `<p class="hata">${esc(e.message)}</p>`; });
  }

  $('bilgiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mesaj = $('bilgiMesaj');
    mesaj.textContent = '';
    try {
      const r = await api('/api/hesap/bilgiler', { method: 'PATCH', govde: Object.fromEntries(ALANLAR.map(a => [a, $(a).value])) });
      bilgileriDoldur(r.kullanici);
      mesaj.innerHTML = tamam('Kaydedildi');
    } catch (err) {
      mesaj.textContent = err.message;
    }
  });

  $('sifreForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mesaj = $('sifreMesaj');
    mesaj.textContent = '';
    try {
      await api('/api/hesap/sifre-degistir', { method: 'POST', govde: { mevcutSifre: $('mevcutSifre').value, yeniSifre: $('yeniSifre').value } });
      e.target.reset();
      mesaj.innerHTML = tamam('Şifreniz değişti. Diğer cihazlardaki oturumlarınız kapatıldı.');
    } catch (err) {
      mesaj.textContent = err.message;
    }
  });

  $('silForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('Hesabınız kalıcı olarak silinecek. Emin misiniz?')) return;
    try {
      await api('/api/hesap', { method: 'DELETE', govde: { sifre: $('silSifre').value } });
      location.href = '/';
    } catch (err) {
      $('silMesaj').textContent = err.message;
    }
  });

  $('cikis').addEventListener('click', async () => {
    await api('/api/hesap/cikis', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  baslat().catch(e => { $('siparisler').innerHTML = `<p class="hata">${esc(e.message)}</p>`; });
})();
