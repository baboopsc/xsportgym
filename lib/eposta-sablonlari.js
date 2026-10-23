'use strict';
// E-posta içerikleri (online koçluk). E-posta programları dış CSS desteklemediği için stiller satır içinde.
const ayarlar = require('./ayarlar');
const { esc, tl } = require('./yardimci');

const RENK = { zemin: '#f2efe9', kart: '#ffffff', yazi: '#121212', soluk: '#6b665e', cizgi: '#e3dfd6', vurgu: '#ff5a1f' };

function takipSayfasi(s) {
  return `${ayarlar.siteUrl}/siparis.html?no=${encodeURIComponent(s.siparis_no)}&k=${encodeURIComponent(s.takip_kodu)}`;
}

// Özyurt'tan kalan kargo takip linki (online koçlukta kullanılmıyor, eski kayıtlar için duruyor)
function arasTakipLinki(takipNo) {
  return ayarlar.arasTakipUrl.replace('{NO}', encodeURIComponent(takipNo));
}

function buton(url, yazi) {
  return `<a href="${esc(url)}" style="display:inline-block;background:${RENK.vurgu};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:bold;font-size:13px;letter-spacing:1.5px;text-transform:uppercase">${esc(yazi)}</a>`;
}

function kalemTablosu(kalemler, toplamKurus) {
  const satirlar = kalemler.map(k => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid ${RENK.cizgi}">${esc(k.urun_adi)} <span style="color:${RENK.soluk}">(${esc(k.secenek_adi)})</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid ${RENK.cizgi};text-align:right">${tl(k.birim_fiyat_kurus * k.adet)}</td>
    </tr>`).join('');
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${satirlar}
      <tr><td style="padding:10px 8px;border-top:2px solid ${RENK.yazi}"><strong>Toplam</strong></td><td style="padding:10px 8px;text-align:right;border-top:2px solid ${RENK.yazi};font-size:20px"><strong>${tl(toplamKurus)}</strong></td></tr>
    </table>`;
}

function kalemMetni(kalemler, toplamKurus) {
  return kalemler.map(k => `- ${k.urun_adi} (${k.secenek_adi}): ${tl(k.birim_fiyat_kurus * k.adet)}`).join('\n')
    + `\nToplam: ${tl(toplamKurus)}`;
}

function sablon(baslik, govdeHtml) {
  const i = ayarlar.isletme;
  const dolu = d => d && !String(d).startsWith('DOLDURULACAK');
  const altBilgi = [i.unvan, i.telefon, i.eposta].filter(dolu).map(esc).join(' · ');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${esc(baslik)}</title></head>
<body style="margin:0;background:${RENK.zemin};font-family:Arial,Helvetica,sans-serif;color:${RENK.yazi}">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">
    <div style="text-align:center;padding:10px 0 22px;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:28px;letter-spacing:1px;line-height:1">
      <span style="color:${RENK.yazi}">XSPORT</span><span style="color:${RENK.vurgu}">GYM</span>
    </div>
    <div style="background:${RENK.kart};padding:30px 28px;border-radius:22px;border:1px solid ${RENK.cizgi}">
      <h1 style="font-family:Impact,'Arial Narrow',Arial,sans-serif;font-weight:normal;font-size:30px;line-height:1.1;margin:0 0 16px;text-transform:uppercase">${esc(baslik)}</h1>
      ${govdeHtml}
    </div>
    <p style="color:${RENK.soluk};font-size:12px;text-align:center;margin-top:18px;line-height:1.6">
      ${altBilgi}${dolu(i.adres) ? `<br>${esc(i.adres)}` : ''}
    </p>
  </div>
</body></html>`;
}

const imza = () => {
  const i = ayarlar.isletme;
  const dolu = d => d && !String(d).startsWith('DOLDURULACAK');
  return `\n\n${i.marka}\n${[i.telefon, i.eposta].filter(dolu).join(' · ')}`;
};

// ---------- Müşteriye ----------

function siparisAlindi(s, kalemler) {
  const konu = `Ödemen alındı, hoş geldin! (#${s.siparis_no})`;
  const html = sablon('Aramıza hoş geldin!', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı online koçluk siparişinin ödemesi alındı.
    En kısa sürede seninle <strong>${esc(s.telefon)}</strong> numarası ya da bu e-posta üzerinden iletişime geçip
    hedefini konuşacağız ve programını hazırlayacağız.</p>
    ${kalemTablosu(kalemler, s.toplam_kurus)}
    <p>${buton(takipSayfasi(s), 'Siparişimi gör')}</p>
    <p style="color:${RENK.soluk};font-size:13px">Ön bilgilendirme formu ve mesafeli satış sözleşmen bu e-postanın ekindedir.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı online koçluk siparişinin ödemesi alındı. `
    + 'En kısa sürede seninle iletişime geçip hedefini konuşacağız ve programını hazırlayacağız.\n\n'
    + `${kalemMetni(kalemler, s.toplam_kurus)}\n\nSiparişin: ${takipSayfasi(s)}\n\n`
    + 'Ön bilgilendirme formu ve mesafeli satış sözleşmen bu e-postanın ekindedir.' + imza();
  return { konu, html, metin };
}

// Panelde "Koçluk sürüyor" durumuna alınınca gider
function koclukBasladi(s) {
  const konu = `Koçluğun başladı! (#${s.siparis_no})`;
  const html = sablon('Koçluğun başladı', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı koçluk paketin için programın hazır ve sana iletildi.
    Bundan sonra ilerlemeni birlikte takip edeceğiz.</p>
    <p>Antrenman ya da beslenmeyle ilgili aklına takılan her şeyi bize yazabilirsin.</p>
    <p>${buton(takipSayfasi(s), 'Siparişimi gör')}</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\nProgramın hazır ve sana iletildi. Bundan sonra ilerlemeni birlikte takip edeceğiz.\n`
    + `Siparişin: ${takipSayfasi(s)}` + imza();
  return { konu, html, metin };
}

// Panelde "Tamamlandı" durumuna alınınca gider
function teslimEdildi(s) {
  const konu = `Koçluk süren tamamlandı (#${s.siparis_no})`;
  const html = sablon('Tebrikler!', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı koçluk paketinin süresi tamamlandı. Emeğin için tebrikler, bizi tercih ettiğin için teşekkür ederiz.</p>
    <p>Devam etmek istersen yeni paketlere sitemizden göz atabilirsin.</p>
    <p>${buton(`${ayarlar.siteUrl}/paketler.html`, 'Paketlere göz at')}</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı koçluk paketinin süresi tamamlandı. Bizi tercih ettiğin için teşekkür ederiz.\n`
    + `Paketler: ${ayarlar.siteUrl}/paketler.html` + imza();
  return { konu, html, metin };
}

function iptalEdildi(s) {
  const konu = `Siparişin iptal edildi (#${s.siparis_no})`;
  const html = sablon('Siparişin iptal edildi', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişin iptal edildi.</p>
    <p>Ödediğin <strong>${tl(s.odenen_kurus || s.toplam_kurus)}</strong> tutarındaki bedel kartına iade edilecek.
    İadenin kartına yansıması bankana bağlı olarak birkaç iş günü sürebilir.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişin iptal edildi. `
    + `Ödediğin ${tl(s.odenen_kurus || s.toplam_kurus)} tutarındaki bedel kartına iade edilecek. `
    + 'İadenin kartına yansıması bankana bağlı olarak birkaç iş günü sürebilir.' + imza();
  return { konu, html, metin };
}

function iadeEdildi(s) {
  const konu = `İaden tamamlandı (#${s.siparis_no})`;
  const html = sablon('İaden tamamlandı', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişinin iadesi işleme alındı. Ödediğin bedel kartına iade edilecek.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişinin iadesi işleme alındı. Ödediğin bedel kartına iade edilecek.` + imza();
  return { konu, html, metin };
}

// ---------- İşletmeye (Selen'e) ----------

function yeniSiparisAdmin(s, kalemler) {
  const konu = `Yeni öğrenci: ${s.musteri_ad} ${s.musteri_soyad} - ${tl(s.toplam_kurus)} (#${s.siparis_no})`;
  const html = sablon('Yeni öğrenci!', `
    <p style="color:${RENK.soluk};margin:0 0 8px">Sipariş <strong style="color:${RENK.yazi}">#${esc(s.siparis_no)}</strong></p>
    <p><strong>${esc(s.musteri_ad)} ${esc(s.musteri_soyad)}</strong> · ${esc(s.telefon)} · ${esc(s.email)}</p>
    <p style="color:${RENK.soluk}"><strong>Fatura adresi:</strong> ${esc(s.adres)}, ${esc(s.ilce)} / ${esc(s.sehir)}</p>
    ${s.musteri_notu ? `<p style="background:${RENK.zemin};padding:14px;border-radius:12px"><strong>Hedefi:</strong> ${esc(s.musteri_notu)}</p>` : ''}
    ${kalemTablosu(kalemler, s.toplam_kurus)}
    <p>Öğrenciyle iletişime geçince panelden durumu <strong>"Program hazırlanıyor"</strong>, programı gönderince
    <strong>"Koçluk sürüyor"</strong> yapabilirsin.</p>
    <p>${buton(`${ayarlar.siteUrl}/admin.html`, 'Panelde aç')}</p>`);
  const metin = `Yeni öğrenci #${s.siparis_no}\n${s.musteri_ad} ${s.musteri_soyad} · ${s.telefon} · ${s.email}\n`
    + `${s.musteri_notu ? `Hedefi: ${s.musteri_notu}\n` : ''}\n`
    + kalemMetni(kalemler, s.toplam_kurus) + `\n\nPanel: ${ayarlar.siteUrl}/admin.html`;
  return { konu, html, metin };
}

function incelemeGerekli(s, neden) {
  const konu = `İncelenmesi gereken ödeme #${s.siparis_no}`;
  const html = sablon(`Ödeme #${s.siparis_no} incelemede`, `
    <p>Bu siparişin ödemesi alındı ama otomatik onaylanmadı:</p>
    <p style="background:#fbe7c6;padding:14px;border-radius:12px">${esc(neden)}</p>
    <p><strong>Koçluğa başlamadan önce</strong> iyzico panelinden ödemeyi kontrol et. Sorun yoksa
    panelden siparişi "Yeni öğrenci" durumuna al, sorun varsa iptal edip parayı iade et.</p>
    <p>${buton(`${ayarlar.siteUrl}/admin.html`, 'Panelde aç')}</p>`);
  const metin = `Sipariş #${s.siparis_no} incelemede.\nNeden: ${neden}\n\nKoçluğa başlamadan önce iyzico panelinden ödemeyi kontrol et.\nPanel: ${ayarlar.siteUrl}/admin.html`;
  return { konu, html, metin };
}

module.exports = {
  siparisAlindi, koclukBasladi, teslimEdildi, iptalEdildi, iadeEdildi,
  yeniSiparisAdmin, incelemeGerekli, takipSayfasi, arasTakipLinki
};
