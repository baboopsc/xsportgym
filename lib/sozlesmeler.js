'use strict';
const ayarlarModulu = require('./ayarlar');
const havaleMi = () => ayarlarModulu.odemeYontemi === 'havale';
// Ödeme maddesi: havale / EFT ya da iyzico (ODEME_YONTEMI ayarına göre)
function odemeMetni() {
  if (havaleMi()) {
    return `<p>Ödeme, sipariş sonrasında gösterilen ve e-postayla iletilen SATICI'ya ait banka hesabına havale / EFT
    ile yapılır. Havale açıklamasına sipariş numarası yazılır. Sipariş, ödeme SATICI'nın hesabına ulaştıktan sonra
    onaylanır ve hizmet bu tarihten itibaren başlar.</p>`;
  }
  return `<p>Ödeme, lisanslı ödeme kuruluşu iyzico altyapısıyla kredi kartı veya banka kartı ile alınır.
    Kart bilgileri SATICI tarafından görülmez ve saklanmaz. Taksitli ödemelerde varsa vade farkı,
    ödeme sayfasında ödemeden önce gösterilir.</p>`;
}
// Yasal metinler (online koçluk hizmeti satışı). ÖNEMLİ: Bunlar TASLAKTIR. Site yayına alınmadan önce
// bir avukata veya mali müşavire kontrol ettirilmelidir. Özellikle: cayma hakkı istisnası (hizmetin
// ifasına başlanması), sağlık verisi ve açık rıza, KVKK yurt dışı aktarım kısmı.
// Metinlerdeki işletme bilgileri isletme-bilgileri.json'dan gelir.
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
      <tr><th>Fatura adresi</th><td>${deger(adres)}</td></tr>
      <tr><th>Telefon</th><td>${deger(m.telefon)}</td></tr>
      <tr><th>E-posta</th><td>${deger(m.email)}</td></tr>
    </table>`;
}

function paketTablosu(kalemler, toplamKurus) {
  if (!kalemler || kalemler.length === 0) {
    return '<p>Satın alınan paketler, süreleri ve fiyatları ödeme sayfasındaki sipariş özetinde gösterilir.</p>';
  }
  return `
    <table class="urunler">
      <thead><tr><th>Paket</th><th>Süre / seçenek</th><th>Adet</th><th>Tutar</th></tr></thead>
      <tbody>
        ${kalemler.map(k => `
          <tr>
            <td>${esc(k.urunAdi)}</td>
            <td>${esc(k.secenekAdi)}</td>
            <td>${esc(k.adet)}</td>
            <td>${tl(k.birimFiyatKurus * k.adet)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3"><strong>Toplam (KDV dahil)</strong></td><td><strong>${tl(toplamKurus)}</strong></td></tr>
      </tfoot>
    </table>`;
}

function hizmetinIfasi(i) {
  return `
    <p>Satın alınan paket, kişiye özel antrenman programı, (pakette varsa) beslenme planı ve paket süresi boyunca
    çevrim içi takip ve iletişimden oluşan bir <strong>online koçluk hizmetidir</strong>. Fiziksel bir ürün gönderilmez.</p>
    <p>SATICI, ödemenin onaylanmasından sonra makul süre içinde ALICI ile ödeme sırasında verdiği telefon numarası
    ve/veya e-posta adresi üzerinden iletişime geçer, hedeflerini ve uygunluğunu konuşur ve programı hazırlayarak
    ALICI'ya iletir. Paket süresi, programın ALICI'ya iletildiği tarihte başlar.</p>
    <p>İletişim: ${deger(i.telefon)} · ${deger(i.eposta)}</p>`;
}

function saglikUyarisi() {
  return `
    <p>Online koçluk bir sağlık hizmeti değildir; tıbbi teşhis veya tedavi yerine geçmez. ALICI, bilinen bir
    sağlık sorunu, sakatlığı, hamileliği veya düzenli kullandığı bir ilaç varsa programa başlamadan önce
    doktoruna danışmayı ve bunu koçuna bildirmeyi kabul eder. Antrenman sırasında ağrı, baş dönmesi veya
    olağan dışı bir durum hissedilirse antrenman durdurulmalı ve bir sağlık uzmanına başvurulmalıdır.</p>`;
}

function caymaHakkiMetni(i) {
  return `
    <p>ALICI, sözleşmenin kurulduğu (ödemenin yapıldığı) günden itibaren <strong>14 (on dört) gün</strong> içinde
    hiçbir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.</p>
    <p>Ancak Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesi uyarınca, <strong>cayma süresi dolmadan ALICI'nın
    onayıyla ifasına başlanan hizmetlerde cayma hakkı kullanılamaz.</strong> ALICI, siparişi onaylarken hizmetin
    cayma süresi içinde başlatılmasını talep ettiğini ve kişiye özel programın kendisine iletilmesiyle
    hizmetin ifasına başlanmış sayılacağını kabul eder.</p>
    <p>Program ALICI'ya iletilmeden önce cayma hakkını kullanmak için SATICI'ya e-posta ile
    (${deger(i.eposta)}) veya telefonla (${deger(i.telefon)}) bildirimde bulunulması yeterlidir. Bildirimde
    sipariş numarası ve ad soyad yer almalıdır. SATICI, cayma bildiriminin kendisine ulaştığı tarihten itibaren
    en geç 14 (on dört) gün içinde ödenen bedeli ALICI'nın ödeme yaptığı karta iade eder. Bedelin karta yansıma
    süresi bankaya göre değişebilir.</p>`;
}

// ---------- Ön Bilgilendirme Formu ----------
function onBilgilendirme({ musteri = null, kalemler = [], toplamKurus = 0, siparisNo = null, tarih = null } = {}) {
  const i = ayarlar.isletme;
  return `
    <h2>Ön Bilgilendirme Formu</h2>
    ${siparisNo ? `<p>Sipariş no: <strong>${esc(siparisNo)}</strong>${tarih ? ` · Tarih: ${esc(tarihMetni(tarih))}` : ''}</p>` : ''}
    <h3>1. Hizmet sağlayıcı (satıcı) bilgileri</h3>
    ${saticiBilgileri(i)}
    <h3>2. Alıcı bilgileri</h3>
    ${aliciBilgileri(musteri)}
    <h3>3. Hizmetin temel nitelikleri ve fiyatı</h3>
    ${paketTablosu(kalemler, toplamKurus)}
    <p>Paketlerin içeriği (süre, antrenman programı, beslenme planı, takip sıklığı) paket sayfalarında açıklanmıştır.</p>
    <h3>4. Ödeme</h3>
    ${odemeMetni()}
    <h3>5. Hizmetin ifası</h3>
    ${hizmetinIfasi(i)}
    <h3>6. Sağlık uyarısı</h3>
    ${saglikUyarisi()}
    <h3>7. Cayma hakkı</h3>
    ${caymaHakkiMetni(i)}
    <h3>8. Şikâyet ve itirazlar</h3>
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
    <p><strong>SATICI (hizmet sağlayıcı):</strong></p>
    ${saticiBilgileri(i)}
    <p><strong>ALICI:</strong></p>
    ${aliciBilgileri(musteri)}
    <h3>Madde 2 – Konu</h3>
    <p>Bu sözleşmenin konusu, ALICI'nın SATICI'ya ait internet sitesinden elektronik ortamda satın aldığı,
    aşağıda nitelikleri ve fiyatı belirtilen online koçluk hizmetinin sunulması ile ilgili olarak
    6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri
    gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.</p>
    <h3>Madde 3 – Hizmet bilgileri</h3>
    ${paketTablosu(kalemler, toplamKurus)}
    <h3>Madde 4 – Hizmetin ifası</h3>
    ${hizmetinIfasi(i)}
    <h3>Madde 5 – Tarafların yükümlülükleri</h3>
    <p>5.1. ALICI, hizmetin temel nitelikleri, fiyatı, ödeme şekli ve ifasına ilişkin ön bilgileri okuyup
    bilgi sahibi olduğunu ve elektronik ortamda gerekli onayı verdiğini kabul eder.</p>
    <p>5.2. ALICI, programın kendisine uygun hazırlanabilmesi için verdiği bilgilerin doğru olduğunu kabul eder.
    Program kişiye özeldir; üçüncü kişilerle paylaşılamaz ve ticari amaçla kullanılamaz.</p>
    <p>5.3. Sonuçlar; kişinin başlangıç durumuna, programa uyumuna, beslenmesine ve uykusuna göre değişir.
    SATICI belirli bir sonucu (ör. belirli bir kilo kaybını) garanti etmez.</p>
    <p>5.4. Ödemenin herhangi bir nedenle gerçekleşmemesi veya banka tarafından iptal edilmesi halinde
    SATICI'nın hizmeti sunma yükümlülüğü sona erer.</p>
    <p>5.5. SATICI, hizmeti kontenjan veya mücbir sebepler nedeniyle sunamayacağını fark ederse bunu ALICI'ya
    derhal bildirir ve tahsil edilen bedeli en geç 14 gün içinde iade eder.</p>
    <h3>Madde 6 – Sağlık uyarısı</h3>
    ${saglikUyarisi()}
    <h3>Madde 7 – Cayma hakkı</h3>
    ${caymaHakkiMetni(i)}
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
      <li><strong>Kimlik ve iletişim:</strong> ad, soyad, telefon, e-posta, fatura adresi</li>
      <li><strong>Müşteri işlem:</strong> satın alınan paket, tutarı, ödeme sırasında yazdığınız hedef notu</li>
      <li><strong>İşlem güvenliği:</strong> sipariş sırasındaki IP adresi, ödeme işlem numarası</li>
      <li><strong>Üyelik (üye olursanız):</strong> ad, soyad, e-posta, telefon, kayıtlı adres; şifreniz geri
      çözülemeyecek şekilde şifrelenerek (hash) saklanır</li>
    </ul>
    ${havaleMi() ? '<p>Ödemeler banka havalesi / EFT ile alınır; kart bilgisi istenmez ve saklanmaz.</p>' : `<p>Kart bilgileriniz SATICI tarafından işlenmez ve saklanmaz; ödeme, lisanslı ödeme kuruluşu iyzico
    tarafından alınır.</p>`}
    <p><strong>Sağlık verileri:</strong> Sağlık durumunuza ilişkin bilgileri (ör. sakatlık, hastalık, ilaç kullanımı)
    paylaşmanız zorunlu değildir. Programınızın güvenli hazırlanması için paylaşmayı seçerseniz bu bilgiler
    özel nitelikli kişisel veridir ve yalnızca bu amaçla, açık rızanıza dayanarak işlenir.</p>
    <h3>İşleme amaçları ve hukuki sebepler</h3>
    <p>Verileriniz; siparişinizin alınması, ödemenin doğrulanması, koçluk hizmetinin sunulması ve sizinle
    iletişim kurulması, fatura düzenlenmesi, talep ve şikâyetlerinizin yanıtlanması ve yasal yükümlülüklerimizin
    yerine getirilmesi amaçlarıyla; KVKK m.5/2 (c) sözleşmenin kurulması ve ifası, (ç) hukuki yükümlülüğün
    yerine getirilmesi ve (f) meşru menfaat hukuki sebeplerine dayanılarak işlenir.</p>
    <h3>Aktarım</h3>
    <p>Verileriniz yalnızca yukarıdaki amaçlar için gerekli olduğu ölçüde; ${havaleMi() ? '' : "ödemenin alınması için iyzico'ya, "}
    muhasebe hizmeti aldığımız mali müşavire ve talep halinde yetkili kamu kurumlarına aktarılır. Sizinle
    iletişim için kullanılan mesajlaşma uygulamalarının (ör. WhatsApp) ve sitenin barındırıldığı sunucu ve
    veritabanı hizmet sağlayıcılarının sunucuları yurt dışında bulunabilir.</p>
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
    <h3>Program iletilmeden önce</h3>
    <p>Kişiye özel programınız size iletilmeden önce ${deger(i.telefon)} numarasından veya ${deger(i.eposta)}
    adresinden bize ulaşarak siparişinizi iptal edebilirsiniz. Ödediğiniz bedel kartınıza iade edilir.</p>
    <h3>Cayma hakkı</h3>
    ${caymaHakkiMetni(i)}
    <h3>Program iletildikten sonra</h3>
    <p>Programınız size iletildikten sonra hizmetin ifasına başlanmış sayılır ve cayma hakkı kullanılamaz.
    Bir sorun yaşarsanız lütfen bize yazın; programınızı birlikte gözden geçirelim.</p>`;
}

function hizmetKosullari() {
  const i = ayarlar.isletme;
  return `
    <h2>Hizmet Koşulları</h2>
    <ul>
      <li>Online koçluk paketleri fiziksel ürün içermez; <strong>kargo gönderimi yoktur</strong>.</li>
      <li>Ödemeniz onaylandıktan sonra sizinle telefon ve/veya e-posta üzerinden iletişime geçeriz.</li>
      <li>Hedefinize ve seviyenize göre kişiye özel programınız hazırlanır ve size iletilir. Paket süresi
      programın iletildiği gün başlar.</li>
      <li>Paket süresi boyunca ilerlemeniz takip edilir ve gerektiğinde programınız güncellenir.</li>
      <li>Siparişinizin durumunu <a href="/siparis.html">siparişim</a> sayfasından ve e-postalarınızdan izleyebilirsiniz.</li>
      <li>Sorularınız için: ${deger(i.telefon)} · ${deger(i.eposta)}</li>
    </ul>
    <h3>Sağlık uyarısı</h3>
    ${saglikUyarisi()}`;
}

function gizlilik() {
  const i = ayarlar.isletme;
  return `
    <h2>Gizlilik ve Çerez Politikası</h2>
    <p>Bu site reklam veya takip amaçlı çerez kullanmaz ve ziyaretçilerin davranışını izlemez.</p>
    <ul>
      <li><strong>Sepet:</strong> Sepetinize eklediğiniz paketler yalnızca kendi tarayıcınızda
      (yerel depolama) tutulur, sunucumuza siz siparişi verene kadar gönderilmez.</li>
      <li><strong>Ödeme formu:</strong> Ödeme sayfasına yazdığınız bilgiler, ödeme yarıda kalırsa
      tekrar yazmanız gerekmesin diye sekmeyi kapatana kadar yalnızca tarayıcınızda tutulur.</li>
      <li><strong>Giriş:</strong> Üye veya işletme yetkilisi giriş yaptığında oturumu açık tutmak için zorunlu bir çerez kullanılır.</li>
      <li><strong>Ödeme:</strong> ${havaleMi() ? 'Ödemeler banka havalesi / EFT ile alınır; sitede kart bilgisi istenmez.' : "Kart bilgileriniz iyzico'nun güvenli ödeme sayfasında girilir; bu sitede saklanmaz."}</li>
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
  'hizmet-kosullari': { baslik: 'Hizmet Koşulları', icerik: hizmetKosullari },
  // Eski adres (Özyurt'tan): açan olursa hizmet koşulları gösterilir
  'teslimat-kosullari': { baslik: 'Hizmet Koşulları', icerik: hizmetKosullari },
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
  h2 { color: #121212; border-bottom: 3px solid #ff5a1f; padding-bottom: 4px; margin-top: 32px; }
  h3 { margin-top: 20px; font-size: 1.05em; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  table.bilgi th { width: 200px; background: #f6f4ef; }
  table.urunler thead th { background: #f6f4ef; }
  hr { margin: 40px 0; }
</style>
</head>
<body>
${icerik}
</body>
</html>`;
}

module.exports = { onBilgilendirme, mesafeliSatis, siparisSozlesmeBelgesi, GENEL_SAYFALAR, belgeHtml };
