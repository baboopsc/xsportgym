'use strict';
// Sayfanın en başında çalışır: JavaScript açık olduğunu CSS'e bildirir (kaydırınca beliren öğeler için).
// Güvenlik kuralı (CSP) satır içi script'e izin vermediği için ayrı dosyada.
document.documentElement.classList.add('js');

// Aydınlık / karanlık mod: ziyaretçinin seçimi tarayıcıda saklanır, varsayılan karanlık.
// Sayfa çizilmeden önce ayarlanır ki açılışta renk yanıp sönmesin.
(() => {
  let tema = 'koyu';
  try { if (localStorage.getItem('xsport-tema') === 'acik') tema = 'acik'; } catch { /* gizli sekme vb. */ }
  if (location.pathname.startsWith('/admin')) tema = 'acik'; // yönetim paneli her zaman aydınlık
  document.documentElement.dataset.tema = tema;
})();
