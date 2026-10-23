'use strict';
// Testler için sahte iyzico ve sahte e-posta (SMTP) sunucusu.
// Gerçek iyzico'ya bağlanmadan, iyzico kütüphanesinin gerçekten gönderdiği istekleri test ederiz.
const http = require('http');
const net = require('net');

function sahteIyzico() {
  const durum = {
    baslatmaHatasi: false,
    istekler: [],          // initialize istekleri
    sorgular: [],          // retrieve istekleri
    tokenlar: new Map(),   // token -> { senaryo, istek }
    sayac: 0,
    iptaller: [],          // başarılı iptal istekleri
    iadeler: [],           // başarılı iade istekleri
    iptalHatasi: false,    // true: iptal reddedilir (gün sonu geçmiş gibi)
    iadeHatasiKalan: 0     // bu kadar iade isteği reddedilir

  };

  // senaryo: { odeme: 'SUCCESS' | 'FAILURE' | 'BEKLE', fraud: 1, fiyat: null, gecikmeMs: 0 }
  function senaryoAyarla(token, senaryo) {
    const kayit = durum.tokenlar.get(token);
    kayit.senaryo = { ...kayit.senaryo, ...senaryo };
  }

  function cevapla(res, kod, veri) {
    res.writeHead(kod, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(veri));
  }

  let port = 0;
  const sunucu = http.createServer((req, res) => {
    // Tarayıcı testleri için sahte ödeme sayfası: "Öde"ye basınca iyzico gibi siteye geri POST eder
    if (req.method === 'GET' && req.url.startsWith('/sahte-odeme/')) {
      const token = decodeURIComponent(req.url.split('/').pop());
      const kayit = durum.tokenlar.get(token);
      res.writeHead(kayit ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(kayit ? `<!DOCTYPE html><html><body><h1>Sahte iyzico</h1><p>Tutar: ${kayit.istek.paidPrice}</p>
        <form method="POST" action="${kayit.istek.callbackUrl}"><input type="hidden" name="token" value="${token}">
        <button id="ode" type="submit">Öde</button></form></body></html>` : 'yok');
    }
    let govde = '';
    req.on('data', c => { govde += c; });
    req.on('end', () => {
      const yetki = req.headers.authorization || '';
      if (!yetki.startsWith('IYZWSv2 ')) return cevapla(res, 401, { status: 'failure', errorMessage: 'yetki yok' });
      const veri = govde ? JSON.parse(govde) : {};

      if (req.url === '/payment/iyzipos/checkoutform/initialize/auth/ecom') {
        durum.istekler.push(veri);
        if (durum.baslatmaHatasi) return cevapla(res, 200, { status: 'failure', errorCode: '5039', errorMessage: 'sahte hata' });
        const token = `sahte-token-${++durum.sayac}-${Date.now()}`;
        durum.tokenlar.set(token, { istek: veri, senaryo: { odeme: 'SUCCESS', fraud: 1, fiyat: null, gecikmeMs: 0 } });
        return cevapla(res, 200, {
          status: 'success', locale: 'tr', conversationId: veri.conversationId, token,
          tokenExpireTime: 1800, paymentPageUrl: `http://127.0.0.1:${port}/sahte-odeme/${token}`
        });
      }

      if (req.url === '/payment/iyzipos/checkoutform/auth/ecom/detail') {
        durum.sorgular.push(veri);
        const kayit = durum.tokenlar.get(veri.token);
        if (!kayit) return cevapla(res, 200, { status: 'failure', errorCode: '5069', errorMessage: 'Token bulunamadı' });
        const { istek, senaryo } = kayit;
        const gonder = () => {
          if (senaryo.odeme === 'BEKLE') {
            return cevapla(res, 200, { status: 'failure', errorCode: '5172', errorMessage: 'Ödeme henüz tamamlanmadı', token: veri.token });
          }
          const ortak = {
            status: 'success', locale: 'tr', token: veri.token, conversationId: istek.conversationId,
            basketId: istek.basketId, currency: istek.currency, price: Number(senaryo.fiyat ?? istek.price),
            paidPrice: Number(senaryo.fiyat ?? istek.paidPrice)
          };
          if (senaryo.odeme === 'FAILURE') {
            return cevapla(res, 200, { ...ortak, paymentStatus: 'FAILURE', errorMessage: 'Kart limiti yetersiz' });
          }
          return cevapla(res, 200, {
            ...ortak, paymentStatus: 'SUCCESS', paymentId: `2${String(durum.sayac).padStart(7, '0')}`,
            fraudStatus: senaryo.fraud, installment: 1, cardAssociation: 'MASTER_CARD', cardFamily: 'Paraf',
            cardType: 'CREDIT_CARD', lastFourDigits: '0008', binNumber: '55287900',
            itemTransactions: istek.basketItems.map((b, i) => ({
              itemId: b.id, paymentTransactionId: `3${i}${durum.sayac}`, price: Number(b.price),
              paidPrice: Number(b.price), transactionStatus: 2
            }))
          });
        };
        if (senaryo.gecikmeMs) setTimeout(gonder, senaryo.gecikmeMs); else gonder();
        return undefined;
      }
      if (req.url === '/payment/cancel') {
        if (durum.iptalHatasi) return cevapla(res, 200, { status: 'failure', errorCode: '5093', errorMessage: 'İptal süresi geçmiş' });
        if (durum.iptaller.some(i => i.paymentId === veri.paymentId)) return cevapla(res, 200, { status: 'failure', errorMessage: 'Zaten iptal edildi' });
        durum.iptaller.push(veri);
        return cevapla(res, 200, { status: 'success', paymentId: veri.paymentId, price: 1, currency: 'TRY' });
      }

      if (req.url === '/payment/refund') {
        if (durum.iadeHatasiKalan > 0) {
          durum.iadeHatasiKalan--;
          return cevapla(res, 200, { status: 'failure', errorCode: '10000', errorMessage: 'Banka iadeyi reddetti' });
        }
        if (durum.iadeler.some(i => i.paymentTransactionId === veri.paymentTransactionId)) {
          return cevapla(res, 200, { status: 'failure', errorMessage: 'İade edilebilir tutar aşıldı' });
        }
        durum.iadeler.push(veri);
        return cevapla(res, 200, { status: 'success', paymentTransactionId: veri.paymentTransactionId, price: Number(veri.price), currency: 'TRY' });
      }

      cevapla(res, 404, { status: 'failure' });
    });
  });

  return {
    durum, senaryoAyarla,
    baslat: (istenen = 0) => new Promise(r => sunucu.listen(istenen, '127.0.0.1', () => { port = sunucu.address().port; r(port); })),
    kapat: () => new Promise(r => { sunucu.closeAllConnections?.(); sunucu.close(() => r()); })
  };
}

// Çok basit bir SMTP sunucusu: gelen e-postaları bir dizide toplar
function sahteSmtp() {
  const postalar = [];
  let reddet = false;
  const sunucu = net.createServer((soket) => {
    soket.write('220 sahte-smtp ESMTP\r\n');
    let tampon = '';
    let veriModu = false;
    let posta = { kimden: '', kime: [], veri: '' };
    soket.on('data', (parca) => {
      tampon += parca.toString('utf8');
      while (true) {
        if (veriModu) {
          const son = tampon.indexOf('\r\n.\r\n');
          if (son === -1) return;
          posta.veri = tampon.slice(0, son);
          tampon = tampon.slice(son + 5);
          veriModu = false;
          postalar.push(posta);
          posta = { kimden: '', kime: [], veri: '' };
          soket.write('250 OK kaydedildi\r\n');
          continue;
        }
        const satirSonu = tampon.indexOf('\r\n');
        if (satirSonu === -1) return;
        const satir = tampon.slice(0, satirSonu);
        tampon = tampon.slice(satirSonu + 2);
        const komut = satir.slice(0, 4).toUpperCase();
        if (komut === 'EHLO' || komut === 'HELO') soket.write('250-sahte-smtp\r\n250 8BITMIME\r\n');
        else if (komut === 'MAIL') {
          if (reddet) { soket.write('451 gecici hata\r\n'); continue; }
          posta.kimden = satir; soket.write('250 OK\r\n');
        } else if (komut === 'RCPT') { posta.kime.push(satir); soket.write('250 OK\r\n'); }
        else if (komut === 'DATA') { veriModu = true; soket.write('354 devam\r\n'); }
        else if (komut === 'QUIT') { soket.write('221 hoşçakal\r\n'); soket.end(); return; }
        else soket.write('250 OK\r\n');
      }
    });
    soket.on('error', () => {});
  });
  return {
    postalar,
    reddetAyarla: d => { reddet = d; },
    baslat: () => new Promise(r => sunucu.listen(0, '127.0.0.1', () => r(sunucu.address().port))),
    kapat: () => new Promise(r => sunucu.close(() => r()))
  };
}

// Ham e-postayı (MIME) çöz: { html, metin, ekler: [{ ad, icerik }] }
function postaCoz(ham) {
  const qp = s => Buffer.from(
    s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1'
  ).toString('utf8');
  const sonuc = { html: '', metin: '', ekler: [] };
  const sinir = /boundary="?([^";\r\n]+)"?/i;
  function parcala(govde, basliklar) {
    const m = sinir.exec(basliklar);
    if (m) {
      for (const parca of govde.split(`--${m[1]}`).slice(1)) {
        if (parca.startsWith('--')) continue;
        const ayrim = parca.indexOf('\r\n\r\n');
        parcala(parca.slice(ayrim + 4), parca.slice(0, ayrim));
      }
      return;
    }
    const kodlama = (/content-transfer-encoding:\s*([\w-]+)/i.exec(basliklar) || [])[1] || '7bit';
    const icerik = /base64/i.test(kodlama)
      ? Buffer.from(govde.replace(/\s/g, ''), 'base64').toString('utf8')
      : /quoted-printable/i.test(kodlama) ? qp(govde) : govde;
    const ek = /content-disposition:\s*attachment[^]*?filename="?([^";\r\n]+)"?/i.exec(basliklar);
    if (ek) sonuc.ekler.push({ ad: ek[1], icerik });
    else if (/content-type:\s*text\/html/i.test(basliklar)) sonuc.html += icerik;
    else sonuc.metin += icerik;
  }
  const ayrim = ham.indexOf('\r\n\r\n');
  parcala(ham.slice(ayrim + 4), ham.slice(0, ayrim));
  return sonuc;
}

function bosPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

module.exports = { sahteIyzico, sahteSmtp, bosPort, postaCoz };
