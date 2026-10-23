'use strict';
// Yasal metinler. ÖNEMLİ: Bunlar TASLAKTIR. Site yayına alınmadan önce bir avukata veya
// mali müşavire kontrol ettirilmelidir. Metinlerdeki işletme bilgileri isletme-bilgileri.json'dan gelir.
const ayarlar = require('./ayarlar');
const { esc, tl, tarihMetni } = require('./yardimci');

const bos = '—';
const deger = v => (v === undefined || v === null || v === '' ? bos : esc(v));

function saticiBilgileri(i) {
  return `
    <table class="bilgi">
      <tr><th>Unvan</th><td>${deger(i.unvan)}</td></tr>
      <tr><th>Marka</th><td>${deger(i.marka)}</td></tr>
      <tr><th>Adres</th><td>${deger(i.adres)}</td></tr>
      <tr><th>Telefon</th><td>${deger(i.telefon)}</td></tr>
      <tr><th>E-posta</th><td>${deger(i.eposta)}</td></tr>
      ${i.kepAdresi ? `<tr><th>KEP adresi</th><td>${esc(i.kepAdresi)}</td></tr>` : ''}
      <tr><th>Vergi dairesi / no</th><td>${deger(i.vergiDairesi)} / ${deger(i.vergiNo)}</td></tr>
      ${i.mersisNo ? `<tr><th>MERSİS no</th><td>${esc(i.mersisNo)}</td></tr>` : ''}
      <tr><th>Web sitesi</th><td>${deger(ayarlar.siteUrl)}</td></tr>
    </table>`;
}

function aliciBilgileri(m) {
  if (!m) return '<p>Alıcı bilgileri, sipariş sırasında ödeme sayfasında girilen bilgilerdir.</p>';
  const ad = [m.ad, m.soyad].filter(Boolean).join(' ');
  const adres = [m.adres, m.ilce, m.il, m.postaKodu].filter(Boolean).join(', ');
  return `
    <table class="bilgi">
      <tr><th>Ad Soyad</th><td>${deger(ad)}</td></tr>
      <tr><th>Teslimat / fatura adresi</th><td>${deger(adres)}</td></tr>
      <tr><th>Telefon</th><td>${deger(m.telefon)}</td></tr>
      <tr><th>E-posta</th><td>${deger(m.email)}</td></tr>
    </table>`;
}

function urunTablosu(kalemler, toplamKurus) {
  if (!kalemler || kalemler.length === 0) {
    return '<p>Satın alınan ürünler, adetleri ve fiyatları ödeme sayfasındaki sipariş özetinde gösterilir.</p>';
  }
  return `
    <table class="urunler">
      <thead><tr><th>Ürün</th><th>Adet</th><th>Birim fiyat</th><th>Tutar</th></tr></thead>
      <tbody>
        ${kalemler.map(k => `
          <tr>
            <td>${esc(k.urunAdi)} (${esc(k.secenekAdi)})</td>
            <td>${esc(k.adet)}</td>
            <td>${tl(k.birimFiyatKurus)}</td>
            <td>${tl(k.birimFiyatKurus * k.adet)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Kargo</td><td>Ücretsiz</td></tr>
        <tr><td colspan="3"><strong>Toplam (KDV dahil)</strong></td><td><strong>${tl(toplamKurus)}</strong></td></tr>
      </tfoot>
    </table>`;
}

function caymaHakkiMetni(i) {
  return `
    <p>ALICI, sözleşme konusu ürünü teslim aldığı günden itibaren <strong>14 (on dört) gün</strong> içinde
    hiçbir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.</p>
    <p>Cayma hakkını kullanmak için bu süre içinde SATICI'ya yazılı olarak veya e-posta ile
    (${deger(i.eposta)}) bildirimde bulunulması yeterlidir. Bildirimde sipariş numarası ve ad soyad yer almalıdır.</p>
    <p>ALICI, cayma bildiriminden itibaren 10 (on) gün içinde ürünü SATICI'ya geri göndermelidir.
    İade, SATICI'nın belirlediği taşıyıcı (${deger(i.kargoFirmasi)}) ile yapıldığında iade kargo bedeli
    ALICI'ya yüklenmez. İade adresi: ${deger(i.iadeAdresi)}.</p>
    <p>SATICI, cayma bildiriminin kendisine ulaştığı tarihten itibaren en geç 14 (on dört) gün içinde
    ürün bedelini, ALICI'nın ödeme yaptığı karta iade eder. Bedelin karta yansıma süresi bankaya göre değişebilir.</p>
    <p>Ürünler canlı bitki olduğundan, iade edilecek fidanların teslim alındığı şekilde ve özenle
    paketlenerek gönderilmesi gerekir. ALICI, cayma süresi içinde ürünü olağan kullanımı dışında
    kullanması veya özensiz davranması sonucu oluşan değer kaybından sorumludur.</p>`;
}

// ---------- Ön Bilgilendirme Formu ----------
function onBilgilendirme({ musteri = null, kalemler = [], toplamKurus = 0, siparisNo = null, tarih = null } = {}) {
  const i = ayarlar.isletme;
  return `
    <h2>Ön Bilgilendirme Formu</h2>
    ${siparisNo ? `<p>Sipariş no: <strong>${esc(siparisNo)}</strong>${tarih ? ` · Tarih: ${esc(tarihMetni(tarih))}` : ''}</p>` : ''}
    <h3>1. Satıcı bilgileri</h3>
    ${saticiBilgileri(i)}
    <h3>2. Alıcı bilgileri</h3>
    ${aliciBilgileri(musteri)}
    <h3>3. Ürünlerin temel nitelikleri ve fiyatı</h3>
    ${urunTablosu(kalemler, toplamKurus)}
    <p>Ürün fotoğrafları ve açıklamaları ürün sayfalarında yer alır. Fidanlar canlı bitki olduğundan
    boy, dal sayısı ve görünüm fotoğraftan doğal olarak bir miktar farklı olabilir.</p>
    <h3>4. Ödeme</h3>
    <p>Ödeme, lisanslı ödeme kuruluşu iyzico altyapısıyla kredi kartı veya banka kartı ile alınır.
    Kart bilgileri SATICI tarafından görülmez ve saklanmaz. Taksitli ödemelerde varsa vade farkı,
    ödeme sayfasında ödemeden önce gösterilir.</p>
    <h3>5. Teslimat</h3>
    <p>Teslimat ${deger(i.kargoFirmasi)} ile ALICI'nın belirttiği adrese yapılır ve kargo ücreti SATICI'ya aittir.
    ${deger(i.kargoyaVerilmeSuresi)} ${deger(i.teslimSuresi)}</p>
    <h3>6. Cayma hakkı</h3>
    ${caymaHakkiMetni(i)}
    <h3>7. Şikâyet ve itirazlar</h3>
    <p>ALICI, şikâyetlerini öncelikle SATICI'ya (${deger(i.telefon)}, ${deger(i.eposta)}) iletebilir.
    Uyuşmazlıklarda, Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde ALICI'nın
    yerleşim yerindeki veya işlemin yapıldığı yerdeki Tüketici Hakem Heyetine, bu sınırları aşan
    durumlarda Tüketici Mahkemesine başvurulabilir.</p>`;
}

// ---------- Mesafeli Satış Sözleşmesi ----------
function mesafeliSatis({ musteri = null, kalemler = [], toplamKurus = 0, siparisNo = null, tarih = null } = {}) {
  const i = ayarlar.isletme;
  return `
    <h2>Mesafeli Satış Sözleşmesi</h2>
    ${siparisNo ? `<p>Sipariş no: <strong>${esc(siparisNo)}</strong>${tarih ? ` · Tarih: ${esc(tarihMetni(tarih))}` : ''}</p>` : ''}
    <h3>Madde 1 – Taraflar</h3>
    <p><strong>SATICI:</strong></p>
    ${saticiBilgileri(i)}
    <p><strong>ALICI:</strong></p>
    ${aliciBilgileri(musteri)}
    <h3>Madde 2 – Konu</h3>
    <p>Bu sözleşmenin konusu, ALICI'nın SATICI'ya ait internet sitesinden elektronik ortamda sipariş verdiği
    aşağıda nitelikleri ve satış fiyatı belirtilen ürünlerin satışı ve teslimi ile ilgili olarak
    6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri
    gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.</p>
    <h3>Madde 3 – Ürün bilgileri</h3>
    ${urunTablosu(kalemler, toplamKurus)}
    <h3>Madde 4 – Genel hükümler</h3>
    <p>4.1. ALICI, ürünlerin temel nitelikleri, satış fiyatı, ödeme şekli ve teslimata ilişkin ön bilgileri
    okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli onayı verdiğini kabul eder.</p>
    <p>4.2. Ürün, ALICI'nın belirttiği teslimat adresindeki kişiye teslim edilir. Teslim sırasında paketin
    hasarlı olduğu görülürse ALICI'nın kargo görevlisine tutanak tutturması önerilir.</p>
    <p>4.3. Ödemenin herhangi bir nedenle gerçekleşmemesi veya banka tarafından iptal edilmesi halinde
    SATICI'nın ürünü teslim yükümlülüğü sona erer.</p>
    <p>4.4. SATICI, siparişin stok veya mücbir sebepler nedeniyle yerine getirilemeyeceğini fark ederse
    bunu ALICI'ya derhal bildirir ve tahsil edilen bedeli en geç 14 gün içinde iade eder.</p>
    <h3>Madde 5 – Teslimat</h3>
    <p>${deger(i.kargoyaVerilmeSuresi)} ${deger(i.teslimSuresi)} Kargo ücreti SATICI'ya aittir.</p>
    <h3>Madde 6 – Cayma hakkı</h3>
    ${caymaHakkiMetni(i)}
    <h3>Madde 7 – Cayma hakkının kullanılamayacağı durumlar</h3>
    <p>Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinde sayılan hallerde (ör. ALICI'nın istekleri
    doğrultusunda kişiye özel hazırlanan ürünler) cayma hakkı kullanılamaz.</p>
    <h3>Madde 8 – Uyuşmazlıkların çözümü</h3>
    <p>Bu sözleşmeden doğan uyuşmazlıklarda, Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde
    Tüketici Hakem Heyetleri, bu sınırları aşan durumlarda Tüketici Mahkemeleri yetkilidir.</p>
    <h3>Madde 9 – Yürürlük</h3>
    <p>ALICI, siparişi onaylayıp ödemeyi tamamladığında bu sözleşmenin tüm koşullarını kabul etmiş sayılır.
    Sözleşmenin bir kopyası sipariş onayı ile birlikte ALICI'nın e-posta adresine gönderilir.</p>`;
}

// Siparişe özel, değişmeyecek sözleşme kopyası (veritabanında saklanır ve e-postaya eklenir)
function siparisSozlesmeBelgesi(veri) {
  return belgeHtml(
    `Sipariş ${veri.siparisNo} - Sözleşmeler`,
    `${onBilgilendirme(veri)}<hr>${mesafeliSatis(veri)}`
  );
}

// ---------- Genel sayfalar ----------
function kvkk() {
  const i = ayarlar.isletme;
  return `
    <h2>Kişisel Verilerin Korunması Aydınlatma Metni</h2>
    <p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla
    ${deger(i.unvan)} (${deger(i.marka)}) olarak kişisel verilerinizi aşağıda açıklanan şekilde işliyoruz.</p>
    <h3>İşlenen kişisel veriler</h3>
    <ul>
      <li><strong>Kimlik ve iletişim:</strong> ad, soyad, telefon, e-posta, teslimat adresi</li>
      <li><strong>Müşteri işlem:</strong> sipariş içeriği, tutarı, sipariş notu, kargo bilgileri</li>
      <li><strong>İşlem güvenliği:</strong> sipariş sırasındaki IP adresi, ödeme işlem numarası</li>
      <li><strong>Üyelik (üye olursanız):</strong> ad, soyad, e-posta, telefon, kayıtlı adres; şifreniz geri
      çözülemeyecek şekilde şifrelenerek (hash) saklanır</li>
    </ul>
    <p>Kart bilgileriniz SATICI tarafından işlenmez ve saklanmaz; ödeme, lisanslı ödeme kuruluşu iyzico
    tarafından alınır.</p>
    <h3>İşleme amaçları ve hukuki sebepler</h3>
    <p>Verileriniz; siparişinizin alınması, ödemenin doğrulanması, ürünün teslimi, fatura düzenlenmesi,
    sipariş durumuyla ilgili bilgilendirme yapılması, talep ve şikâyetlerinizin yanıtlanması ve yasal
    yükümlülüklerimizin yerine getirilmesi amaçlarıyla; KVKK m.5/2 (c) sözleşmenin kurulması ve ifası,
    (ç) hukuki yükümlülüğün yerine getirilmesi ve (f) meşru menfaat hukuki sebeplerine dayanılarak işlenir.</p>
    <h3>Aktarım</h3>
    <p>Verileriniz yalnızca yukarıdaki amaçlar için gerekli olduğu ölçüde; teslimat için kargo şirketine
    (${deger(i.kargoFirmasi)}), ödemenin alınması için iyzico'ya, muhasebe hizmeti aldığımız mali müşavire ve
    talep halinde yetkili kamu kurumlarına aktarılır. Sitenin barındırıldığı sunucu ve veritabanı hizmet
    sağlayıcılarının sunucuları yurt dışında bulunabilir.</p>
    <h3>Saklama süresi</h3>
    <p>Sipariş kayıtları, ilgili mevzuatta öngörülen süreler (ör. Vergi Usul Kanunu ve Türk Ticaret Kanunu
    gereği 10 yıl) boyunca saklanır, sonra silinir veya anonim hale getirilir.</p>
    <h3>Haklarınız</h3>
    <p>Üyeliğinizi dilediğiniz zaman "Hesabım" sayfasından silebilirsiniz; üyelik bilgileriniz silinir,
    yasal saklama yükümlülüğü olan sipariş kayıtları ise süre sonuna kadar saklanır.</p>
    <p>KVKK m.11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme,
    düzeltilmesini veya silinmesini isteme ve diğer haklarınızı kullanmak için ${deger(i.eposta)} adresine
    veya ${deger(i.adres)} adresine yazılı olarak başvurabilirsiniz.</p>`;
}

function iadeKosullari() {
  const i = ayarlar.isletme;
  return `
    <h2>İptal ve İade Koşulları</h2>
    <h3>Sipariş iptali</h3>
    <p>Siparişiniz kargoya verilmeden önce ${deger(i.telefon)} numarasından veya ${deger(i.eposta)}
    adresinden bize ulaşarak iptal edebilirsiniz. Ödemeniz kartınıza iade edilir.</p>
    <h3>Cayma hakkı ve iade</h3>
    ${caymaHakkiMetni(i)}
    <h3>Hasarlı teslimat</h3>
    <p>Paketin hasarlı geldiğini fark ederseniz lütfen kargo görevlisine tutanak tutturun ve aynı gün
    fotoğraflarla birlikte bize bildirin. Ürününüz yenisiyle değiştirilir veya bedeli iade edilir.</p>`;
}

function teslimat() {
  const i = ayarlar.isletme;
  return `
    <h2>Teslimat Koşulları</h2>
    <ul>
      <li>Tüm siparişlerde <strong>kargo ücretsizdir</strong>.</li>
      <li>Gönderiler ${deger(i.kargoFirmasi)} ile yapılır.</li>
      <li>${deger(i.kargoyaVerilmeSuresi)}</li>
      <li>${deger(i.teslimSuresi)}</li>
      <li>Siparişiniz kargoya verildiğinde e-posta ile kargo takip numaranızı göndeririz.
      Siparişinizi <a href="/siparis.html">sipariş takip</a> sayfasından da izleyebilirsiniz.</li>
      <li>Fidanlar canlı bitkidir; paketi teslim aldıktan sonra en kısa sürede açıp sulamanızı öneririz.</li>
    </ul>`;
}

function gizlilik() {
  const i = ayarlar.isletme;
  return `
    <h2>Gizlilik ve Çerez Politikası</h2>
    <p>Bu site reklam veya takip amaçlı çerez kullanmaz ve ziyaretçilerin davranışını izlemez.</p>
    <ul>
      <li><strong>Sepet:</strong> Sepetinize eklediğiniz ürünler yalnızca kendi tarayıcınızda
      (yerel depolama) tutulur, sunucumuza siz siparişi verene kadar gönderilmez.</li>
      <li><strong>Ödeme formu:</strong> Ödeme sayfasına yazdığınız teslimat bilgileri, ödeme yarıda kalırsa
      tekrar yazmanız gerekmesin diye sekmeyi kapatana kadar yalnızca tarayıcınızda tutulur.</li>
      <li><strong>Giriş:</strong> Üye veya işletme yetkilisi giriş yaptığında oturumu açık tutmak için zorunlu bir çerez kullanılır.</li>
      <li><strong>Ödeme:</strong> Kart bilgileriniz iyzico'nun güvenli ödeme sayfasında girilir; bu sitede saklanmaz.</li>
    </ul>
    <p>Kişisel verilerinizin nasıl işlendiği <a href="/sayfa/kvkk-aydinlatma-metni">KVKK Aydınlatma Metni</a>'nde açıklanmıştır.
    Sorularınız için: ${deger(i.eposta)}</p>`;
}

function iletisim() {
  const i = ayarlar.isletme;
  return `
    <h2>İletişim</h2>
    ${saticiBilgileri(i)}
    <p>Çalışma saatleri: ${deger(i.calismaSaatleri)}</p>`;
}

const GENEL_SAYFALAR = {
  'on-bilgilendirme-formu': { baslik: 'Ön Bilgilendirme Formu', icerik: () => onBilgilendirme() },
  'mesafeli-satis-sozlesmesi': { baslik: 'Mesafeli Satış Sözleşmesi', icerik: () => mesafeliSatis() },
  'kvkk-aydinlatma-metni': { baslik: 'KVKK Aydınlatma Metni', icerik: kvkk },
  'iptal-ve-iade-kosullari': { baslik: 'İptal ve İade Koşulları', icerik: iadeKosullari },
  'teslimat-kosullari': { baslik: 'Teslimat Koşulları', icerik: teslimat },
  'gizlilik-ve-cerez-politikasi': { baslik: 'Gizlilik ve Çerez Politikası', icerik: gizlilik },
  'iletisim': { baslik: 'İletişim', icerik: iletisim }
};

// Tek başına açılabilen belge (e-posta eki ve sipariş sözleşme kopyası için)
function belgeHtml(baslik, icerik) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(baslik)}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 820px; margin: 24px auto; padding: 0 16px; color: #222; line-height: 1.5; }
  h2 { color: #2e5d34; border-bottom: 2px solid #2e5d34; padding-bottom: 4px; margin-top: 32px; }
  h3 { margin-top: 20px; font-size: 1.05em; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  table.bilgi th { width: 200px; background: #f5f7f5; }
  table.urunler thead th { background: #f5f7f5; }
  hr { margin: 40px 0; }
</style>
</head>
<body>
${icerik}
</body>
</html>`;
}

module.exports = { onBilgilendirme, mesafeliSatis, siparisSozlesmeBelgesi, GENEL_SAYFALAR, belgeHtml };
