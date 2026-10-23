'use strict';
// iyzico ile konuşan tek dosya. Diğer dosyalar iyzico kütüphanesini doğrudan kullanmaz.
const Iyzipay = require('iyzipay');
const ayarlar = require('./ayarlar');

let istemci = null;
function istemciAl() {
  if (!istemci) {
    istemci = new Iyzipay({
      apiKey: ayarlar.iyzico.apiKey,
      secretKey: ayarlar.iyzico.secretKey,
      uri: ayarlar.iyzico.baseUrl
    });
  }
  return istemci;
}

// iyzico cevap vermezse sonsuza kadar beklemeyelim
function cagir(kaynak, metot, istek) {
  return new Promise((resolve, reject) => {
    let bitti = false;
    const sayac = setTimeout(() => {
      if (bitti) return;
      bitti = true;
      reject(Object.assign(new Error('iyzico zaman aşımı'), { kod: 'ZAMAN_ASIMI' }));
    }, ayarlar.iyzico.zamanAsimiMs);

    istemciAl()[kaynak][metot](istek, (hata, sonuc) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(sayac);
      if (hata) return reject(hata);
      if (!sonuc || typeof sonuc !== 'object') return reject(new Error('iyzico boş cevap döndü'));
      resolve(sonuc);
    });
  });
}

// Ödeme sayfası oluştur. Dönen paymentPageUrl'e müşteri yönlendirilir.
function odemeFormuBaslat(istek) {
  return cagir('checkoutFormInitialize', 'create', { locale: Iyzipay.LOCALE.TR, ...istek });
}

// Ödemenin GERÇEK sonucunu iyzico'dan sor. Tarayıcıdan gelen hiçbir bilgiye güvenilmez.
function odemeSonucuGetir(token) {
  return cagir('checkoutForm', 'retrieve', { locale: Iyzipay.LOCALE.TR, token });
}

// Ödemeyi tamamen iptal et (sadece ödemenin yapıldığı gün, banka gün sonu yapmadan önce çalışır)
function odemeyiIptalEt({ paymentId, conversationId, ip }) {
  return cagir('cancel', 'create', { locale: Iyzipay.LOCALE.TR, paymentId, conversationId, ip });
}

// Sepetteki bir kalemin parasını iade et (365 gün içinde her zaman çalışır)
function kalemiIadeEt({ paymentTransactionId, price, conversationId, ip }) {
  return cagir('refund', 'create', {
    locale: Iyzipay.LOCALE.TR, paymentTransactionId, price, conversationId, ip, currency: Iyzipay.CURRENCY.TRY
  });
}

module.exports = {
  odemeFormuBaslat,
  odemeSonucuGetir,
  odemeyiIptalEt,
  kalemiIadeEt,
  SABITLER: {
    TRY: Iyzipay.CURRENCY.TRY,
    URUN: Iyzipay.PAYMENT_GROUP.PRODUCT,
    FIZIKSEL: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
    SANAL: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL
  }
};
