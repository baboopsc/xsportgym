'use strict';
(() => {
  const { api, parametre, benAl, ikon, esc } = Site;
  const $ = id => document.getElementById(id);

  // Girişten sonra gidilecek sayfa (sadece bu sitenin içindeki bir adres olabilir)
  function donusAdresi(rol) {
    const r = parametre('r');
    const guvenli = r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\') ? r : null;
    if (rol === 'admin') return guvenli === '/admin.html' || !guvenli ? '/admin.html' : guvenli;
    if (guvenli === '/admin.html') return '/hesabim.html';
    return guvenli || '/hesabim.html';
  }

  function hata(mesaj) {
    $('hata').innerHTML = mesaj ? `${ikon('uyari')}<span>${esc(mesaj)}</span>` : '';
    $('hata').classList.toggle('gizli', !mesaj);
  }
  function bilgi(mesaj) {
    $('bilgi').innerHTML = mesaj ? `${ikon('bilgi')}<span>${esc(mesaj)}</span>` : '';
    $('bilgi').classList.toggle('gizli', !mesaj);
  }

  const BASLIKLAR = {
    giris: ['Hoş geldiniz', 'Hesabınıza <em>giriş yapın</em>'],
    kayit: ['Yeni üyelik', 'Aramıza <em>hoş geldiniz</em>'],
    unuttum: ['Şifre yardımı', 'Şifrenizi mi <em>unuttunuz?</em>'],
    sifirla: ['Şifre yenileme', 'Yeni şifrenizi <em>belirleyin</em>']
  };

  function mod(ad) {
    document.querySelectorAll('[data-bolum]').forEach(f => f.classList.toggle('gizli', f.dataset.bolum !== ad));
    document.querySelectorAll('.sekme-btn').forEach(b => b.classList.toggle('secili', b.dataset.mod === ad));
    $('sekmeler').classList.toggle('gizli', !['giris', 'kayit'].includes(ad));
    $('sekmeler').classList.toggle('ikinci', ad === 'kayit');
    $('girisUst').textContent = BASLIKLAR[ad][0];
    $('girisBaslik').innerHTML = BASLIKLAR[ad][1];
    hata('');
  }

  $('sekmeler').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mod]');
    if (b) { bilgi(''); mod(b.dataset.mod); }
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-mod-git]');
    if (!a) return;
    e.preventDefault();
    bilgi('');
    mod(a.dataset.modGit);
  });

  async function gonder(form, islem) {
    hata('');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.classList.add('yukleniyor');
    try {
      await islem();
    } catch (err) {
      hata(err.message);
    } finally {
      btn.disabled = false;
      btn.classList.remove('yukleniyor');
    }
  }

  // Şifreyi göster / gizle
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sifre-goster]');
    if (!b) return;
    const giris = b.parentElement.querySelector('input');
    const goster = giris.type === 'password';
    giris.type = goster ? 'text' : 'password';
    b.setAttribute('aria-label', goster ? 'Şifreyi gizle' : 'Şifreyi göster');
    b.classList.toggle('acik', goster);
  });

  $('girisForm').addEventListener('submit', (e) => {
    e.preventDefault();
    gonder(e.target, async () => {
      const r = await api('/api/hesap/giris', { method: 'POST', govde: { kimlik: $('gKimlik').value.trim(), sifre: $('gSifre').value } });
      location.href = donusAdresi(r.rol);
    });
  });

  $('kayitForm').addEventListener('submit', (e) => {
    e.preventDefault();
    gonder(e.target, async () => {
      if (!$('kKvkk').checked) throw new Error('Üye olmak için KVKK Aydınlatma Metni\'ni okuduğunuzu onaylayın.');
      const r = await api('/api/hesap/kayit', {
        method: 'POST',
        govde: {
          ad: $('kAd').value, soyad: $('kSoyad').value, email: $('kEmail').value,
          telefon: $('kTelefon').value, sifre: $('kSifre').value, kvkkOnay: true
        }
      });
      location.href = donusAdresi(r.rol);
    });
  });

  $('unuttumForm').addEventListener('submit', (e) => {
    e.preventDefault();
    gonder(e.target, async () => {
      await api('/api/hesap/sifremi-unuttum', { method: 'POST', govde: { email: $('uEmail').value.trim() } });
      mod('giris');
      bilgi('Bu e-posta adresiyle bir üyelik varsa şifre sıfırlama bağlantısı gönderdik. Gelen kutunuzu (ve spam klasörünü) kontrol edin.');
    });
  });

  $('sifirlaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    gonder(e.target, async () => {
      if ($('sSifre').value !== $('sSifre2').value) throw new Error('Şifreler aynı değil.');
      const r = await api('/api/hesap/sifre-sifirla', { method: 'POST', govde: { kod: parametre('t'), sifre: $('sSifre').value } });
      location.href = donusAdresi(r.rol);
    });
  });

  // Açılış
  const baslangic = parametre('mod');
  if (baslangic === 'sifirla' && parametre('t')) mod('sifirla');
  else if (baslangic === 'kayit') mod('kayit');
  else mod('giris');

  benAl().then((ben) => {
    if (!ben.girisli) {
      if (parametre('r') === '/admin.html') bilgi('Yönetim paneli için kullanıcı adınız ve şifrenizle giriş yapın.');
      return;
    }
    if (ben.kullanici.rol === 'admin') location.replace('/admin.html');
    else if (parametre('r') === '/admin.html') bilgi('Bu hesapla yönetim paneline girilemez. Yönetici hesabıyla giriş yapın.');
    else if (baslangic !== 'sifirla') location.replace(donusAdresi('musteri'));
  });
})();
