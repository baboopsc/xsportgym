'use strict';
// Sitedeki büyük görsellerin listesi. Fotoğraf hazır olunca dosyayı public/img klasörüne koyup
// adını buraya yazmanız yeterli (ör. kahraman: '/img/salon-genel.jpg'). Boş bırakılan yerlerde sade bir yer tutucu görünür. Şu anki fotoğraflar public/img/site klasöründe.
// Parantez içi: önerilen en-boy oranı, en az genişlik ve ne tür bir fotoğraf iyi durur. Görsel kırpılarak yerleştirilir.
// İpucu: Fotoğrafları .webp ya da kalitesi %80 .jpg olarak kaydedin, site hızlı açılsın.
const GORSELLER = {
  // Ana sayfa
  kahraman: '/img/site/kahraman.jpg',      // en üstteki büyük kart (2:1, 2400 px): salonun geniş açı fotoğrafı, ağırlık bölümü, loş ışık iyi durur
  kahramanKart: '/img/site/kahraman-kart.jpg',  // sağ alttaki küçük kart (16:9, 800 px): PT dersinden bir an
  tanitimSol: '/img/site/tanitim-sol.jpg',    // tanıtım yazısının solundaki hap şeklinde görsel (2:1, 400 px): dambıllar, yakın çekim
  tanitimSag: '/img/site/tanitim-sag.jpg',    // tanıtım yazısının sağındaki dik görsel (8:9, 400 px): antrenman yapan bir üye
  misyon: '/img/site/misyon.jpg',        // koyu bölümde "Misyonumuz" kartının yanındaki geniş görsel (12:5, 1600 px): salonun içi
  bant: '/img/site/bant.jpg',          // "Ter dök. Güçlen." geniş bandı (16:7, 2400 px): hareket halinde biri, karanlık zemin
  ozellik: '/img/site/ozellik.jpg',       // "Hedefine giden yolda" kartlarındaki görsel (2:1, 900 px)
  antrenor: '/img/site/antrenor.jpg',      // "Antrenörünle tanış" kartı (3:2, 1600 px): Selen'in salonda çekilmiş fotoğrafı

  // Hakkımızda
  hakkimizda: '/img/site/hakkimizda.jpg',     // en üstteki büyük kart (2:1, 2400 px)
  hakkimizdaKart: '/img/site/hakkimizda-kart.jpg', // büyük kartın sağ altındaki küçük kart (16:9, 800 px)
  hakkimizdaSol: '/img/site/hakkimizda-sol.jpg',  // hikâyenin solundaki görsel (2:1, 400 px)
  hakkimizdaSag: '/img/site/hakkimizda-sag.jpg',  // hikâyenin sağındaki dik görsel (8:9, 400 px)
  hakkimizdaBant: '/img/site/hakkimizda-bant.jpg', // geniş görsel bandı (16:7, 2400 px)
  hakkimizdaSol2: '/img/site/hakkimizda-sol2.jpg', // ikinci yazının solundaki görsel (4:3, 600 px)
  hakkimizdaSag2: '/img/site/hakkimizda-sag2.jpg', // ikinci yazının sağındaki görsel (16:9, 800 px)

  // Diğer sayfalar
  katalog: '/img/site/paketler.jpg',        // Paketler sayfasının başlık kartı (3:1, 2400 px)
  giris: '/img/site/giris.jpg',          // giriş / üye ol sayfasının sol görseli (4:5, 1200 px)
  tesekkur: '/img/site/tesekkur.jpg',        // ödeme sonrası teşekkür sayfası (16:9, 1600 px)
  paket: '/img/site/paket.jpg'    // panelden fotoğraf eklenmemiş paketlerde gösterilen görsel (4:5)
};
