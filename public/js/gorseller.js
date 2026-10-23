'use strict';
// Sitedeki büyük görsellerin listesi. Fotoğraf hazır olunca dosyayı public/img klasörüne koyup
// adını buraya yazmanız yeterli (ör. kahraman: '/img/salon-genel.jpg'). Boş bırakılan yerlerde neon renk geçişi görünür.
// Parantez içi: önerilen en-boy oranı, en az genişlik ve ne tür bir fotoğraf iyi durur. Görsel kırpılarak yerleştirilir.
// İpucu: Fotoğrafları .webp ya da kalitesi %80 .jpg olarak kaydedin, site hızlı açılsın.
const GORSELLER = {
  // Ana sayfa
  kahraman: '',      // en üstteki büyük kart (2:1, 2400 px): salonun geniş açı fotoğrafı, ağırlık bölümü, loş ışık iyi durur
  kahramanKart: '',  // sağ alttaki küçük kart (16:9, 800 px): PT dersinden bir an
  tanitimSol: '',    // tanıtım yazısının solundaki hap şeklinde görsel (2:1, 400 px): dambıllar, yakın çekim
  tanitimSag: '',    // tanıtım yazısının sağındaki dik görsel (8:9, 400 px): antrenman yapan bir üye
  misyon: '',        // koyu bölümde "Misyonumuz" kartının yanındaki geniş görsel (12:5, 1600 px): salonun içi
  bant: '',          // "Ter dök. Güçlen." geniş bandı (16:7, 2400 px): hareket halinde biri, karanlık zemin
  ozellik: '',       // "Hedefine giden yolda" kartlarındaki görsel (2:1, 900 px)
  antrenor: '',      // "Antrenörünle tanış" kartı (3:2, 1600 px): Selen'in salonda çekilmiş fotoğrafı

  // Hakkımızda
  hakkimizda: '',     // en üstteki büyük kart (2:1, 2400 px)
  hakkimizdaKart: '', // büyük kartın sağ altındaki küçük kart (16:9, 800 px)
  hakkimizdaSol: '',  // hikâyenin solundaki görsel (2:1, 400 px)
  hakkimizdaSag: '',  // hikâyenin sağındaki dik görsel (8:9, 400 px)
  hakkimizdaBant: '', // geniş görsel bandı (16:7, 2400 px)
  hakkimizdaSol2: '', // ikinci yazının solundaki görsel (4:3, 600 px)
  hakkimizdaSag2: '', // ikinci yazının sağındaki görsel (16:9, 800 px)

  // Diğer sayfalar
  katalog: '',        // Paketler sayfasının başlık kartı (3:1, 2400 px)
  giris: '',          // giriş / üye ol sayfasının sol görseli (4:5, 1200 px)
  tesekkur: ''        // ödeme sonrası teşekkür sayfası (16:9, 1600 px)
};
