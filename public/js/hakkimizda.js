'use strict';
// Hakkımızda: haftalık saat grafiği (bugün vurgulanır) ve değer kartları
(() => {
  // ---------- Haftalık saat grafiği ----------
  const grafik = document.getElementById('saatGrafik');
  if (grafik) {
  const enCok = Math.max(...[...grafik.children].map(g => Number(g.dataset.saat)));
  const bugun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date())
  );
  [...grafik.children].forEach((g) => {
    // CSP satır içi stile izin vermediği için oran CSS değişkeniyle verilir
    g.style.setProperty('--oran', `${(Number(g.dataset.saat) / enCok) * 100}%`);
    g.classList.toggle('bugun', Number(g.dataset.gun) === bugun);
    g.classList.toggle('kapali', Number(g.dataset.saat) === 0);
  });
  const not = document.querySelector('#bugunNot span:last-child');
  const bugunKutu = grafik.querySelector('.bugun');
  if (not && bugunKutu) {
    not.textContent = bugunKutu.classList.contains('kapali')
      ? 'Bugün pazar, salonumuz kapalı. Yarın 07.00\'de görüşmek üzere!'
      : `Bugün ${bugun === 6 ? '08.00 – 21.00' : '07.00 – 22.30'} arası açığız.`;
  }
  }

  // ---------- Değer kartları: oklarla bir kart kaydır ----------
  const serit = document.getElementById('degerSerit');
  const adim = () => {
    const kart = serit.querySelector('.deger-kart');
    return kart ? kart.getBoundingClientRect().width + parseFloat(getComputedStyle(serit).columnGap || 0) : 300;
  };
  const oklar = () => {
    document.getElementById('degerGeri').disabled = serit.scrollLeft < 4;
    document.getElementById('degerIleri').disabled = serit.scrollLeft + serit.clientWidth > serit.scrollWidth - 4;
  };
  document.getElementById('degerGeri').addEventListener('click', () => serit.scrollBy({ left: -adim(), behavior: Site.azHareket ? 'auto' : 'smooth' }));
  document.getElementById('degerIleri').addEventListener('click', () => serit.scrollBy({ left: adim(), behavior: Site.azHareket ? 'auto' : 'smooth' }));
  serit.addEventListener('scroll', oklar, { passive: true });
  window.addEventListener('resize', oklar);
  oklar();
})();
