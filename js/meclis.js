// Bir "Meclis turu": istek bütün yapay zekalara aynı anda gider, cevaplar toplanır,
// başkan model cevapları özetleyip kimin hangi çözümde birleştiğini çıkarır.
// İstenirse "İncelet" ile her model diğerlerinin cevaplarını inceler ve oy verir.

import { sor, KotaHatasi, AnahtarHatasi } from './saglayicilar.js';
import { durumAyarla, dinlenmeyeAl, servisEtiketi } from './durum.js';
import { jsonCikar, kirp } from './metin.js';
import { dosyalariMetneCevir } from './dosyalar.js';

export const CEVAP_SISTEMI = `Sen "Meclis" adlı bir uygulamada aynı soruyu cevaplayan birkaç yapay zekadan birisin.
Kullanıcı kod bilmiyor; fikir üretiyor ve kodu yapay zekalara yazdırıyor.
Kurallar:
- Türkçe, sade ve net yaz. Teknik terim kullanırsan kısaca açıkla.
- Önce 2-3 cümlede asıl cevabı ya da çözümü ver, sonra gerekirse adımları ve kodu ekle.
- Kod verirsen eksiksiz ve çalışır halde ver; nereye konacağını açıkça söyle.
- Emin olmadığın yeri açıkça belirt, uydurma.`;

const BASKAN_SISTEMI = `Sen "Meclis"in başkanısın. Birkaç yapay zeka aynı isteğe cevap verdi.
Görevin cevapları tarafsızca karşılaştırıp kod bilmeyen kullanıcıya sade Türkçe bir özet çıkarmak.
SADECE geçerli JSON döndür, başka hiçbir şey yazma.`;

const INCELEME_SISTEMI = `Sen "Meclis"te bir incelemecisin. Aynı isteğe birkaç yapay zeka cevap verdi.
Cevapları dikkatle incele: hatalı bilgi, çalışmayacak kod, eksik adım, risk ara.
Kendi cevabın da listede olabilir; tarafsız ol.
SADECE geçerli JSON döndür, başka hiçbir şey yazma.`;

// secenek.siteler: site katılımcıları (eklenti) bu tura katılsın mı
// secenek.onemli: "önemli tur" — Claude gibi kısıtlı siteler de katılsın
export function kullanilabilirServisler(servisler, secenek = {}) {
  return servisler.filter((s) => {
    if (!servisEtiketi(s).kullanilir) return false;
    if (s.tur === 'site') return !!secenek.siteler && (!s.onemli || !!secenek.onemli);
    return true;
  });
}

export function hatayiIsle(servis, h) {
  if (h instanceof KotaHatasi) {
    dinlenmeyeAl(servis.id, h.bekleSaniye);
    durumAyarla(servis.id, 'doldu', h.message);
  } else if (h instanceof AnahtarHatasi) {
    durumAyarla(servis.id, 'anahtar', h.message);
  } else if (servis.tur !== 'site' && /^Servise bağlanılamadı/.test(h?.message || '')) {
    // Tarayıcıdan bağlantıya izin vermeyen servis her turda boşuna denenmesin.
    dinlenmeyeAl(servis.id, 30 * 60, 'baglanti');
    durumAyarla(servis.id, 'hata', h.message);
  } else {
    durumAyarla(servis.id, 'hata', h?.message || String(h));
  }
}

export const sinirAl = (servis) => servis.sinir || (servis.tur === 'site' ? 30000 : 60000);

// Normal bir soru için her servise gidecek mesajlar (dosyalar servisin sınırına göre kısaltılır).
export function soruMesajlari(servis, { soru, baglam, ekler, projeBaglami }) {
  const sinir = sinirAl(servis);
  const parcalar = [];
  if (projeBaglami) parcalar.push(kirp(projeBaglami, Math.floor(sinir * 0.25)));
  if (baglam) {
    parcalar.push(`Önceki soru: ${baglam.oncekiSoru}\n\nKullanıcının bu soruya gelen cevaplar arasından seçtiği cevap (${baglam.secilenAd}):\n${kirp(baglam.secilenMetin, Math.min(6000, Math.floor(sinir * 0.2)))}`);
  }
  if (ekler?.dosyalar?.length) {
    const kalan = Math.max(3000, sinir - parcalar.join('').length - soru.length - 2000);
    const { metin, kisaltildi } = dosyalariMetneCevir(ekler.dosyalar, kalan);
    parcalar.push(`Kullanıcının eklediği dosyalar${kisaltildi ? ' (bazı kısımlar yer sınırı nedeniyle kısaltıldı)' : ''}:\n\n${metin}`);
  }
  const resimVar = ekler?.resimler?.length;
  if (resimVar && !servis.resim) parcalar.push(`[Kullanıcı ${ekler.resimler.length} resim ekledi ama sen resim göremiyorsun; cevabında resme dayanan yorum yapma.]`);
  parcalar.push(baglam ? `Yeni soru (seçilen cevaptan devam ederek cevapla):\n${soru}` : soru);
  return [
    { rol: 'sistem', icerik: CEVAP_SISTEMI },
    { rol: 'kullanici', icerik: parcalar.join('\n\n---\n\n'), resimler: resimVar ? ekler.resimler : undefined }
  ];
}

// İstek bütün kullanılabilir servislere aynı anda gider.
// mesajUret(servis) her servis için mesaj listesini döndürür.
export async function turBaslat({ soru, mesajUret, servisler, secenek = {}, zamanAsimi = 90, ilerleme = () => {}, ek = {} }) {
  const katilanlar = kullanilabilirServisler(servisler, secenek);
  const tur = {
    id: `tur-${Date.now()}`,
    tip: 'soru',
    zaman: new Date().toISOString(),
    soru,
    cevaplar: [],
    ozet: null,
    inceleme: null,
    ...ek
  };

  await Promise.all(katilanlar.map(async (s) => {
    const bas = performance.now();
    durumAyarla(s.id, 'bekliyor');
    ilerleme(s, 'bekliyor');
    try {
      const { metin, model, yeniModel } = await sor(s, mesajUret(s), { zamanAsimi: s.tur === 'site' ? Math.max(zamanAsimi, 150) : zamanAsimi });
      durumAyarla(s.id, 'hazir');
      const cevap = { servisId: s.id, ad: s.ad, model, metin, sure: Math.round((performance.now() - bas) / 1000) };
      if (s.tur === 'site') cevap.site = true;
      if (yeniModel) cevap.yeniModel = yeniModel;
      tur.cevaplar.push(cevap);
      ilerleme(s, 'tamam');
    } catch (h) {
      hatayiIsle(s, h);
      tur.cevaplar.push({ servisId: s.id, ad: s.ad, model: s.model, hata: h?.message || String(h) });
      ilerleme(s, 'hata', h?.message);
    }
  }));

  const sira = servisler.map((s) => s.id);
  tur.cevaplar.sort((a, b) => sira.indexOf(a.servisId) - sira.indexOf(b.servisId));
  return tur;
}

export function basariliCevaplar(tur) { return tur.cevaplar.filter((c) => !c.hata); }

function cevapListesi(cevaplar, uzunluk) {
  return cevaplar.map((c) => `[${c.ad}]\n${kirp(c.metin, uzunluk)}`).join('\n\n---\n\n');
}

// Başkan olarak sırayla denenecek API servisleri: önce kullanıcının seçtiği.
function baskanAdaylari(servisler, baskanId, tercih) {
  const adaylar = kullanilabilirServisler(servisler).filter((s) => s.tur !== 'site');
  const puan = (s) => (s.id === baskanId ? 2 : 0) + (tercih?.has(s.id) ? 1 : 0);
  return adaylar.sort((a, b) => puan(b) - puan(a));
}

// Başkana tek bir istek gönderir (görüşme, plan çıkarma gibi işler için).
export async function baskanaSor(servisler, baskanId, mesajlar, { deneme = 3, json = true } = {}) {
  for (const baskan of baskanAdaylari(servisler, baskanId).slice(0, deneme)) {
    try {
      const { metin } = await sor(baskan, mesajlar, { zamanAsimi: 120, sicaklik: 0.3 });
      if (!json) return { metin, baskan: baskan.ad };
      const j = jsonCikar(metin);
      if (j) return { veri: j, baskan: baskan.ad };
    } catch (h) {
      hatayiIsle(baskan, h);
    }
  }
  return null;
}

export async function ozetle(tur, servisler, baskanId) {
  const cevaplar = basariliCevaplar(tur);
  if (cevaplar.length === 0) return null;
  const adlar = cevaplar.map((c) => c.ad);
  const istek = `İstek:
${kirp(tur.soru, 3000)}

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
  const tercih = new Set(cevaplar.map((c) => c.servisId));
  for (const baskan of baskanAdaylari(servisler, baskanId, tercih).slice(0, 2)) {
    try {
      const { metin } = await sor(baskan, [
        { rol: 'sistem', icerik: BASKAN_SISTEMI },
        { rol: 'kullanici', icerik: kirp(istek, Math.max(15000, sinirAl(baskan) - 2000)) }
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
// ekTalimat: örneğin kod adımlarında "çalışması gerekenler listesi bozuluyor mu" kontrolü.
export async function incelet(tur, servisler, ilerleme = () => {}, { secenek = {}, ekTalimat = '' } = {}) {
  const cevaplar = basariliCevaplar(tur);
  if (cevaplar.length < 2) return null;
  const adlar = cevaplar.map((c) => c.ad);
  const istekUret = (s) => {
    const pay = Math.max(1500, Math.min(12000, Math.floor((sinirAl(s) - 4000) / cevaplar.length)));
    return `İstek:
${kirp(tur.soru, 2500)}
${ekTalimat ? `\n${ekTalimat}\n` : ''}
Cevaplar:
${cevapListesi(cevaplar, pay)}

Şu JSON'u doldur (cevap adları tam olarak şunlardan biri olmalı: ${adlar.join(', ')}):
{
  "sorunlar": [{"cevap": "ad", "sorun": "bulduğun hata ya da eksik, tek sade cümle"}],
  "en_iyi": "en doğru ve kullanışlı cevabın adı",
  "neden": "neden o cevap, tek cümle"
}`;
  };
  const incelemeciler = kullanilabilirServisler(servisler, secenek);
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
        { rol: 'kullanici', icerik: istekUret(s) }
      ], { zamanAsimi: s.tur === 'site' ? 150 : 90, sicaklik: 0.2 });
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

// Her servise aynı isteği gönderip cevapları toplar (proje incelemesi, arayüz yarışması gibi işler için).
export async function herkesten(servisler, mesajUret, { secenek = {}, ilerleme = () => {}, zamanAsimi = 120, json = true } = {}) {
  const katilanlar = kullanilabilirServisler(servisler, secenek);
  const sonuclar = [];
  await Promise.all(katilanlar.map(async (s) => {
    durumAyarla(s.id, 'bekliyor');
    ilerleme(s, 'bekliyor');
    try {
      const { metin, yeniModel } = await sor(s, mesajUret(s), { zamanAsimi: s.tur === 'site' ? Math.max(zamanAsimi, 150) : zamanAsimi, sicaklik: 0.3 });
      durumAyarla(s.id, 'hazir');
      const veri = json ? jsonCikar(metin) : null;
      if (json && !veri) { ilerleme(s, 'hata', 'Anlaşılır bir cevap döndürmedi'); return; }
      sonuclar.push({ servisId: s.id, ad: s.ad, metin, veri, yeniModel });
      ilerleme(s, 'tamam');
    } catch (h) {
      hatayiIsle(s, h);
      ilerleme(s, 'hata', h?.message);
    }
  }));
  const sira = servisler.map((s) => s.id);
  return sonuclar.sort((a, b) => sira.indexOf(a.servisId) - sira.indexOf(b.servisId));
}
