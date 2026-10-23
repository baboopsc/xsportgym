'use strict';
// E-posta içerikleri. E-posta programları dış CSS desteklemediği için stiller satır içinde.
const ayarlar = require('./ayarlar');
const { esc, tl } = require('./yardimci');

function takipSayfasi(s) {
  return `${ayarlar.siteUrl}/siparis.html?no=${encodeURIComponent(s.siparis_no)}&k=${encodeURIComponent(s.takip_kodu)}`;
}

function arasTakipLinki(takipNo) {
  return ayarlar.arasTakipUrl.replace('{NO}', encodeURIComponent(takipNo));
}

function buton(url, yazi) {
  return `<a href="${esc(url)}" style="display:inline-block;background:#1f3a28;color:#eef2e9;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:bold;font-size:13px;letter-spacing:1.5px;text-transform:uppercase">${esc(yazi)}</a>`;
}

function kalemTablosu(kalemler, toplamKurus) {
  const satirlar = kalemler.map(k => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #dfe4d8">${esc(k.urun_adi)} <span style="color:#5a6a5c">(${esc(k.secenek_adi)})</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid #dfe4d8;text-align:center">${esc(k.adet)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #dfe4d8;text-align:right">${tl(k.birim_fiyat_kurus * k.adet)}</td>
    </tr>`).join('');
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${satirlar}
      <tr><td style="padding:10px 8px" colspan="2">Kargo</td><td style="padding:10px 8px;text-align:right;color:#45704a"><strong>Ücretsiz</strong></td></tr>
      <tr><td style="padding:10px 8px;border-top:1px solid #1b2a1f" colspan="2"><strong>Toplam</strong></td><td style="padding:10px 8px;text-align:right;border-top:1px solid #1b2a1f;font-family:Georgia,serif;font-size:20px">${tl(toplamKurus)}</td></tr>
    </table>`;
}

function kalemMetni(kalemler, toplamKurus) {
  return kalemler.map(k => `- ${k.urun_adi} (${k.secenek_adi}) x${k.adet}: ${tl(k.birim_fiyat_kurus * k.adet)}`).join('\n')
    + `\nKargo: Ücretsiz\nToplam: ${tl(toplamKurus)}`;
}

function sablon(baslik, govdeHtml) {
  const i = ayarlar.isletme;
  const dolu = d => d && !String(d).startsWith('DOLDURULACAK');
  const altBilgi = [i.unvan, i.telefon, i.eposta].filter(dolu).map(esc).join(' · ');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${esc(baslik)}</title></head>
<body style="margin:0;background:#dee4d6;font-family:Arial,Helvetica,sans-serif;color:#1b2a1f">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">
    <div style="text-align:center;padding:10px 0 22px;color:#1f3a28">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:3px;line-height:1">ÖZYURT</div>
      <div style="font-size:9px;font-weight:bold;letter-spacing:6px;margin-top:6px">FİDANCILIK</div>
    </div>
    <div style="background:#f6f7f2;padding:30px 28px;border-radius:22px;border:1px solid #cfd7c5">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.15;margin:0 0 16px;color:#1f3a28">${esc(baslik)}</h1>
      ${govdeHtml}
    </div>
    <p style="color:#5a6a5c;font-size:12px;text-align:center;margin-top:18px;line-height:1.6">
      ${altBilgi}${dolu(i.adres) ? `<br>${esc(i.adres)}` : ''}
    </p>
  </div>
</body></html>`;
}

const imza = () => `\n\n${ayarlar.isletme.marka}\n${ayarlar.isletme.telefon} · ${ayarlar.isletme.eposta}`;

// ---------- Müşteriye ----------

function siparisAlindi(s, kalemler) {
  const konu = `Siparişiniz alındı (#${s.siparis_no})`;
  const html = sablon('Siparişiniz için teşekkürler!', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişinizin ödemesi alındı. ${esc(ayarlar.isletme.kargoyaVerilmeSuresi)}</p>
    ${kalemTablosu(kalemler, s.toplam_kurus)}
    <p><strong>Teslimat adresi:</strong><br>${esc(s.musteri_ad)} ${esc(s.musteri_soyad)}<br>${esc(s.adres)}<br>${esc(s.ilce)} / ${esc(s.sehir)}</p>
    <p>${buton(takipSayfasi(s), 'Siparişimi takip et')}</p>
    <p style="color:#666;font-size:13px">Ön bilgilendirme formu ve mesafeli satış sözleşmeniz bu e-postanın ekindedir.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişinizin ödemesi alındı. ${ayarlar.isletme.kargoyaVerilmeSuresi}\n\n`
    + `${kalemMetni(kalemler, s.toplam_kurus)}\n\nSiparişinizi takip edin: ${takipSayfasi(s)}\n\n`
    + 'Ön bilgilendirme formu ve mesafeli satış sözleşmeniz bu e-postanın ekindedir.' + imza();
  return { konu, html, metin };
}

function kargoyaVerildi(s) {
  const link = arasTakipLinki(s.kargo_takip_no);
  const konu = `Siparişiniz kargoya verildi (#${s.siparis_no})`;
  const html = sablon('Siparişiniz yola çıktı', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişiniz ${esc(ayarlar.isletme.kargoFirmasi)} ile kargoya verildi.</p>
    <p>Kargo takip numaranız: <strong style="font-size:18px">${esc(s.kargo_takip_no)}</strong></p>
    <p>${buton(link, 'Kargomu takip et')}</p>
    <p style="color:#666;font-size:13px">Fidanlar canlı bitkidir. Paketi teslim aldıktan sonra en kısa sürede açıp sulamanızı öneririz.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişiniz ${ayarlar.isletme.kargoFirmasi} ile kargoya verildi.\n`
    + `Kargo takip numaranız: ${s.kargo_takip_no}\nTakip: ${link}\n\nSipariş sayfanız: ${takipSayfasi(s)}` + imza();
  return { konu, html, metin };
}

function teslimEdildi(s) {
  const konu = `Siparişiniz teslim edildi (#${s.siparis_no})`;
  const html = sablon('Siparişiniz teslim edildi', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişiniz teslim edildi. Bizi tercih ettiğiniz için teşekkür ederiz.</p>
    <p>Fidanlarınızla ilgili sorunuz olursa bize ${esc(ayarlar.isletme.telefon)} numarasından ulaşabilirsiniz.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişiniz teslim edildi. Bizi tercih ettiğiniz için teşekkür ederiz.` + imza();
  return { konu, html, metin };
}

function iptalEdildi(s) {
  const konu = `Siparişiniz iptal edildi (#${s.siparis_no})`;
  const html = sablon('Siparişiniz iptal edildi', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişiniz iptal edildi.</p>
    <p>Ödediğiniz <strong>${tl(s.odenen_kurus || s.toplam_kurus)}</strong> tutarındaki bedel kartınıza iade edilecektir.
    İadenin kartınıza yansıması bankanıza bağlı olarak birkaç iş günü sürebilir.</p>
    <p>Sorunuz olursa bize ${esc(ayarlar.isletme.telefon)} numarasından ulaşabilirsiniz.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişiniz iptal edildi. `
    + `Ödediğiniz ${tl(s.odenen_kurus || s.toplam_kurus)} tutarındaki bedel kartınıza iade edilecektir. `
    + 'İadenin kartınıza yansıması bankanıza bağlı olarak birkaç iş günü sürebilir.' + imza();
  return { konu, html, metin };
}

function iadeEdildi(s) {
  const konu = `İadeniz tamamlandı (#${s.siparis_no})`;
  const html = sablon('İadeniz tamamlandı', `
    <p>Merhaba ${esc(s.musteri_ad)},</p>
    <p><strong>#${esc(s.siparis_no)}</strong> numaralı siparişinizin iadesi işleme alındı. Ürün bedeli kartınıza iade edilecektir.</p>`);
  const metin = `Merhaba ${s.musteri_ad},\n\n#${s.siparis_no} numaralı siparişinizin iadesi işleme alındı. Ürün bedeli kartınıza iade edilecektir.` + imza();
  return { konu, html, metin };
}

// ---------- İşletmeye ----------

function yeniSiparisAdmin(s, kalemler) {
  const konu = `Yeni sipariş #${s.siparis_no} - ${tl(s.toplam_kurus)}`;
  const html = sablon(`Yeni sipariş #${s.siparis_no}`, `
    <p><strong>${esc(s.musteri_ad)} ${esc(s.musteri_soyad)}</strong> · ${esc(s.telefon)} · ${esc(s.email)}</p>
    <p>${esc(s.adres)}<br>${esc(s.ilce)} / ${esc(s.sehir)}</p>
    ${s.musteri_notu ? `<p><strong>Müşteri notu:</strong> ${esc(s.musteri_notu)}</p>` : ''}
    ${kalemTablosu(kalemler, s.toplam_kurus)}
    ${s.stok_uyarisi ? '<p style="color:#b00020"><strong>Stok uyarısı:</strong> Bu siparişteki bir ürünün stoğu yetersizdi. Panelden kontrol edin.</p>' : ''}
    <p>${buton(`${ayarlar.siteUrl}/admin.html`, 'Panelde aç')}</p>`);
  const metin = `Yeni sipariş #${s.siparis_no}\n${s.musteri_ad} ${s.musteri_soyad} · ${s.telefon}\n${s.adres}, ${s.ilce} / ${s.sehir}\n\n`
    + kalemMetni(kalemler, s.toplam_kurus) + `\n\nPanel: ${ayarlar.siteUrl}/admin.html`;
  return { konu, html, metin };
}

function incelemeGerekli(s, neden) {
  const konu = `İncelenmesi gereken ödeme #${s.siparis_no}`;
  const html = sablon(`Sipariş #${s.siparis_no} incelemede`, `
    <p>Bu siparişin ödemesi alındı ama otomatik onaylanmadı:</p>
    <p style="background:#f1e6c6;padding:14px;border-radius:12px">${esc(neden)}</p>
    <p><strong>Ürünü kargoya vermeden önce</strong> iyzico panelinden ödemeyi kontrol edin. Sorun yoksa
    panelden siparişi "Yeni sipariş" durumuna alın, sorun varsa iptal edip iyzico'dan iade edin.</p>
    <p>${buton(`${ayarlar.siteUrl}/admin.html`, 'Panelde aç')}</p>`);
  const metin = `Sipariş #${s.siparis_no} incelemede.\nNeden: ${neden}\n\nÜrünü kargoya vermeden önce iyzico panelinden ödemeyi kontrol edin.\nPanel: ${ayarlar.siteUrl}/admin.html`;
  return { konu, html, metin };
}

module.exports = {
  siparisAlindi, kargoyaVerildi, teslimEdildi, iptalEdildi, iadeEdildi,
  yeniSiparisAdmin, incelemeGerekli, takipSayfasi, arasTakipLinki
};
