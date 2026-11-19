// Meclis ana dosyası: durumu tutar, ekranı çizer, olayları bağlar.

import { YERLESIK_SERVISLER } from './saglayicilar.js';
import { turBaslat, ozetle, incelet, kullanilabilirServisler } from './meclis.js';
import { durumDinle, servisEtiketi } from './durum.js';
import { kacis, mdCevir, kisaOzet } from './metin.js';
import * as depo from './depolama.js';
import { anahtarTuret, yeniTuz, kilitle, kilidiAc, paketTuzu } from './sifreleme.js';
import { ayarlariCiz } from './ayarlar.js';
import { sihirbaziBaslat, sifrePenceresi, klasorIzniPenceresi } from './sihirbaz.js';

// ---------- Durum ----------

const VARSAYILAN = {
  surum: 1,
  kurulumTamam: false,
  baskanId: 'gemini',
  esik: 3,
  zamanAsimi: 90,
  servisler: YERLESIK_SERVISLER.map((s) => ({
    id: s.id, ad: s.ad, tur: s.tur, adres: s.adres, model: s.model,
    modelFiltre: s.modelFiltre, acik: true, yerlesik: true
  }))
};

const d = {
  ayarlar: structuredClone(VARSAYILAN),
  anahtarlar: {},
  kilit: null,          // { anahtar: CryptoKey, tuz: Uint8Array }
  anahtarPaketi: null,  // klasördeki şifreli dosya
  sohbet: null,
  secim: null,          // { turId, servisId } — sonraki soru bu cevaptan devam eder
  mesgul: false,
  canli: null,          // devam eden turun bekleme durumu: { turId, satirlar: Map }
  gorunum: 'sohbet'
};

const $ = (s) => document.querySelector(s);

function yeniSohbet() {
  return { id: `sohbet-${Date.now()}`, baslik: 'Yeni sohbet', olusturma: new Date().toISOString(), turlar: [] };
}

// Yerleşik servislerin açıklama ve yardım bilgileri ayarlara kaydedilmez, buradan eklenir.
function servisler() {
  return d.ayarlar.servisler.map((s) => {
    const yerlesik = YERLESIK_SERVISLER.find((y) => y.id === s.id);
    return { ...s, not: yerlesik?.not, yardim: yerlesik?.yardim, anahtar: d.anahtarlar[s.id] || '' };
  });
}

// ---------- Kaydetme ----------

async function ayarlariKaydet() {
  await depo.jsonYaz('ayarlar.json', d.ayarlar);
}

async function anahtarlariKaydet() {
  if (!d.kilit) {
    bildir('Anahtarlar kaydedilemedi: önce bir şifre belirlemen gerekiyor (Ayarlar → Kurulum sihirbazı).');
    return;
  }
  d.anahtarPaketi = await kilitle(d.anahtarlar, d.kilit.anahtar, d.kilit.tuz);
  await depo.jsonYaz('anahtarlar.json', d.anahtarPaketi);
}

async function kilidiCihazdaSakla() {
  await depo.kvYaz('kilit', { tuz: Array.from(d.kilit.tuz), anahtar: d.kilit.anahtar });
  d.kilitHatirlaniyor = true;
}

async function yeniSifreBelirle(sifre, hatirla) {
  const tuz = yeniTuz();
  d.kilit = { anahtar: await anahtarTuret(sifre, tuz), tuz };
  if (hatirla) await kilidiCihazdaSakla();
  await anahtarlariKaydet();
}

async function kilidiAcSifreyle(sifre, hatirla) {
  if (!d.anahtarPaketi) return false;
  const tuz = paketTuzu(d.anahtarPaketi);
  const anahtar = await anahtarTuret(sifre, tuz);
  try {
    d.anahtarlar = await kilidiAc(d.anahtarPaketi, anahtar);
  } catch {
    return false;
  }
  d.kilit = { anahtar, tuz };
  if (hatirla) await kilidiCihazdaSakla();
  paneliYenile();
  return true;
}

async function cihazAnahtariylaAc() {
  if (!d.anahtarPaketi) return false;
  const kayit = await depo.kvAl('kilit');
  if (!kayit) return false;
  const tuz = new Uint8Array(kayit.tuz);
  if (paketTuzu(d.anahtarPaketi).join(',') !== tuz.join(',')) return false;
  try {
    d.anahtarlar = await kilidiAc(d.anahtarPaketi, kayit.anahtar);
    d.kilit = { anahtar: kayit.anahtar, tuz };
    return true;
  } catch {
    return false;
  }
}

async function sohbetiKaydet() {
  const s = d.sohbet;
  if (!s || s.turlar.length === 0) return;
  await depo.jsonYaz(`sohbetler/${s.id}.json`, s);
  const dizin = await depo.jsonOku('sohbetler/dizin.json', []);
  const kayit = { id: s.id, baslik: s.baslik, zaman: new Date().toISOString() };
  const yeni = [kayit, ...dizin.filter((x) => x.id !== s.id)].slice(0, 200);
  await depo.jsonYaz('sohbetler/dizin.json', yeni);
  gecmisiCiz(yeni);
}

// Klasördeki verileri (ayarlar, anahtar dosyası) belleğe yükler.
async function klasordenYukle() {
  const kayitli = await depo.jsonOku('ayarlar.json');
  if (kayitli) {
    d.ayarlar = { ...structuredClone(VARSAYILAN), ...kayitli };
    // Listeden çıkarılan yerleşik servisler (örneğin Z.ai) eski ayarlardan da silinsin.
    const yerlesikIdler = new Set(VARSAYILAN.servisler.map((s) => s.id));
    d.ayarlar.servisler = d.ayarlar.servisler.filter((s) => !s.yerlesik || yerlesikIdler.has(s.id));
    // Sonradan eklenen yerleşik servisler eski ayarlara da girsin.
    for (const y of VARSAYILAN.servisler) {
      if (!d.ayarlar.servisler.some((s) => s.id === y.id)) d.ayarlar.servisler.push(structuredClone(y));
    }
  }
  const paket = await depo.jsonOku('anahtarlar.json');
  const ayniPaket = paket && d.anahtarPaketi && paket.veri === d.anahtarPaketi.veri;
  if (paket && !ayniPaket) {
    d.anahtarPaketi = paket;
    d.kilit = null;
    d.anahtarlar = {};
    await cihazAnahtariylaAc();
  }
}

async function klasorDegistir({ sessiz = false } = {}) {
  const ad = await depo.klasorSec();
  const tasinan = await depo.tarayicidanKlasoreTasi();
  const oncekiAnahtarlar = { ...d.anahtarlar };
  const oncekiKilit = d.kilit;
  await klasordenYukle();
  // Yeni klasörde anahtar dosyası yoksa mevcut anahtarları oraya yaz.
  if (!(await depo.jsonOku('anahtarlar.json')) && oncekiKilit) {
    d.kilit = oncekiKilit;
    d.anahtarlar = oncekiAnahtarlar;
    await anahtarlariKaydet();
  }
  if (!(await depo.jsonOku('ayarlar.json'))) await ayarlariKaydet();
  depoDurumunuCiz();
  gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
  paneliYenile();
  if (!sessiz) bildir(`Klasör seçildi: ${ad}${tasinan ? ` (${tasinan} dosya taşındı)` : ''}`);
  if (d.gorunum === 'ayarlar') ayarlariCizSar();
  return ad;
}

// ---------- Ortak işlemler (ayarlar ve sihirbaz kullanır) ----------

// Bir servis kapanan modelin yerine yeni model önerdiğinde ayarları günceller.
async function modeliGuncelle(id, model) {
  const s = d.ayarlar.servisler.find((x) => x.id === id);
  if (!s || s.model === model) return;
  s.model = model;
  await ayarlariKaydet();
  bildir(`${s.ad}: eski model kapanmıştı, ${model} modeline geçildi.`);
}

const u = {
  get ayarlar() { return d.ayarlar; },
  modeliGuncelle,
  get anahtarlar() { return d.anahtarlar; },
  servisler,
  ayarlariKaydet,
  anahtarlariKaydet,
  yeniSifreBelirle,
  kilidiAcSifreyle,
  klasorDegistir,
  kilitAcik: () => !!d.kilit,
  anahtarDosyasiVar: () => !!d.anahtarPaketi,
  cihazdaHatirlaniyor: () => d.kilitHatirlaniyor === true,
  cihazdaUnut: async () => { await depo.kvSil('kilit'); d.kilitHatirlaniyor = false; bildir('Şifre bu cihazda unutuldu. Bir sonraki açılışta sorulacak.'); },
  sihirbaziAc: () => sihirbaziBaslat(u),
  bildir,
  paneliYenile,
  ayarlariCiz: () => ayarlariCizSar(),
  yenidenCiz: () => { depoDurumunuCiz(); paneliYenile(); akisiCiz(); }
};

// ---------- Ekran ----------

let bildirimZamani = null;
function bildir(metin) {
  const b = $('#bildirim');
  b.textContent = metin;
  b.hidden = false;
  clearTimeout(bildirimZamani);
  bildirimZamani = setTimeout(() => { b.hidden = true; }, 5000);
}

function depoDurumunuCiz() {
  const ad = depo.klasorAdi();
  $('#depoDurum').textContent = depo.klasorKullaniliyor()
    ? `Klasör: ${ad}`
    : depo.klasorDestekleniyor ? 'Klasör seçilmedi · tarayıcıda' : 'Tarayıcıda saklanıyor';
}

function paneliYenile() {
  const liste = servisler();
  $('#panelDurum').innerHTML = liste.map((s) => {
    const e = servisEtiketi(s);
    return `<div class="durum-satir"><span>${kacis(s.ad)}${e.mesaj ? `<small>${kacis(kisaOzet(e.mesaj, 70))}</small>` : ''}</span><span class="etiket etiket-${e.renk}">${kacis(e.metin)}</span></div>`;
  }).join('');
  const hazir = kullanilabilirServisler(liste).length;
  $('#katilimciSayisi').textContent = `${hazir} katılımcı hazır`;
  if (d.gorunum === 'durum') durumGorunumunuCiz();
}

function gecmisiCiz(dizin) {
  const kap = $('#gecmisListe');
  if (!dizin?.length) { kap.innerHTML = '<p class="menu-not">Henüz sohbet yok.</p>'; return; }
  kap.innerHTML = dizin.slice(0, 30).map((x) =>
    `<button type="button" class="menu-oge" data-sohbet="${kacis(x.id)}" ${d.sohbet?.id === x.id ? 'aria-current="page"' : ''} title="${kacis(x.baslik)}">${kacis(x.baslik)}</button>`
  ).join('');
}

function gorunumSec(ad) {
  d.gorunum = ad;
  $('#gorunumSohbet').hidden = ad !== 'sohbet';
  $('#gorunumAyarlar').hidden = ad !== 'ayarlar';
  $('#gorunumDurum').hidden = ad !== 'durum';
  document.querySelectorAll('[data-gorunum]').forEach((b) => {
    if (b.dataset.gorunum === ad) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (ad === 'ayarlar') { $('#ustAlt').textContent = 'Meclis'; $('#ustBaslik').textContent = 'Ayarlar'; ayarlariCizSar(); }
  if (ad === 'durum') { $('#ustAlt').textContent = 'Meclis'; $('#ustBaslik').textContent = 'Yapay zeka durumu'; durumGorunumunuCiz(); }
  if (ad === 'sohbet') { $('#ustAlt').textContent = 'Sohbet'; $('#ustBaslik').textContent = d.sohbet?.baslik || 'Yeni sohbet'; }
}

function ayarlariCizSar() { ayarlariCiz($('#gorunumAyarlar'), u); }

function durumGorunumunuCiz() {
  const liste = servisler();
  $('#gorunumDurum').innerHTML = `
    <div class="ayarlar">
      <p class="soluk">Kotası dolan servis bir süre dinlenmeye alınır ve süre bitince kendiliğinden geri döner. Anahtar ya da model ayarlamak için Ayarlar'a git.</p>
      ${liste.map((s) => {
        const e = servisEtiketi(s);
        return `<div class="kart servis">
          <div class="servis-ust"><h3>${kacis(s.ad)}</h3><span class="etiket etiket-${e.renk}">${kacis(e.metin)}</span></div>
          <p class="soluk">Model: ${kacis(s.model || 'seçilmedi')}</p>
          ${e.mesaj ? `<p class="soluk">Son mesaj: ${kacis(e.mesaj)}</p>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ---------- Sohbet akışı ----------

function oyCubugu(dolu, toplam, etiket) {
  return `<div class="oy-cubuk" role="img" aria-label="${kacis(etiket)}">${Array.from({ length: toplam }, (_, i) => `<span class="${i < dolu ? 'dolu' : ''}"></span>`).join('')}</div>`;
}

function turHTML(tur) {
  const basarili = tur.cevaplar.filter((c) => !c.hata);
  const canli = d.canli?.turId === tur.id ? d.canli : null;
  let h = `<div class="soru-balon">${kacis(tur.soru)}</div>`;
  if (tur.baglam) h += `<div class="soru-baglam">${kacis(tur.baglam.secilenAd)} cevabından devam</div>`;

  if (canli) {
    h += `<section class="blok"><div class="blok-baslik"><span class="blok-ad">${kacis(canli.baslik)}</span></div><div class="bekleme">
      ${[...canli.satirlar.values()].map((x) => `<div class="bekleme-satir"><span class="nokta ${x.durum}"></span>${kacis(x.ad)}<span class="soluk" style="font-size:14px">${x.durum === 'bekliyor' ? 'düşünüyor...' : x.durum === 'tamam' ? 'tamam' : kacis(kisaOzet(x.mesaj || 'hata', 80))}</span></div>`).join('')}
    </div></section>`;
  }

  const o = tur.ozet;
  const inc = tur.inceleme;

  if (o) {
    const destek = o.destekleyenler.length;
    h += `<section class="blok blok-oylama" aria-label="Oylama">
      <div class="blok-baslik"><span class="blok-ad">Oylama</span><span class="oy-sayisi">${destek} / ${o.toplam} katılımcı bu çözümde birleşti</span></div>
      <p class="oylama-metin">${kacis(o.ortakCozum)}</p>
      ${oyCubugu(destek, o.toplam, `${o.toplam} katılımcıdan ${destek} tanesi bu çözümde birleşti`)}
      ${destek ? `<p class="soluk" style="font-size:14px">Birleşenler: ${o.destekleyenler.map(kacis).join(', ')} · Özetleyen: ${kacis(o.baskan)}</p>` : ''}
    </section>`;
  } else if (!canli && basarili.length > 0) {
    h += `<div class="uyari">Başkan özeti çıkarılamadı. Cevapları aşağıdan tek tek inceleyebilirsin.</div>`;
  }

  const dikkat = o?.dikkat || [];
  if (dikkat.length || inc) {
    h += `<div class="ikili">`;
    if (dikkat.length) {
      h += `<section class="blok blok-dikkat" aria-label="Dikkat çekilenler"><span class="blok-ad">Dikkat çekilenler</span>
        <ul>${dikkat.map((x) => `<li><strong>${kacis(x.model)}:</strong> ${kacis(x.not)}</li>`).join('')}</ul></section>`;
    }
    if (inc) {
      const sirali = Object.entries(inc.oylar).sort((a, b) => b[1] - a[1]);
      h += `<section class="blok blok-inceleme" aria-label="İnceleme"><span class="blok-ad">İnceleme</span>
        ${sirali.length ? `<p><strong>En çok oy:</strong> ${kacis(sirali[0][0])} (${sirali[0][1]} / ${inc.katilan})</p>` : ''}
        ${inc.sorunlar.length
          ? `<ul>${inc.sorunlar.slice(0, 8).map((x) => `<li><strong>${kacis(x.cevap)}</strong> cevabında: ${kacis(x.sorun)} <span class="soluk" style="font-size:13px">(${kacis(x.inceleyen)})</span></li>`).join('')}</ul>`
          : '<p>İncelemeciler belirgin bir sorun bulmadı.</p>'}
      </section>`;
    }
    h += `</div>`;
  }

  if (o?.farkliGorusler?.length) {
    h += `<section class="blok blok-farkli" aria-label="Farklı görüşler"><span class="blok-ad">Farklı görüşler</span>
      <ul>${o.farkliGorusler.map((x) => `<li><strong>${kacis(x.model)}:</strong> ${kacis(x.ozet)}</li>`).join('')}</ul></section>`;
  }

  if (tur.cevaplar.length) {
    const hatali = tur.cevaplar.length - basarili.length;
    h += `<section class="cevaplar" aria-label="Tüm cevaplar">
      <div class="cevaplar-baslik"><span>Tüm cevaplar</span><span>${basarili.length} cevap${hatali ? ` · ${hatali} katılamadı` : ''}</span></div>
      ${tur.cevaplar.map((c) => {
        const secili = d.secim?.turId === tur.id && d.secim?.servisId === c.servisId;
        if (c.hata) {
          return `<details class="cevap"><summary><span class="cevap-ad">${kacis(c.ad)}</span><span class="etiket etiket-kirmizi">Katılamadı</span><span class="cevap-ozet">${kacis(c.hata)}</span></summary></details>`;
        }
        const ozet = o?.kisaOzetler?.[c.ad] || kisaOzet(c.metin);
        const oy = inc?.oylar?.[c.ad];
        return `<details class="cevap${secili ? ' secili' : ''}">
          <summary><span class="cevap-ad">${kacis(c.ad)}</span>${oy ? `<span class="etiket etiket-mavi">${oy} oy</span>` : ''}${secili ? '<span class="etiket etiket-mavi">Seçildi</span>' : ''}<span class="cevap-ozet">${kacis(ozet)}</span></summary>
          <div class="cevap-govde">
            <div class="md">${mdCevir(c.metin)}</div>
            <div class="cevap-alt">
              <button type="button" class="dugme dugme-cerceve dugme-kucuk" data-sec="${kacis(tur.id)}|${kacis(c.servisId)}">${secili ? 'Seçimi kaldır' : 'Bu cevaptan devam et'}</button>
              <button type="button" class="dugme dugme-sade dugme-kucuk" data-kopyala="${kacis(tur.id)}|${kacis(c.servisId)}">Kopyala</button>
              <span class="soluk" style="font-size:13px">${kacis(c.model)}${c.sure != null ? ` · ${c.sure} sn` : ''}</span>
            </div>
          </div>
        </details>`;
      }).join('')}
    </section>`;
  }

  if (!canli && basarili.length) {
    const sonTur = d.sohbet.turlar[d.sohbet.turlar.length - 1]?.id === tur.id;
    h += `<div class="eylemler">
      ${o && sonTur ? `<button type="button" class="dugme dugme-ana" data-ortak="${kacis(tur.id)}">Ortak çözümle devam et</button>` : ''}
      ${basarili.length >= 2 ? `<button type="button" class="dugme dugme-cerceve" data-incelet="${kacis(tur.id)}" ${d.mesgul ? 'disabled' : ''}>${inc ? 'Tekrar incelet' : 'İncelet'}</button>` : ''}
      ${!o ? `<button type="button" class="dugme dugme-cerceve" data-ozetle="${kacis(tur.id)}" ${d.mesgul ? 'disabled' : ''}>Özeti tekrar dene</button>` : ''}
    </div>`;
  }
  return `<article class="tur" style="display:flex;flex-direction:column;gap:18px" id="${kacis(tur.id)}">${h}</article>`;
}

function akisiCiz() {
  const kap = $('#akis');
  if (!d.sohbet || d.sohbet.turlar.length === 0) {
    const hazir = kullanilabilirServisler(servisler()).length;
    kap.innerHTML = `<div class="karsilama">
      <h2>Meclis'e bir soru sor</h2>
      <p>Soru aynı anda bütün yapay zekalara gider. Cevaplar gelince başkan model özetler ve hangi çözümde birleştiklerini gösterir.</p>
      ${hazir ? `<p><strong>${hazir} yapay zeka hazır.</strong></p>` : `<p><button type="button" class="dugme dugme-ana" id="karsilamaAyar">Anahtarları gir</button></p>`}
    </div>`;
    $('#karsilamaAyar')?.addEventListener('click', () => gorunumSec('ayarlar'));
  } else {
    kap.innerHTML = d.sohbet.turlar.map(turHTML).join('');
  }
  secimBilgisiniCiz();
  $('#gonder').disabled = d.mesgul;
  if (d.gorunum === 'sohbet') $('#ustBaslik').textContent = d.sohbet?.baslik || 'Yeni sohbet';
}

function secimBilgisiniCiz() {
  const bilgi = $('#secimBilgisi');
  const kaldir = $('#secimiKaldir');
  if (!d.secim) { bilgi.hidden = true; kaldir.hidden = true; return; }
  const ad = d.secim.servisId === '__ortak' ? 'Ortak çözüm' : (servisler().find((s) => s.id === d.secim.servisId)?.ad || d.secim.servisId);
  bilgi.textContent = `Devam edilecek cevap: ${ad}`;
  bilgi.hidden = false;
  kaldir.hidden = false;
}

function enAltaKaydir() {
  const son = $('#akis').lastElementChild;
  son?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Tur çalıştırma ----------

function baglamOlustur() {
  if (!d.secim || !d.sohbet) return null;
  const tur = d.sohbet.turlar.find((t) => t.id === d.secim.turId);
  if (!tur) return null;
  if (d.secim.servisId === '__ortak' && tur.ozet) {
    const destekleyen = tur.cevaplar.find((c) => !c.hata && tur.ozet.destekleyenler.includes(c.ad));
    return {
      oncekiSoru: tur.soru,
      secilenAd: 'Meclis ortak çözümü',
      secilenMetin: `${tur.ozet.ortakCozum}${destekleyen ? `\n\nBu çözümü savunan cevaplardan biri (${destekleyen.ad}):\n${destekleyen.metin}` : ''}`
    };
  }
  const cevap = tur.cevaplar.find((c) => c.servisId === d.secim.servisId && !c.hata);
  if (!cevap) return null;
  return { oncekiSoru: tur.soru, secilenAd: cevap.ad, secilenMetin: cevap.metin };
}

function canliBaslat(turId, baslik, katilanlar) {
  d.canli = { turId, baslik, satirlar: new Map(katilanlar.map((s) => [s.id, { ad: s.ad, durum: 'bekliyor' }])) };
}

function canliIlerleme(servis, durum, mesaj) {
  if (!d.canli) return;
  const satir = d.canli.satirlar.get(servis.id) || { ad: servis.ad };
  d.canli.satirlar.set(servis.id, { ...satir, durum, mesaj });
  akisiCiz();
}

async function soruSor(soru) {
  if (d.mesgul) return;
  const liste = servisler();
  const katilanlar = kullanilabilirServisler(liste);
  if (katilanlar.length === 0) {
    bildir('Hazır yapay zeka yok. Ayarlar\'dan anahtar gir ya da kotası dolanların açılmasını bekle.');
    gorunumSec('ayarlar');
    return;
  }
  if (katilanlar.length < d.ayarlar.esik &&
      !confirm(`Şu an sadece ${katilanlar.length} yapay zeka hazır (önerilen en az ${d.ayarlar.esik}). Yine de sorulsun mu?`)) {
    return;
  }

  if (!d.sohbet) d.sohbet = yeniSohbet();
  if (d.sohbet.turlar.length === 0) d.sohbet.baslik = kisaOzet(soru, 60);
  const baglam = baglamOlustur();
  d.mesgul = true;

  const geciciId = `tur-${Date.now()}`;
  const yerTutucu = { id: geciciId, soru, baglam: baglam ? { secilenAd: baglam.secilenAd } : null, cevaplar: [], ozet: null, inceleme: null };
  d.sohbet.turlar.push(yerTutucu);
  canliBaslat(geciciId, 'Yapay zekalar düşünüyor', katilanlar);
  akisiCiz();
  enAltaKaydir();

  try {
    const tur = await turBaslat({ soru, baglam, servisler: liste, zamanAsimi: d.ayarlar.zamanAsimi, ilerleme: canliIlerleme });
    tur.id = geciciId;
    d.sohbet.turlar[d.sohbet.turlar.length - 1] = tur;
    for (const c of tur.cevaplar) if (c.yeniModel) await modeliGuncelle(c.servisId, c.yeniModel);
    d.secim = null;
    const basarili = tur.cevaplar.filter((c) => !c.hata).length;
    if (basarili > 0) {
      d.canli = { turId: tur.id, baslik: 'Başkan cevapları özetliyor', satirlar: new Map([['baskan', { ad: 'Başkan', durum: 'bekliyor' }]]) };
      akisiCiz();
      await ozetle(tur, servisler(), d.ayarlar.baskanId);
    } else {
      bildir('Hiçbir yapay zeka cevap veremedi. Durum panelindeki mesajlara bak.');
    }
  } catch (h) {
    bildir(`Beklenmeyen bir hata oldu: ${h.message}`);
  } finally {
    d.canli = null;
    d.mesgul = false;
    akisiCiz();
    paneliYenile();
    await sohbetiKaydet().catch((h) => bildir(`Sohbet kaydedilemedi: ${h.message}`));
  }
}

async function turuIncelet(turId) {
  const tur = d.sohbet?.turlar.find((t) => t.id === turId);
  if (!tur || d.mesgul) return;
  const katilanlar = kullanilabilirServisler(servisler());
  if (katilanlar.length === 0) { bildir('İnceleme için hazır yapay zeka yok.'); return; }
  d.mesgul = true;
  canliBaslat(turId, 'Cevaplar inceleniyor', katilanlar);
  akisiCiz();
  try {
    const sonuc = await incelet(tur, servisler(), canliIlerleme);
    if (!sonuc) bildir('İnceleme sonucu alınamadı.');
  } finally {
    d.canli = null;
    d.mesgul = false;
    akisiCiz();
    paneliYenile();
    await sohbetiKaydet().catch(() => {});
  }
}

async function ozetiTekrarDene(turId) {
  const tur = d.sohbet?.turlar.find((t) => t.id === turId);
  if (!tur || d.mesgul) return;
  d.mesgul = true;
  d.canli = { turId, baslik: 'Başkan cevapları özetliyor', satirlar: new Map([['baskan', { ad: 'Başkan', durum: 'bekliyor' }]]) };
  akisiCiz();
  try {
    if (!(await ozetle(tur, servisler(), d.ayarlar.baskanId))) bildir('Özet yine çıkarılamadı.');
  } finally {
    d.canli = null;
    d.mesgul = false;
    akisiCiz();
    await sohbetiKaydet().catch(() => {});
  }
}

// ---------- Olaylar ----------

function olaylariBagla() {
  $('#soruFormu').addEventListener('submit', (o) => {
    o.preventDefault();
    const alan = $('#soru');
    const soru = alan.value.trim();
    if (!soru) return;
    alan.value = '';
    soruSor(soru);
  });
  $('#soru').addEventListener('keydown', (o) => {
    if (o.key === 'Enter' && !o.shiftKey) { o.preventDefault(); $('#soruFormu').requestSubmit(); }
  });
  $('#secimiKaldir').addEventListener('click', () => { d.secim = null; akisiCiz(); });

  $('#akis').addEventListener('click', async (o) => {
    const sec = o.target.closest('[data-sec]');
    const ortak = o.target.closest('[data-ortak]');
    const inc = o.target.closest('[data-incelet]');
    const ozt = o.target.closest('[data-ozetle]');
    const kop = o.target.closest('[data-kopyala]');
    if (sec) {
      const [turId, servisId] = sec.dataset.sec.split('|');
      const ayni = d.secim?.turId === turId && d.secim?.servisId === servisId;
      d.secim = ayni ? null : { turId, servisId };
      akisiCiz();
      if (!ayni) $('#soru').focus();
    } else if (ortak) {
      d.secim = { turId: ortak.dataset.ortak, servisId: '__ortak' };
      akisiCiz();
      $('#soru').focus();
    } else if (inc) {
      turuIncelet(inc.dataset.incelet);
    } else if (ozt) {
      ozetiTekrarDene(ozt.dataset.ozetle);
    } else if (kop) {
      const [turId, servisId] = kop.dataset.kopyala.split('|');
      const c = d.sohbet?.turlar.find((t) => t.id === turId)?.cevaplar.find((x) => x.servisId === servisId);
      if (c?.metin) {
        try { await navigator.clipboard.writeText(c.metin); bildir('Cevap panoya kopyalandı.'); } catch { bildir('Kopyalanamadı.'); }
      }
    }
  });

  $('#yeniSohbet').addEventListener('click', () => {
    if (d.mesgul) return;
    d.sohbet = yeniSohbet();
    d.secim = null;
    gorunumSec('sohbet');
    akisiCiz();
    gecmisVurgula();
    $('#soru').focus();
  });

  $('#gecmisListe').addEventListener('click', async (o) => {
    const b = o.target.closest('[data-sohbet]');
    if (!b || d.mesgul) return;
    const s = await depo.jsonOku(`sohbetler/${b.dataset.sohbet}.json`);
    if (!s) { bildir('Sohbet bulunamadı.'); return; }
    d.sohbet = s;
    d.secim = null;
    gorunumSec('sohbet');
    akisiCiz();
    gecmisVurgula();
  });

  document.querySelectorAll('[data-gorunum]').forEach((b) =>
    b.addEventListener('click', () => gorunumSec(d.gorunum === b.dataset.gorunum ? 'sohbet' : b.dataset.gorunum))
  );

  $('#temaDegistir').addEventListener('click', () => {
    const koyu = document.documentElement.dataset.tema !== 'koyu';
    temaUygula(koyu ? 'koyu' : 'acik');
    try { localStorage.setItem('meclis.tema', koyu ? 'koyu' : 'acik'); } catch { /* boş */ }
  });

  document.addEventListener('keydown', (o) => {
    if (o.key === 'Escape' && !$('#pencere').hidden && $('#spAtla')) $('#spAtla').click();
  });
}

function gecmisVurgula() {
  document.querySelectorAll('#gecmisListe [data-sohbet]').forEach((b) => {
    if (b.dataset.sohbet === d.sohbet?.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function temaUygula(tema) {
  document.documentElement.dataset.tema = tema;
}

// ---------- Açılış ----------

async function basla() {
  let tema = 'acik';
  try { tema = localStorage.getItem('meclis.tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'koyu' : 'acik'); } catch { /* boş */ }
  temaUygula(tema);
  olaylariBagla();
  durumDinle(() => paneliYenile());

  const klasor = await depo.kayitliKlasoruYukle();
  if (klasor === 'izin-gerekli') {
    if (await klasorIzniPenceresi(depo.klasorAdi() || 'seçili')) await depo.klasorIzniIste();
  }

  await klasordenYukle();
  d.kilitHatirlaniyor = !!(await depo.kvAl('kilit'));
  d.sohbet = yeniSohbet();

  depoDurumunuCiz();
  paneliYenile();
  akisiCiz();
  gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));

  if (!d.ayarlar.kurulumTamam) {
    sihirbaziBaslat(u);
  } else if (d.anahtarPaketi && !d.kilit) {
    await sifrePenceresi(u);
    d.kilitHatirlaniyor = !!(await depo.kvAl('kilit'));
    paneliYenile();
    akisiCiz();
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

basla().catch((h) => {
  console.error(h);
  bildir(`Meclis açılırken bir sorun oldu: ${h.message}`);
});
