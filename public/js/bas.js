'use strict';
// Sayfanın en başında çalışır: JavaScript açık olduğunu CSS'e bildirir (kaydırınca beliren öğeler için).
// Güvenlik kuralı (CSP) satır içi script'e izin vermediği için ayrı dosyada.
document.documentElement.classList.add('js');

// GEÇİCİ: renk paleti önizlemesi. Adresin sonuna ?tema=kirmizi (ya da lacivert, acik, volt) yazınca
// o palet bütün sayfalarda görünür (varsayılan: acik). Palet kesinleşince bu blok silinecek.
(() => {
  const TEMALAR = ['volt', 'kirmizi', 'lacivert', 'acik'];
  let tema = new URLSearchParams(location.search).get('tema');
  try {
    if (TEMALAR.includes(tema)) sessionStorage.setItem('xsport-tema', tema);
    else tema = sessionStorage.getItem('xsport-tema');
  } catch { /* gizli sekme vb. */ }
  if (TEMALAR.includes(tema) && tema !== 'acik') document.documentElement.dataset.tema = tema;
})();
