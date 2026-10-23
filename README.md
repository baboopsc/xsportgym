# Xsportgym – Spor Salonu Sitesi

Antakya Güzelburç'taki Xsportgym için web sitesi: vitrin sayfaları, Instagram bio'su için link sayfası (`/link`),
üyelik/PT paketleri, iyzico ile kartla ödeme ve yönetim paneli. Xsportgym projesinin altyapısı ve tasarım
sistemi üzerine kuruldu; renkler Xsportgym logosundaki koyu zemin ve neon mavi-mor tonlara çevrildi.

## Durum

**Ne satılıyor:** Selen Mışraklı'nın **online koçluk** paketleri (salon üyeliği değil). Fiziksel ürün yok, kargo yok.
iyzico'ya ürün tipi "sanal" (VIRTUAL) gider, müşteriden sadece fatura adresi istenir.

**Tamamlanan**
- Tasarım: kemik beyazı + turuncu tema (`public/css/site.css` başındaki `:root`), Anton + Barlow Condensed başlıklar.
  Diğer paletler denenebilir: adresin sonuna `?tema=volt`, `?tema=kirmizi`, `?tema=lacivert` (geçici önizleme, `public/js/bas.js`).
- Ana sayfa: salon tanıtımı, kampanyalar, **online koçluk fiyat kartları** (paketlerden otomatik; "3 aylık" gibi adlardan
  aylık tutar hesaplanır, aylık en ucuz seçenek "En avantajlı" olur), "nasıl işler" adımları, SSS.
- Paket sayfası: süre seçimi (1/3/6 ay), "Hemen başla", paket içeriği (süre, program, beslenme, takip...).
  `urun.html?u=online-kocluk&s=SEÇENEK_NO` ile istenen süre seçili açılır.
- Link sayfası (`/link`): Instagram bio'su için. Açık/kapalı durumu, online koçluk seçenekleri (paketlerden otomatik), iletişim.
- Ödeme: "Seni tanıyalım" formu (hedef notu dahil), hizmetin cayma süresinde başlamasına dair onay, iyzico.
- Panel: siparişler = öğrenciler. Durumlar: **Yeni öğrenci → Program hazırlanıyor → Koçluk sürüyor → Tamamlandı**.
  "Koçluk sürüyor"a alınca müşteriye "Koçluğun başladı" e-postası gider. Paketler sekmesinde süre seçenekleri,
  fiyat ve kontenjan (999 = sınırsız gibi).
- Sözleşmeler (`lib/sozlesmeler.js`): hizmet satışına göre yeniden yazıldı. **TASLAKTIR, avukata kontrol ettirin.**

**Deneme paketleri:** `node kurulum.js --ornek` (veritabanında paket yoksa). Fiyatlar yer tutucudur, panelden değiştirin.

**Doldurulacaklar**
- `isletme-bilgileri.json`: telefon, WhatsApp, e-posta, unvan, vergi bilgileri
- `public/js/gorseller.js`: salon ve Selen fotoğrafları
- Gerçek paket fiyatları ve içerikleri (panelden)
- E-posta (SMTP) ayarları: Selen'in "Yeni öğrenci" bildirimlerini alması için

## Güvenlik önlemleri

| Risk | Önlem |
|---|---|
| Fiyatı değiştirip ucuza almak | Fiyat ve toplam her zaman sunucuda, veritabanından hesaplanır |
| Ödeme yapmadan "ödendi" göstermek | Sonuç tarayıcıdan değil, sunucudan iyzico'ya sorularak öğrenilir |
| Aynı ödemenin iki kez işlenmesi | Sipariş satırı kilitlenir, stok bir kez düşer, e-posta bir kez gider |
| Tutar uyuşmazlığı / dolandırıcılık şüphesi | Sipariş otomatik onaylanmaz, "İncelemede" olur, salona e-posta gider |
| Son ürünü iki kişinin aynı anda alması | Ödeme kabul edilir, sipariş "stok uyarısı" ile işaretlenir |
| Kart bilgisi sızması | Kart bilgisi bu siteye hiç gelmez (iyzico ödeme sayfası) |
| Panel şifresinin kırılması | bcrypt hash, 15 dakikada 5 deneme sınırı, HttpOnly + SameSite=Strict çerez |
| CSRF (başka siteden panel işlemi) | Özel başlık + Origin kontrolü + SameSite çerez |
| XSS (zararlı kod yazma) | Her çıktı kaçışlanır + sıkı Content-Security-Policy |
| Sahte dosya yükleme | Görselin ilk baytları kontrol edilir (JPEG/PNG/WebP), boyut sınırı |
| Gizli anahtarların sızması | `.env` GitHub'a gönderilmez, sunucu eksik ayarla açılmaz |

## Kurulum (kendi bilgisayarında)

```
npm install
```

`.env.example` dosyasındaki ayarları `.env` dosyasına yazın (zorunlu olanlar en üstte), sonra:

```
node server.js
```

Sunucu açılırken veritabanı tablolarını kendisi oluşturur/günceller. Boş veritabanına örnek ürün eklemek için:

```
node kurulum.js --ornek     # deneme paketleri: Online Koçluk (1/3/6 aylık) + Antrenman Programı ve Beslenme Planı
```

`--katalog` ile eklenen çeşitlerin fiyatı **geçici olarak 650 TL**, stoğu 20'dir ve fotoğrafları yoktur.
Satışa açmadan önce panelden her birinin fiyatını, stoğunu ve fotoğrafını düzenleyin; satmayacağınız çeşitleri silin.
Veritabanında paket varsa hiçbir şey eklenmez.

- Site: http://localhost:3000
- Panel: http://localhost:3000/admin.html

### iyzico test kartları (sandbox)

| Kart | Sonuç |
|---|---|
| 5528 7900 0000 0008 · 12/30 · 123 | Başarılı |
| 4111 1111 1111 1129 · 12/30 · 123 | Yetersiz bakiye |

3D Secure şifresi: `123456`

## Dosya yapısı

```
server.js               Giriş noktası (ayarları kontrol eder, sunucuyu ve arka plan işlerini başlatır)
app.js                  Express uygulaması ve güvenlik başlıkları
kurulum.js              Veritabanı kurulumu (+ örnek ürünler)
sifre-olustur.js        Panel şifresi hash'i üretir
isletme-bilgileri.json  Ünvan, adres, telefon... (sözleşmelerde ve sitenin altında görünür)
lib/
  ayarlar.js            .env okuma ve kontrol
  db.js                 Veritabanı bağlantısı
  gocler.js             Veritabanı tabloları (migration)
  siparis.js            Sipariş, ödeme doğrulama, stok, durumlar  ← en önemli dosya
  iyzico.js             iyzico ile konuşan tek dosya
  isler.js              Arka plan işleri (ödeme kontrolü, e-posta)
  eposta.js             E-posta kuyruğu ve gönderim
  eposta-sablonlari.js  E-posta içerikleri
  sozlesmeler.js        Yasal metinler (TASLAK)
  guvenlik.js           Güvenlik başlıkları, CSRF, istek sınırı
  dogrulama.js          Form kontrolleri (telefon, e-posta, adres...)
  bakim.js              Ürünlerin dikim ve bakım bilgisi alanları
routes/                 API adresleri (mağaza, ödeme, sipariş, admin, sayfalar)
public/                 Sayfalar, CSS ve tarayıcı kodları
  css/site.css          Sitenin bütün tasarımı (renkler en üstte)
  css/admin.css         Yönetim paneli tasarımı
  js/ikonlar.js         SVG ikonlar ve süs çizimleri
  js/ortak.js           Üst menü, alt bilgi, mini sepet, ürün kartları, bildirimler, kaydırma animasyonları
  js/gorseller.js       Sayfalardaki büyük görsellerin listesi (görsel eklemek için burayı düzenleyin)
  js/takvim.js          Aylara göre dikim ve bakım takvimi (hakkımızda ve dikim rehberi)
  fonts/, img/          Yazı tipleri ve görseller
test/                   Otomatik testler (sahte iyzico + sahte e-posta sunucusu)
```

## Testler

Boş bir test veritabanı gerekir (**içindeki her şey silinir**, gerçek veritabanını vermeyin):

```
TEST_DATABASE_URL=postgresql://.../xsportgym_test npm test
```

Testler gerçek iyzico'ya bağlanmaz; sahte bir iyzico sunucusuyla başarılı, başarısız, dolandırıcılık
incelemesi, tutar uyuşmazlığı, zaman aşımı, tarayıcı kapanması ve aynı anda satın alma gibi senaryoları dener.

## Canlıya geçiş listesi

1. **İşletme bilgileri:** `isletme-bilgileri.json` içindeki "DOLDURULACAK" alanları doldurun.
2. **Yasal metinler:** `lib/sozlesmeler.js` içindeki metinleri bir avukata/mali müşavire kontrol ettirin
   (özellikle cayma hakkı ve KVKK yurt dışı aktarım kısmı).
3. **ETBİS:** E-ticaret yapan işletmeler Ticaret Bakanlığı ETBİS sistemine kayıt olmalıdır.
4. **Alan adı ve sunucu:** 7/24 açık kalan ücretli bir plan (ör. Render Starter). Ücretsiz planlar uyur.
5. **Veritabanı:** Neon projesini **Frankfurt** bölgesinde açın, yeni `DATABASE_URL`'i kullanın.
6. **E-posta:** SMTP ayarlarını girin, test siparişiyle e-postaların geldiğini kontrol edin.
7. **Yeni gizli anahtarlar:** Canlı için yeni `JWT_SECRET` ve yeni panel şifresi oluşturun.
8. **iyzico başvurusu:** Site tamamlanınca salon şirket bilgileriyle iyzico'ya başvurur.
9. **Canlı anahtarlar:** Onay gelince `.env`'de `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` ve
   `IYZICO_BASE_URL=https://api.iyzipay.com` değiştirilir, `NODE_ENV=production` yapılır.
10. **iyzico bildirimi:** iyzico paneli > Ayarlar > Firma Ayarları > İşyeri Bildirimleri kısmına
    `https://SITENIZ/api/odeme/bildirim` adresini yazın.
11. **Gerçek test:** Küçük tutarlı bir ürünle gerçek kartla ödeme yapın, panelde görün, iyzico'dan iade edin.
12. **iyzico logo bandı:** iyzico başvuruda sitenin altına kendi logo bandını koymanızı isteyebilir; verdikleri görseli
    `public/img` içine koyup alt bilgiye ekleyin.
13. **Aras takip linki:** Gerçek bir takip numarasıyla e-postadaki linkin doğru sayfayı açtığını kontrol edin
    (gerekirse `.env`'de `ARAS_TAKIP_URL` ile değiştirin).

## Para iadesi

Panelde siparişteki **"İptal et ve parayı iade et"** butonu parayı iyzico üzerinden müşterinin kartına iade eder:

- Ödeme **aynı gün** yapıldıysa ödeme tamamen iptal edilir (müşterinin ekstresine hiç yansımaz).
- Daha sonraysa her ürün kalemi ayrı ayrı iade edilir (karta yansıması bankaya göre birkaç gün sürer).
- iyzico iadeyi reddederse sipariş **iptal edilmez** ve hatanın sebebi panelde görünür. Tekrar denendiğinde
  sadece iade edilmemiş kalemler gönderilir; aynı para iki kez iade edilmez.
- İade başarılı olunca sipariş iptal edilir (teslim edilmiş siparişte "İade edildi" olur), stok geri eklenir
  ve müşteriye e-posta gider.

Parayı iyzico panelinden kendiniz iade ettiyseniz siparişin **Ayrıntılar** kısmındaki
"Sadece iptal olarak işaretle" butonunu kullanın.
