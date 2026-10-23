'use strict';
// E-postalar önce veritabanındaki kuyruğa yazılır, sonra arka planda gönderilir.
// SMTP o an çalışmasa bile e-posta kaybolmaz; artan aralıklarla tekrar denenir.
const nodemailer = require('nodemailer');
const ayarlar = require('./ayarlar');
const { pool } = require('./db');

const MAKS_DENEME = 7;
const BEKLEME_DK = [1, 5, 15, 60, 180, 720]; // denemeler arası bekleme (dakika)

let tasiyici = null;
function tasiyiciAl() {
  if (!ayarlar.eposta.smtpHost) return null;
  if (!tasiyici) {
    tasiyici = nodemailer.createTransport({
      host: ayarlar.eposta.smtpHost,
      port: ayarlar.eposta.smtpPort,
      secure: ayarlar.eposta.smtpGuvenli,
      auth: ayarlar.eposta.smtpKullanici
        ? { user: ayarlar.eposta.smtpKullanici, pass: ayarlar.eposta.smtpSifre }
        : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000
    });
  }
  return tasiyici;
}

// db: pool veya işlem (transaction) içindeki client.
// anahtar: aynı e-postanın iki kez kuyruğa girmesini engeller (ör. "siparis-alindi:100005").
async function kuyrugaEkle(db, { alici, konu, html, metin, ekler = [], siparisId = null, anahtar = null }) {
  if (!alici) return false;
  const { rowCount } = await db.query(`
    INSERT INTO eposta_kuyrugu (alici, konu, html, metin, ekler, siparis_id, anahtar)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (anahtar) WHERE anahtar IS NOT NULL DO NOTHING
  `, [alici, konu, html, metin, JSON.stringify(ekler), siparisId, anahtar]);
  return rowCount === 1;
}

async function birEpostaGonder(is) {
  const t = tasiyiciAl();
  if (!t) {
    console.log(`\n[E-POSTA — SMTP ayarlı değil, gönderilmedi]\n  Alıcı: ${is.alici}\n  Konu: ${is.konu}\n`);
    return 'SMTP ayarlı değil, sadece terminale yazıldı';
  }
  await t.sendMail({
    from: ayarlar.eposta.gonderen,
    to: is.alici,
    subject: is.konu,
    text: is.metin,
    html: is.html,
    attachments: (is.ekler || []).map(e => ({
      filename: e.dosyaAdi,
      content: e.icerik,
      contentType: e.tur || 'text/html; charset=utf-8'
    }))
  });
  return null;
}

// Sırası gelen e-postaları gönder. Birden fazla sunucu çalışsa bile aynı e-posta iki kez gönderilmez
// (FOR UPDATE SKIP LOCKED ile her e-posta tek bir işçiye ayrılır).
async function bekleyenleriGonder(limit = 10) {
  const { rows: isler } = await pool.query(`
    UPDATE eposta_kuyrugu
    SET deneme = deneme + 1, sonraki_deneme = NOW() + INTERVAL '10 minutes'
    WHERE id IN (
      SELECT id FROM eposta_kuyrugu
      WHERE gonderim IS NULL AND deneme < $1 AND sonraki_deneme <= NOW()
      ORDER BY id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [MAKS_DENEME, limit]);

  let gonderilen = 0;
  let enYakinTekrarMs = null;

  for (const is of isler) {
    try {
      const not = await birEpostaGonder(is);
      await pool.query('UPDATE eposta_kuyrugu SET gonderim = NOW(), son_hata = $2 WHERE id = $1', [is.id, not]);
      if (!not) console.log(`✉ E-posta gönderildi: "${is.konu}" → ${is.alici}`);
      gonderilen++;
    } catch (hata) {
      const mesaj = String(hata && hata.message || hata).slice(0, 500);
      const bitti = is.deneme >= MAKS_DENEME;
      const beklemeDk = BEKLEME_DK[Math.min(is.deneme - 1, BEKLEME_DK.length - 1)];
      await pool.query(`
        UPDATE eposta_kuyrugu SET son_hata = $2, sonraki_deneme = NOW() + ($3 || ' minutes')::interval WHERE id = $1
      `, [is.id, mesaj, String(beklemeDk)]);
      console.error(`E-posta gönderilemedi (#${is.id}, ${is.deneme}. deneme): ${mesaj}`);
      if (bitti && is.siparis_id) {
        await pool.query(
          `INSERT INTO siparis_olaylari (siparis_id, olay, detay) VALUES ($1, 'eposta-gonderilemedi', $2)`,
          [is.siparis_id, JSON.stringify({ alici: is.alici, konu: is.konu, hata: mesaj })]
        );
      } else if (!bitti) {
        const ms = beklemeDk * 60 * 1000;
        enYakinTekrarMs = enYakinTekrarMs === null ? ms : Math.min(enYakinTekrarMs, ms);
      }
    }
  }
  return { islenen: isler.length, gonderilen, enYakinTekrarMs, dahaVar: isler.length === limit };
}

module.exports = { kuyrugaEkle, bekleyenleriGonder };
