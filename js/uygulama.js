// Meclis ana dosyası: durumu tutar, ekranı çizer, olayları bağlar.

import { YERLESIK_SERVISLER } from './saglayicilar.js';
import { turBaslat, ozetle, incelet, kullanilabilirServisler, soruMesajlari, basariliCevaplar } from './meclis.js';
import { durumDinle, servisEtiketi } from './durum.js';
import { kacis, mdCevir, kisaOzet } from './metin.js';
import * as depo from './depolama.js';
import { anahtarTuret, yeniTuz, kilitle, kilidiAc, paketTuzu } from './sifreleme.js';
import { ayarlariCiz } from './ayarlar.js';
import { sihirbaziBaslat, sifrePenceresi, klasorIzniPenceresi } from './sihirbaz.js';
import { nesnelerdenOku, dosyaBloklariniGizle } from './dosyalar.js';
import { SITELER, eklentiBagli, eklentiDinle, eklentiyiYokla } from './eklenti-baglanti.js';
import * as P from './projeler.js';
import {
  panelCiz, panelOlaylariniBagla, projeTurHTML, adimCevapEki, adimSonuHTML, devretHTML, ustEylemlerHTML,
  eylemCalistir, yeniProjeAkisi, gorusmeBekliyor, gorusmeCevapla, taslaklariDoldur
} from './proje-arayuz.js';

// ---------- Durum ----------

const VARSAYILAN = {
  surum: 2,
  kurulumTamam: false,
  baskanId: 'gemini',
  esik: 3,
  zamanAsimi: 90,
  sitelerKodda: true,
  servisler: [
    ...YERLESIK_SERVISLER.map((s) => ({ id: s.id, ad: s.ad, tur: s.tur, adres: s.adres, model: s.model, acik: true, yerlesik: true })),
    ...SITELER.map((s) => ({ id: s.id, ad: s.ad, tur: 'site', acik: true, yerlesik: true }))
  ]
};

const d = {
  ayarlar: structuredClone(VARSAYILAN),
  anahtarlar: {},
  kilit: null,
  anahtarPaketi: null,
  sohbet: null,
  proje: null,
  secim: null,          // { turId, servisId } — sonraki soru bu cevaptan devam eder
  ekler: { dosyalar: [], resimler: [] },
  siteler: false,       // site katılımcıları bu soruya katılsın mı
  onemli: false,        // önemli tur: Claude sitesi de katılsın
  mesgul: false,
  canli: null,          // { turId, baslik, satirlar: Map }
  gorunum: 'sohbet',
  panelSekmesi: 'yol'
};

const $ = (s) => document.querySelector(s);
const konusma = () => d.proje || d.sohbet;

function yeniSohbet() {
  return { id: `sohbet-${Date.now()}`, baslik: 'Yeni sohbet', olusturma: new Date().toISOString(), turlar: [] };
}

// Ayarlardaki servislerle yerleşik bilgileri (açıklama, sınır, yardım) birleştirir.
function servisler() {
  return d.ayarlar.servisler.map((s) => {
    const y = YERLESIK_SERVISLER.find((x) => x.id === s.id);
    const site = SITELER.find((x) => x.id === s.id);
    if (site) return { ...s, tur: 'site', site: site.site, adres: site.adres, onemli: site.onemli, not: `${site.adres} — Chrome eklentisiyle, senin açık oturumun üzerinden katılır.` };
    const anahtarKaynagi = y?.anahtarKaynagi || s.anahtarKaynagi;
    return {
      ...s,
      anahtarKaynagi,
      sistemYok: y?.sistemYok ?? s.sistemYok,
      sinir: y?.sinir ?? s.sinir,
      resim: y?.resim ?? s.resim,
      modelFiltre: y?.modelFiltre ?? s.modelFiltre,
      not: y?.not,
      yardim: y?.yardim,
      anahtar: d.anahtarlar[anahtarKaynagi || s.id] || ''
    };
  });
}

// ---------- Kaydetme ----------

async function ayarlariKaydet() { await depo.jsonYaz('ayarlar.json', d.ayarlar); }

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

async function kaydet() {
  try {
    if (d.proje) { await P.projeKaydet(d.proje); await projeListesiniCiz(); } else await sohbetiKaydet();
  } catch (h) {
    bildir(`Kaydedilemedi: ${h.message}`);
  }
}

async function klasordenYukle() {
  const kayitli = await depo.jsonOku('ayarlar.json');
  if (kayitli) {
    d.ayarlar = { ...structuredClone(VARSAYILAN), ...kayitli };
    const yerlesikIdler = new Set(VARSAYILAN.servisler.map((s) => s.id));
    d.ayarlar.servisler = d.ayarlar.servisler.filter((s) => !s.yerlesik || yerlesikIdler.has(s.id));
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
  if (!(await depo.jsonOku('anahtarlar.json')) && oncekiKilit) {
    d.kilit = oncekiKilit;
    d.anahtarlar = oncekiAnahtarlar;
    await anahtarlariKaydet();
  }
  if (!(await depo.jsonOku('ayarlar.json'))) await ayarlariKaydet();
  depoDurumunuCiz();
  gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
  await projeListesiniCiz();
  paneliYenile();
  if (!sessiz) bildir(`Klasör seçildi: ${ad}${tasinan ? ` (${tasinan} dosya taşındı)` : ''}`);
  if (d.gorunum === 'ayarlar') ayarlariCizSar();
  return ad;
}

async function modeliGuncelle(id, model) {
  const s = d.ayarlar.servisler.find((x) => x.id === id);
  if (!s || s.model === model) return;
  s.model = model;
  await ayarlariKaydet();
  bildir(`${s.ad}: eski model kapanmıştı, ${model} modeline geçildi.`);
}

async function modelleriGuncelle(liste) {
  for (const c of liste || []) if (c.yeniModel) await modeliGuncelle(c.servisId, c.yeniModel);
}

// ---------- Ortak işlemler (ayarlar, sihirbaz ve proje ekranı kullanır) ----------

const u = {
  get ayarlar() { return d.ayarlar; },
  get anahtarlar() { return d.anahtarlar; },
  modeliGuncelle,
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

// Proje ekranının kullandığı işlemler.
const k = {
  d,
  servisler,
  bildir,
  kaydet,
  konusma,
  modelleriGuncelle,
  secenek: () => ({ siteler: d.siteler && eklentiBagli(), onemli: d.onemli }),
  akisiCiz: () => akisiCiz(),
  panelCiz: () => projePaneliniCiz(),
  panelSekme: (s) => { d.panelSekmesi = s; projePaneliniCiz(); },
  ustEylemleriCiz: () => ustEylemleriniCiz(),
  menuCiz: () => projeListesiniCiz(),
  basligiCiz: () => basligiCiz(),
  projeAc: (id) => projeAc(id),
  projeKapat: () => projeKapat(),
  enAlta: () => enAltaKaydir(),
  soruAlaninaYaz: (metin) => { const a = $('#soru'); a.value = metin; a.focus(); },
  soruAlaniniOdakla: () => $('#soru').focus(),
  ilerleme: (s, durum, mesaj) => canliIlerleme(s, durum, mesaj),
  mesgulBasla: (baslik, liste, secenek, turId = null) => {
    d.mesgul = true;
    canliBaslat(turId, baslik, kullanilabilirServisler(liste || [], secenek || {}));
    akisiCiz();
    enAltaKaydir();
  },
  mesgulBaslik: (baslik, turId = d.canli?.turId ?? null) => {
    d.canli = { turId, baslik, satirlar: new Map([['baskan', { ad: 'Başkan', durum: 'bekliyor' }]]) };
    akisiCiz();
  },
  mesgulBitir: () => { d.canli = null; d.mesgul = false; akisiCiz(); paneliYenile(); ustEylemleriniCiz(); projePaneliniCiz(); },
  yerTutucuEkle: (alanlar) => {
    const id = `tur-${Date.now()}`;
    konusma().turlar.push({ id, cevaplar: [], ozet: null, inceleme: null, ...alanlar });
    return id;
  },
  yerTutucuDegistir: (id, tur) => {
    const t = konusma().turlar;
    const i = t.findIndex((x) => x.id === id);
    if (i !== -1) t[i] = tur; else t.push(tur);
  }
};

// ---------- Ekran ----------

let bildirimZamani = null;
function bildir(metin) {
  const b = $('#bildirim');
  b.textContent = metin;
  b.hidden = false;
  clearTimeout(bildirimZamani);
  bildirimZamani = setTimeout(() => { b.hidden = true; }, 6000);
}

function depoDurumunuCiz() {
  $('#depoDurum').textContent = depo.klasorKullaniliyor()
    ? `Klasör: ${depo.klasorAdi()}`
    : depo.klasorDestekleniyor ? 'Klasör seçilmedi · tarayıcıda' : 'Tarayıcıda saklanıyor';
}

function paneliYenile() {
  const liste = servisler().filter((s) => s.tur !== 'site' || eklentiBagli());
  $('#panelDurum').innerHTML = liste.map((s) => {
    const e = servisEtiketi(s);
    return `<div class="durum-satir"><span>${kacis(s.ad)}${e.mesaj ? `<small>${kacis(kisaOzet(e.mesaj, 70))}</small>` : ''}</span><span class="etiket etiket-${e.renk}">${kacis(e.metin)}</span></div>`;
  }).join('') + (eklentiBagli() ? '' : '<p class="soluk" style="font-size:13px">Siteler (DeepSeek, Kimi, ChatGPT...) Chrome eklentisi kurulunca burada görünür.</p>');
  const hazir = kullanilabilirServisler(servisler(), k.secenek()).length;
  $('#katilimciSayisi').textContent = `${hazir} katılımcı hazır`;
  if (d.gorunum === 'durum') durumGorunumunuCiz();
  yazmaSecenekleriniCiz();
}

function gecmisiCiz(dizin) {
  const kap = $('#gecmisListe');
  if (!dizin?.length) { kap.innerHTML = '<p class="menu-not">Henüz sohbet yok.</p>'; return; }
  kap.innerHTML = dizin.slice(0, 30).map((x) =>
    `<button type="button" class="menu-oge" data-sohbet="${kacis(x.id)}" ${!d.proje && d.sohbet?.id === x.id ? 'aria-current="page"' : ''} title="${kacis(x.baslik)}">${kacis(x.baslik)}</button>`
  ).join('');
}

async function projeListesiniCiz() {
  const liste = await P.projeListesi();
  $('#projeListe').innerHTML = liste.length
    ? liste.map((x) => `<button type="button" class="menu-oge" data-proje="${kacis(x.id)}" ${d.proje?.id === x.id ? 'aria-current="page"' : ''} title="${kacis(x.ad)}"><span>${kacis(x.ad)}</span>${x.toplam ? `<small>${x.tamam}/${x.toplam}</small>` : ''}</button>`).join('')
    : '<p class="menu-not">Henüz proje yok.</p>';
}

function basligiCiz() {
  if (d.gorunum !== 'sohbet') return;
  $('#ustAlt').textContent = d.proje ? 'Proje' : 'Sohbet';
  $('#ustBaslik').textContent = d.proje ? d.proje.ad : (d.sohbet?.baslik || 'Yeni sohbet');
}

function ustEylemleriniCiz() {
  $('#ustEylemler').innerHTML = d.gorunum === 'sohbet' ? ustEylemlerHTML(k) : '';
  $('#ustEylemler').querySelectorAll('button').forEach((b) => { b.disabled = d.mesgul; });
}

function projePaneliniCiz() { panelCiz(k, $('#projePanel')); }

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
  basligiCiz();
  ustEylemleriniCiz();
}

function ayarlariCizSar() { ayarlariCiz($('#gorunumAyarlar'), u); }

function durumGorunumunuCiz() {
  const liste = servisler();
  $('#gorunumDurum').innerHTML = `
    <div class="ayarlar">
      <p class="soluk">Kotası dolan servis bir süre dinlenmeye alınır ve süre bitince kendiliğinden geri döner. Anahtar ya da model ayarlamak için Ayarlar'a git.</p>
      <p class="soluk">Chrome eklentisi: <strong>${eklentiBagli() ? 'bağlı' : 'bağlı değil'}</strong></p>
      ${liste.map((s) => {
        const e = servisEtiketi(s);
        return `<div class="kart servis">
          <div class="servis-ust"><h3>${kacis(s.ad)}</h3><span class="etiket etiket-${e.renk}">${kacis(e.metin)}</span></div>
          <p class="soluk">${s.tur === 'site' ? kacis(s.adres) : `Model: ${kacis(s.model || 'seçilmedi')}`}</p>
          ${e.mesaj ? `<p class="soluk">Son mesaj: ${kacis(e.mesaj)}</p>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ---------- Akış ----------

function oyCubugu(dolu, toplam, etiket) {
  return `<div class="oy-cubuk" role="img" aria-label="${kacis(etiket)}">${Array.from({ length: toplam }, (_, i) => `<span class="${i < dolu ? 'dolu' : ''}"></span>`).join('')}</div>`;
}

function canliHTML(canli) {
  return `<section class="blok"><div class="blok-baslik"><span class="blok-ad">${kacis(canli.baslik)}</span></div><div class="bekleme">
    ${[...canli.satirlar.values()].map((x) => `<div class="bekleme-satir"><span class="nokta ${x.durum}"></span>${kacis(x.ad)}<span class="soluk" style="font-size:14px">${x.durum === 'bekliyor' ? 'düşünüyor...' : x.durum === 'tamam' ? 'tamam' : kacis(kisaOzet(x.mesaj || 'hata', 80))}</span></div>`).join('')}
  </div></section>`;
}

function soruTurHTML(tur) {
  const basarili = basariliCevaplar(tur);
  const canli = d.canli?.turId === tur.id ? d.canli : null;
  const adim = tur.tip === 'adim';
  let h = '';
  if (tur.etiket) h += `<div class="soru-baglam" style="margin:0;align-self:flex-end">${kacis(tur.etiket)}</div>`;
  h += `<div class="soru-balon">${kacis(tur.soru)}</div>`;
  if (tur.ekler?.length) h += `<div class="soru-ekleri">${tur.ekler.map((e) => `<span class="ek">${kacis(e)}</span>`).join('')}</div>`;
  if (tur.baglam) h += `<div class="soru-baglam">${kacis(tur.baglam.secilenAd)} cevabından devam</div>`;
  if (canli) h += canliHTML(canli);

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
  } else if (!canli && basarili.length > 1) {
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
          ? `<ul>${inc.sorunlar.slice(0, 10).map((x) => `<li><strong>${kacis(x.cevap)}</strong> cevabında: ${kacis(x.sorun)} <span class="soluk" style="font-size:13px">(${kacis(x.inceleyen)})</span></li>`).join('')}</ul>`
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
    const enCokOy = inc ? Object.entries(inc.oylar).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
    h += `<section class="cevaplar" aria-label="Tüm cevaplar">
      <div class="cevaplar-baslik"><span>${adim ? 'Çözümler' : 'Tüm cevaplar'}</span><span>${basarili.length} cevap${hatali ? ` · ${hatali} katılamadı` : ''}</span></div>
      ${tur.cevaplar.map((c) => {
        const secili = d.secim?.turId === tur.id && d.secim?.servisId === c.servisId;
        if (c.hata) {
          return `<details class="cevap"><summary><span class="cevap-ad">${kacis(c.ad)}</span><span class="etiket etiket-kirmizi">Katılamadı</span><span class="cevap-ozet">${kacis(c.hata)}</span></summary></details>`;
        }
        const ozet = o?.kisaOzetler?.[c.ad] || kisaOzet(adim ? (c.metin.split(/##\s*DE[ĞG]İŞİKLİKLER/i)[0].replace(/##\s*ÖZET/i, '')) : c.metin);
        const oy = inc?.oylar?.[c.ad];
        const uygulandi = tur.uygulanan?.servisId === c.servisId;
        return `<details class="cevap${secili || uygulandi ? ' secili' : ''}" ${adim && c.ad === enCokOy && !tur.uygulanan ? 'open' : ''}>
          <summary><span class="cevap-ad">${kacis(c.ad)}</span>${c.site ? '<span class="etiket etiket-gri">Site</span>' : ''}${oy ? `<span class="etiket etiket-mavi">${oy} oy</span>` : ''}${secili ? '<span class="etiket etiket-mavi">Seçildi</span>' : ''}${uygulandi ? '<span class="etiket etiket-yesil">Uygulandı</span>' : ''}<span class="cevap-ozet">${kacis(ozet)}</span></summary>
          <div class="cevap-govde">
            <div class="md">${mdCevir(dosyaBloklariniGizle(c.metin))}</div>
            ${adim ? adimCevapEki(k, tur, c) : ''}
            <div class="cevap-alt">
              ${adim ? '' : `<button type="button" class="dugme dugme-cerceve dugme-kucuk" data-sec="${kacis(tur.id)}|${kacis(c.servisId)}">${secili ? 'Seçimi kaldır' : 'Bu cevaptan devam et'}</button>`}
              <button type="button" class="dugme dugme-sade dugme-kucuk" data-kopyala="${kacis(tur.id)}|${kacis(c.servisId)}">Kopyala</button>
              <span class="soluk" style="font-size:13px">${kacis(c.model || '')}${c.sure != null ? ` · ${c.sure} sn` : ''}</span>
            </div>
          </div>
        </details>`;
      }).join('')}
    </section>`;
  }

  if (adim) h += adimSonuHTML(k, tur);

  if (!canli && basarili.length) {
    const sonTur = konusma().turlar[konusma().turlar.length - 1]?.id === tur.id;
    const dv = devretHTML(k, tur);
    h += `<div class="eylemler">
      ${o && sonTur && !adim ? `<button type="button" class="dugme dugme-ana" data-ortak="${kacis(tur.id)}">Ortak çözümle devam et</button>` : ''}
      ${basarili.length >= 2 ? `<button type="button" class="dugme dugme-cerceve" data-incelet="${kacis(tur.id)}" ${d.mesgul ? 'disabled' : ''}>${inc ? 'Tekrar incelet' : 'İncelet'}</button>` : ''}
      ${!o && basarili.length > 1 ? `<button type="button" class="dugme dugme-cerceve" data-ozetle="${kacis(tur.id)}" ${d.mesgul ? 'disabled' : ''}>Özeti tekrar dene</button>` : ''}
      ${dv.menu}
    </div>${dv.kutu}`;
  }
  return h;
}

function karsilamaHTML() {
  const hazir = kullanilabilirServisler(servisler(), k.secenek()).length;
  if (d.proje) {
    const p = d.proje;
    return `<div class="karsilama">
      <h2>${kacis(p.ad)}</h2>
      <p>${p.hafiza.fikir ? kacis(kisaOzet(p.hafiza.fikir, 200)) : 'Proje hazır. Nasıl başlamak istersin?'}</p>
      <div class="eylemler" style="justify-content:center">
        <button type="button" class="dugme dugme-cerceve" data-eylem="gorusme-baslat">Tasarım görüşmesi</button>
        <button type="button" class="dugme dugme-cerceve" data-eylem="proje-incelet">Projeyi incelet</button>
        <button type="button" class="dugme dugme-cerceve" data-panel-ac="hafiza">Dosyaları içeri al</button>
      </div>
    </div>`;
  }
  return `<div class="karsilama">
    <h2>Meclis'e bir soru sor</h2>
    <p>Soru aynı anda bütün yapay zekalara gider. Dosya da ekleyebilirsin: ataç düğmesine bas ya da dosyayı sürükleyip bırak.</p>
    ${hazir ? `<p><strong>${hazir} yapay zeka hazır.</strong></p>` : `<p><button type="button" class="dugme dugme-ana" id="karsilamaAyar">Anahtarları gir</button></p>`}
  </div>`;
}

function akisiCiz() {
  const kap = $('#akis');
  const kn = konusma();
  if (!kn || kn.turlar.length === 0) {
    kap.innerHTML = karsilamaHTML() + (d.canli && !d.canli.turId ? canliHTML(d.canli) : '');
    $('#karsilamaAyar')?.addEventListener('click', () => gorunumSec('ayarlar'));
  } else {
    kap.innerHTML = kn.turlar.map((t) => {
      const ozel = projeTurHTML(k, t);
      return `<article class="tur" style="display:flex;flex-direction:column;gap:18px" id="${kacis(t.id)}">${ozel ?? soruTurHTML(t)}</article>`;
    }).join('') + (d.canli && !d.canli.turId ? `<article class="tur">${canliHTML(d.canli)}</article>` : '');
    taslaklariDoldur(k);
  }
  yazmaSecenekleriniCiz();
  $('#gonder').disabled = d.mesgul;
  basligiCiz();
  ustEylemleriniCiz();
}

function yazmaSecenekleriniCiz() {
  const bilgi = $('#secimBilgisi');
  const kaldir = $('#secimiKaldir');
  if (!d.secim) { bilgi.hidden = true; kaldir.hidden = true; } else {
    const ad = d.secim.servisId === '__ortak' ? 'Ortak çözüm' : (servisler().find((s) => s.id === d.secim.servisId)?.ad || d.secim.servisId);
    bilgi.textContent = `Devam edilecek cevap: ${ad}`;
    bilgi.hidden = false;
    kaldir.hidden = false;
  }
  const site = $('#siteDugme');
  const onemli = $('#onemliDugme');
  site.hidden = !eklentiBagli();
  site.setAttribute('aria-pressed', String(d.siteler));
  site.textContent = `Siteler: ${d.siteler ? 'açık' : 'kapalı'}`;
  onemli.hidden = !eklentiBagli() || !d.siteler;
  onemli.setAttribute('aria-pressed', String(d.onemli));
  onemli.textContent = `Önemli tur (Claude dahil): ${d.onemli ? 'evet' : 'hayır'}`;

  const ekList = $('#ekListesi');
  const tum = [...d.ekler.dosyalar.map((x) => ({ ad: x.yol, tur: 'dosya' })), ...d.ekler.resimler.map((x) => ({ ad: x.ad, tur: 'resim' }))];
  ekList.hidden = tum.length === 0;
  ekList.innerHTML = tum.map((e, i) => `<span class="ek">${kacis(e.ad)}<button type="button" data-ek-sil="${e.tur}|${i < d.ekler.dosyalar.length ? i : i - d.ekler.dosyalar.length}" aria-label="${kacis(e.ad)} ekini kaldır">×</button></span>`).join('');

  const gorusme = gorusmeBekliyor(d.proje);
  $('#soruEtiket').textContent = gorusme ? 'Başkanın sorusunu cevapla' : d.proje ? `${d.proje.ad} hakkında Meclis'e sor` : 'Meclis\'e sor';
}

function enAltaKaydir() {
  const son = $('#akis').lastElementChild;
  son?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Canlı bekleme ----------

function canliBaslat(turId, baslik, katilanlar) {
  d.canli = { turId, baslik, satirlar: new Map(katilanlar.map((s) => [s.id, { ad: s.ad, durum: 'bekliyor' }])) };
}

function canliIlerleme(servis, durum, mesaj) {
  if (!d.canli) return;
  const satir = d.canli.satirlar.get(servis.id) || { ad: servis.ad };
  d.canli.satirlar.set(servis.id, { ...satir, durum, mesaj });
  akisiCiz();
}

// ---------- Soru sorma ----------

function baglamOlustur() {
  const kn = konusma();
  if (!d.secim || !kn) return null;
  const tur = kn.turlar.find((t) => t.id === d.secim.turId);
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

async function soruSor(soru) {
  if (d.mesgul) return;

  // Proje içindeysek: tasarım görüşmesi cevabı ve kod kapısı.
  if (d.proje) {
    if (/^\s*kodu\s+yaz\s*[.!]*\s*$/i.test(soru) && d.proje.asama !== 'kodlama') {
      await eylemCalistir(k, 'kodu-yaz');
      return;
    }
    if (gorusmeBekliyor(d.proje)) {
      await gorusmeCevapla(k, soru);
      return;
    }
  }

  const liste = servisler();
  const secenek = k.secenek();
  const katilanlar = kullanilabilirServisler(liste, secenek);
  if (katilanlar.length === 0) {
    bildir('Hazır yapay zeka yok. Ayarlar\'dan anahtar gir ya da kotası dolanların açılmasını bekle.');
    gorunumSec('ayarlar');
    return;
  }
  if (katilanlar.length < d.ayarlar.esik &&
      !confirm(`Şu an sadece ${katilanlar.length} yapay zeka hazır (önerilen en az ${d.ayarlar.esik}). Yine de sorulsun mu?`)) {
    return;
  }

  if (!d.proje && !d.sohbet) d.sohbet = yeniSohbet();
  const kn = konusma();
  if (!d.proje && kn.turlar.length === 0) d.sohbet.baslik = kisaOzet(soru, 60);
  const baglam = baglamOlustur();
  const ekler = { dosyalar: d.ekler.dosyalar, resimler: d.ekler.resimler };
  const ekAdlari = [...ekler.dosyalar.map((x) => x.yol), ...ekler.resimler.map((x) => x.ad)];
  const projeBaglami = d.proje ? P.projeBaglami(d.proje) : '';
  d.ekler = { dosyalar: [], resimler: [] };
  d.mesgul = true;

  const turId = k.yerTutucuEkle({ tip: 'soru', soru, baglam: baglam ? { secilenAd: baglam.secilenAd } : null, ekler: ekAdlari });
  canliBaslat(turId, 'Yapay zekalar düşünüyor', katilanlar);
  akisiCiz();
  enAltaKaydir();

  try {
    const tur = await turBaslat({
      soru,
      mesajUret: (s) => soruMesajlari(s, { soru, baglam, ekler, projeBaglami }),
      servisler: liste, secenek, zamanAsimi: d.ayarlar.zamanAsimi, ilerleme: canliIlerleme,
      ek: { baglam: baglam ? { oncekiSoru: baglam.oncekiSoru, secilenAd: baglam.secilenAd } : null, ekler: ekAdlari }
    });
    tur.id = turId;
    k.yerTutucuDegistir(turId, tur);
    await modelleriGuncelle(tur.cevaplar);
    d.secim = null;
    const basarili = basariliCevaplar(tur).length;
    if (basarili > 1) {
      k.mesgulBaslik('Başkan cevapları özetliyor', turId);
      await ozetle(tur, servisler(), d.ayarlar.baskanId);
    } else if (basarili === 0) {
      bildir('Hiçbir yapay zeka cevap veremedi. Durum panelindeki mesajlara bak.');
    }
  } catch (h) {
    bildir(`Beklenmeyen bir hata oldu: ${h.message}`);
  } finally {
    d.canli = null;
    d.mesgul = false;
    akisiCiz();
    paneliYenile();
    await kaydet();
  }
}

async function turuIncelet(turId) {
  const tur = konusma()?.turlar.find((t) => t.id === turId);
  if (!tur || d.mesgul) return;
  const secenek = k.secenek();
  const katilanlar = kullanilabilirServisler(servisler(), secenek);
  if (katilanlar.length === 0) { bildir('İnceleme için hazır yapay zeka yok.'); return; }
  k.mesgulBasla('Cevaplar inceleniyor', servisler(), secenek, turId);
  try {
    const ekTalimat = tur.tip === 'adim' && d.proje ? P.adimInceleTalimati(d.proje) : '';
    const sonuc = await incelet(tur, servisler(), canliIlerleme, { secenek, ekTalimat });
    if (!sonuc) bildir('İnceleme sonucu alınamadı.');
  } finally {
    k.mesgulBitir();
    await kaydet();
  }
}

async function ozetiTekrarDene(turId) {
  const tur = konusma()?.turlar.find((t) => t.id === turId);
  if (!tur || d.mesgul) return;
  d.mesgul = true;
  k.mesgulBaslik('Başkan cevapları özetliyor', turId);
  try {
    if (!(await ozetle(tur, servisler(), d.ayarlar.baskanId))) bildir('Özet yine çıkarılamadı.');
  } finally {
    k.mesgulBitir();
    await kaydet();
  }
}

// ---------- Projeler ----------

async function projeAc(id) {
  if (d.mesgul) return;
  const p = await P.projeYukle(id);
  if (!p) { bildir('Proje bulunamadı.'); return; }
  d.proje = p;
  d.secim = null;
  d.panelSekmesi = p.yol.length ? 'yol' : 'hafiza';
  gorunumSec('sohbet');
  akisiCiz();
  projePaneliniCiz();
  await projeListesiniCiz();
  gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
}

function projeKapat() {
  d.proje = null;
  d.sohbet = yeniSohbet();
  d.secim = null;
  akisiCiz();
  projePaneliniCiz();
  projeListesiniCiz();
}

// ---------- Dosya ekleme ----------

async function ekleriAl(dosyaListesi) {
  if (!dosyaListesi?.length) return;
  const { dosyalar, resimler, atlananlar } = await nesnelerdenOku([...dosyaListesi]);
  d.ekler.dosyalar.push(...dosyalar);
  d.ekler.resimler.push(...resimler);
  yazmaSecenekleriniCiz();
  const toplam = d.ekler.dosyalar.reduce((t, x) => t + x.icerik.length, 0);
  const mesajlar = [];
  if (atlananlar.length) mesajlar.push(`Atlanan: ${atlananlar.join(', ')}`);
  if (toplam > 60000) mesajlar.push('Dosyalar büyük: bazı yapay zekalara kısaltılarak gidecek. Projelerde "Projeyi incelet" daha uygun.');
  if (resimler.length) mesajlar.push('Resimleri sadece resim görebilen modeller (Gemini, Gemma) inceler.');
  if (mesajlar.length) bildir(mesajlar.join(' '));
  $('#soru').focus();
}

// ---------- Olaylar ----------

function olaylariBagla() {
  $('#soruFormu').addEventListener('submit', (o) => {
    o.preventDefault();
    const alan = $('#soru');
    const soru = alan.value.trim();
    if (!soru) {
      if (d.ekler.dosyalar.length || d.ekler.resimler.length) { alan.value = 'Eklediğim dosyaları incele: ne yapıyor, hataları ve eksikleri neler?'; } else return;
    }
    const metin = alan.value.trim();
    alan.value = '';
    soruSor(metin);
  });
  $('#soru').addEventListener('keydown', (o) => {
    if (o.key === 'Enter' && !o.shiftKey) { o.preventDefault(); $('#soruFormu').requestSubmit(); }
  });
  $('#secimiKaldir').addEventListener('click', () => { d.secim = null; akisiCiz(); });
  $('#dosyaEkle').addEventListener('click', () => $('#dosyaGirdi').click());
  $('#dosyaGirdi').addEventListener('change', async (o) => { await ekleriAl(o.target.files); o.target.value = ''; });
  $('#ekListesi').addEventListener('click', (o) => {
    const b = o.target.closest('[data-ek-sil]');
    if (!b) return;
    const [tur, i] = b.dataset.ekSil.split('|');
    d.ekler[tur === 'resim' ? 'resimler' : 'dosyalar'].splice(+i, 1);
    yazmaSecenekleriniCiz();
  });
  $('#siteDugme').addEventListener('click', () => { d.siteler = !d.siteler; if (!d.siteler) d.onemli = false; paneliYenile(); });
  $('#onemliDugme').addEventListener('click', () => { d.onemli = !d.onemli; paneliYenile(); });

  // Sürükle-bırak: dosyaları sayfanın orta kısmına bırakmak yeterli.
  const orta = $('#orta');
  const kutu = $('#soruFormu');
  orta.addEventListener('dragover', (o) => { if ([...o.dataTransfer.types].includes('Files')) { o.preventDefault(); kutu.classList.add('surukleniyor'); } });
  orta.addEventListener('dragleave', (o) => { if (!orta.contains(o.relatedTarget)) kutu.classList.remove('surukleniyor'); });
  orta.addEventListener('drop', async (o) => {
    if (!o.dataTransfer.files.length) return;
    o.preventDefault();
    kutu.classList.remove('surukleniyor');
    await ekleriAl(o.dataTransfer.files);
  });

  const akisTiklama = async (o) => {
    const panelAc = o.target.closest('[data-panel-ac]');
    if (panelAc) { k.panelSekme(panelAc.dataset.panelAc); return; }
    const ey = o.target.closest('[data-eylem]');
    if (ey && !ey.disabled) {
      if (d.mesgul && !['devret-iptal', 'devret-pano', 'secenek-sec', 'taslak-ac', 'dene-ac', 'uygulananlari-indir'].includes(ey.dataset.eylem)) { bildir('Meclis şu an çalışıyor, biraz bekle.'); return; }
      await eylemCalistir(k, ey.dataset.eylem, ey.dataset.arg, ey.dataset.tur, ey);
      return;
    }
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
      const c = konusma()?.turlar.find((t) => t.id === turId)?.cevaplar.find((x) => x.servisId === servisId);
      if (c?.metin) {
        try { await navigator.clipboard.writeText(c.metin); bildir('Cevap panoya kopyalandı.'); } catch { bildir('Kopyalanamadı.'); }
      }
    }
  };
  $('#akis').addEventListener('click', akisTiklama);
  $('#ustEylemler').addEventListener('click', akisTiklama);
  panelOlaylariniBagla(k, $('#projePanel'));

  $('#yeniSohbet').addEventListener('click', async () => {
    if (d.mesgul) return;
    d.proje = null;
    d.sohbet = yeniSohbet();
    d.secim = null;
    gorunumSec('sohbet');
    akisiCiz();
    projePaneliniCiz();
    await projeListesiniCiz();
    gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
    $('#soru').focus();
  });

  $('#yeniProje').addEventListener('click', () => { if (!d.mesgul) yeniProjeAkisi(k); });

  $('#projeListe').addEventListener('click', (o) => {
    const b = o.target.closest('[data-proje]');
    if (b) projeAc(b.dataset.proje);
  });

  $('#gecmisListe').addEventListener('click', async (o) => {
    const b = o.target.closest('[data-sohbet]');
    if (!b || d.mesgul) return;
    const s = await depo.jsonOku(`sohbetler/${b.dataset.sohbet}.json`);
    if (!s) { bildir('Sohbet bulunamadı.'); return; }
    d.proje = null;
    d.sohbet = s;
    d.secim = null;
    gorunumSec('sohbet');
    akisiCiz();
    projePaneliniCiz();
    await projeListesiniCiz();
    gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
  });

  document.querySelectorAll('[data-gorunum]').forEach((b) =>
    b.addEventListener('click', () => gorunumSec(d.gorunum === b.dataset.gorunum ? 'sohbet' : b.dataset.gorunum))
  );

  $('#temaDegistir').addEventListener('click', () => {
    const koyu = document.documentElement.dataset.tema !== 'koyu';
    document.documentElement.dataset.tema = koyu ? 'koyu' : 'acik';
    try { localStorage.setItem('meclis.tema', koyu ? 'koyu' : 'acik'); } catch { /* boş */ }
  });

  document.addEventListener('keydown', (o) => {
    if (o.key === 'Escape' && !$('#pencere').hidden) ($('#spAtla') || $('#msIptal') || $('#ssIptal'))?.click();
  });

  // Devret: siteden dönünce panodaki cevabı kendiliğinden bulmaya çalış.
  window.addEventListener('focus', async () => {
    const tur = konusma()?.turlar.find((t) => t.devretBekliyor);
    if (!tur) return;
    try {
      const metin = (await navigator.clipboard.readText()).trim();
      const kutu = document.querySelector(`[data-devret-metin="${CSS.escape(tur.id)}"]`);
      if (kutu && metin && metin !== tur.devretPaketi && metin.length > 20 && !kutu.value) {
        kutu.value = metin;
        bildir('Panodaki cevap kutuya kondu. Kontrol edip "İçeri al"a bas.');
      }
    } catch { /* izin yoksa sessizce geç */ }
  });
}

// ---------- Açılış ----------

async function basla() {
  let tema = 'acik';
  try { tema = localStorage.getItem('meclis.tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'koyu' : 'acik'); } catch { /* boş */ }
  document.documentElement.dataset.tema = tema;
  olaylariBagla();
  durumDinle(() => paneliYenile());
  eklentiDinle(() => { paneliYenile(); if (d.gorunum === 'ayarlar') ayarlariCizSar(); });
  eklentiyiYokla();

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
  projePaneliniCiz();
  gecmisiCiz(await depo.jsonOku('sohbetler/dizin.json', []));
  await projeListesiniCiz();

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
