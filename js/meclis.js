// Bir "Meclis turu": soru bütün yapay zekalara aynı anda gider, cevaplar toplanır,
// başkan model cevapları özetleyip kimin hangi çözümde birleştiğini çıkarır.
// İstenirse "İncelet" ile her model diğerlerinin cevaplarını inceler ve oy verir.

import { sor, KotaHatasi, AnahtarHatasi } from './saglayicilar.js';
import { durumAyarla, dinlenmeyeAl, servisEtiketi } from './durum.js';
import { jsonCikar, kirp } from './metin.js';

const CEVAP_SISTEMI = `Sen "Meclis" adlı bir uygulamada aynı soruyu cevaplayan birkaç yapay zekadan birisin.
Kullanıcı kod bilmiyor; fikir üretiyor ve kodu yapay zekalara yazdırıyor.
Kurallar:
- Türkçe, sade ve net yaz. Teknik terim kullanırsan kısaca açıkla.
- Önce 2-3 cümlede asıl cevabı ya da çözümü ver, sonra gerekirse adımları ve kodu ekle.
- Kod verirsen eksiksiz ve çalışır halde ver; nereye konacağını açıkça söyle.
- Emin olmadığın yeri açıkça belirt, uydurma.`;

const BASKAN_SISTEMI = `Sen "Meclis"in başkanısın. Birkaç yapay zeka aynı soruya cevap verdi.
Görevin cevapları tarafsızca karşılaştırıp kod bilmeyen kullanıcıya sade Türkçe bir özet çıkarmak.
SADECE geçerli JSON döndür, başka hiçbir şey yazma.`;

const INCELEME_SISTEMI = `Sen "Meclis"te bir incelemecisin. Aynı soruya birkaç yapay zeka cevap verdi.
Cevapları dikkatle incele: hatalı bilgi, çalışmayacak kod, eksik adım, risk ara.
Kendi cevabın da listede olabilir; tarafsız ol.
SADECE geçerli JSON döndür, başka hiçbir şey yazma.`;

export function kullanilabilirServisler(servisler) {
  return servisler.filter((s) => servisEtiketi(s).kullanilir);
}

function hatayiIsle(servis, h) {
  if (h instanceof KotaHatasi) {
    dinlenmeyeAl(servis.id, h.bekleSaniye);
    durumAyarla(servis.id, 'doldu', h.message);
  } else if (h instanceof AnahtarHatasi) {
    durumAyarla(servis.id, 'anahtar', h.message);
  } else {
    durumAyarla(servis.id, 'hata', h?.message || String(h));
  }
}

function soruMetni(soru, baglam) {
  if (!baglam) return soru;
  return `Önceki soru: ${baglam.oncekiSoru}

Kullanıcının bu soruya gelen cevaplar arasından seçtiği cevap (${baglam.secilenAd}):
${kirp(baglam.secilenMetin, 4000)}

Yeni soru (seçilen cevaptan devam ederek cevapla):
${soru}`;
}

// Soru bütün kullanılabilir servislere aynı anda gider.
export async function turBaslat({ soru, baglam, servisler, zamanAsimi = 90, ilerleme = () => {} }) {
  const katilanlar = kullanilabilirServisler(servisler);
  const mesajlar = [
    { rol: 'sistem', icerik: CEVAP_SISTEMI },
    { rol: 'kullanici', icerik: soruMetni(soru, baglam) }
  ];
  const tur = {
    id: `tur-${Date.now()}`,
    zaman: new Date().toISOString(),
    soru,
    baglam: baglam ? { oncekiSoru: baglam.oncekiSoru, secilenAd: baglam.secilenAd } : null,
    cevaplar: [],
    ozet: null,
    inceleme: null,
    secilen: null
  };

  await Promise.all(katilanlar.map(async (s) => {
    const bas = performance.now();
    durumAyarla(s.id, 'bekliyor');
    ilerleme(s, 'bekliyor');
    try {
      const { metin, model, yeniModel } = await sor(s, mesajlar, { zamanAsimi });
      durumAyarla(s.id, 'hazir');
      const cevap = { servisId: s.id, ad: s.ad, model, metin, sure: Math.round((performance.now() - bas) / 1000) };
      if (yeniModel) cevap.yeniModel = yeniModel;
      tur.cevaplar.push(cevap);
      ilerleme(s, 'tamam');
    } catch (h) {
      hatayiIsle(s, h);
      tur.cevaplar.push({ servisId: s.id, ad: s.ad, model: s.model, hata: h?.message || String(h) });
      ilerleme(s, 'hata', h?.message);
    }
  }));

  // Sıra servis listesindeki sıraya göre olsun (cevap geliş sırasına göre değil).
  const sira = servisler.map((s) => s.id);
  tur.cevaplar.sort((a, b) => sira.indexOf(a.servisId) - sira.indexOf(b.servisId));
  return tur;
}

function basariliCevaplar(tur) { return tur.cevaplar.filter((c) => !c.hata); }

function cevapListesi(cevaplar, uzunluk) {
  return cevaplar.map((c) => `[${c.ad}]\n${kirp(c.metin, uzunluk)}`).join('\n\n---\n\n');
}

// Başkan olarak sırayla denenecek servisler: önce kullanıcının seçtiği, sonra bu turda cevap verenler.
function baskanAdaylari(tur, servisler, baskanId) {
  const cevapVerenler = new Set(basariliCevaplar(tur).map((c) => c.servisId));
  const adaylar = kullanilabilirServisler(servisler).filter((s) => cevapVerenler.has(s.id));
  adaylar.sort((a, b) => (b.id === baskanId) - (a.id === baskanId));
  return adaylar;
}

export async function ozetle(tur, servisler, baskanId) {
  const cevaplar = basariliCevaplar(tur);
  if (cevaplar.length === 0) return null;
  const adlar = cevaplar.map((c) => c.ad);
  const istek = `Soru:
${tur.soru}

Cevaplar:
${cevapListesi(cevaplar, 3500)}

Şu JSON'u doldur (model adları tam olarak şunlardan biri olmalı: ${adlar.join(', ')}):
{
  "ortak_cozum": "Cevapların çoğunun birleştiği çözüm, 2-3 sade cümle",
  "destekleyenler": ["bu çözümü savunan model adları"],
  "farkli_gorusler": [{"model": "ad", "ozet": "farklı düşünen modelin görüşü, tek cümle"}],
  "dikkat": [{"model": "ad", "not": "bir modelin dikkat çektiği risk ya da uyarı, tek cümle"}],
  "kisa_ozetler": {"model adı": "o modelin cevabı, en fazla 12 kelime"}
}`;
  for (const baskan of baskanAdaylari(tur, servisler, baskanId).slice(0, 2)) {
    try {
      const { metin } = await sor(baskan, [
        { rol: 'sistem', icerik: BASKAN_SISTEMI },
        { rol: 'kullanici', icerik: istek }
      ], { zamanAsimi: 90, sicaklik: 0.2 });
      const j = jsonCikar(metin);
      if (!j || typeof j.ortak_cozum !== 'string') continue;
      const gecerli = (ad) => adlar.includes(ad);
      tur.ozet = {
        baskan: baskan.ad,
        ortakCozum: j.ortak_cozum,
        destekleyenler: (Array.isArray(j.destekleyenler) ? j.destekleyenler : []).filter(gecerli),
        farkliGorusler: (Array.isArray(j.farkli_gorusler) ? j.farkli_gorusler : []).filter((g) => gecerli(g?.model) && g.ozet),
        dikkat: (Array.isArray(j.dikkat) ? j.dikkat : []).filter((d) => gecerli(d?.model) && d.not),
        kisaOzetler: j.kisa_ozetler && typeof j.kisa_ozetler === 'object' ? j.kisa_ozetler : {},
        toplam: cevaplar.length
      };
      return tur.ozet;
    } catch (h) {
      hatayiIsle(baskan, h);
    }
  }
  return null;
}

// Her model bütün cevapları inceler, sorunları bulur ve en iyi cevaba oy verir.
export async function incelet(tur, servisler, ilerleme = () => {}) {
  const cevaplar = basariliCevaplar(tur);
  if (cevaplar.length < 2) return null;
  const adlar = cevaplar.map((c) => c.ad);
  const istek = `Soru:
${tur.soru}

Cevaplar:
${cevapListesi(cevaplar, 2500)}

Şu JSON'u doldur (cevap adları tam olarak şunlardan biri olmalı: ${adlar.join(', ')}):
{
  "sorunlar": [{"cevap": "ad", "sorun": "bulduğun hata ya da eksik, tek sade cümle"}],
  "en_iyi": "en doğru ve kullanışlı cevabın adı",
  "neden": "neden o cevap, tek cümle"
}`;
  const incelemeciler = kullanilabilirServisler(servisler);
  const oylar = {};
  const sorunlar = [];
  const gerekceler = [];
  let katilan = 0;

  await Promise.all(incelemeciler.map(async (s) => {
    durumAyarla(s.id, 'bekliyor');
    ilerleme(s, 'bekliyor');
    try {
      const { metin } = await sor(s, [
        { rol: 'sistem', icerik: INCELEME_SISTEMI },
        { rol: 'kullanici', icerik: istek }
      ], { zamanAsimi: 90, sicaklik: 0.2 });
      durumAyarla(s.id, 'hazir');
      const j = jsonCikar(metin);
      if (!j) { ilerleme(s, 'hata', 'Anlaşılır bir inceleme döndürmedi'); return; }
      katilan++;
      if (adlar.includes(j.en_iyi)) {
        oylar[j.en_iyi] = (oylar[j.en_iyi] || 0) + 1;
        if (j.neden) gerekceler.push({ inceleyen: s.ad, secim: j.en_iyi, neden: String(j.neden) });
      }
      for (const x of Array.isArray(j.sorunlar) ? j.sorunlar : []) {
        if (adlar.includes(x?.cevap) && x.sorun) sorunlar.push({ cevap: x.cevap, sorun: String(x.sorun), inceleyen: s.ad });
      }
      ilerleme(s, 'tamam');
    } catch (h) {
      hatayiIsle(s, h);
      ilerleme(s, 'hata', h?.message);
    }
  }));

  if (katilan === 0) return null;
  tur.inceleme = { oylar, sorunlar, gerekceler, katilan, zaman: new Date().toISOString() };
  return tur.inceleme;
}
