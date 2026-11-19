// Projelerin ekranı: sağ panel (Hafıza, Yol, Liste, Dene), proje akışındaki özel kartlar
// (inceleme raporu, kod adımı, tasarım görüşmesi, plan, arayüz yarışması) ve bunların düğmeleri.
// k: uygulama.js'nin verdiği ortak işlemler.

import { kacis, mdCevir, kirp } from './metin.js';
import * as P from './projeler.js';
import { turBaslat, ozetle, incelet, herkesten, baskanaSor, soruMesajlari, basariliCevaplar, kullanilabilirServisler } from './meclis.js';
import {
  dizindenOku, githubdanOku, nesnelerdenOku, dosyaBloklariniCoz, bolumAl, maddelereBol, indir, onizlemeHazirla
} from './dosyalar.js';
import { klasorDestekleniyor } from './depolama.js';
import { SITELER, eklentiBagli, sitedenSor } from './eklenti-baglanti.js';
import { pencereAc, pencereKapat } from './sihirbaz.js';

// ---------- Küçük pencereler ----------

export function metinSor({ baslik, aciklama = '', etiket = '', yerTutucu = '', cokSatir = false, dugme = 'Tamam' }) {
  return new Promise((coz) => {
    const p = pencereAc(`
      <h2 id="pencereBaslik">${kacis(baslik)}</h2>
      ${aciklama ? `<p>${aciklama}</p>` : ''}
      <form id="msForm" style="display:flex;flex-direction:column;gap:14px">
        <div class="alan">
          ${etiket ? `<label for="msGirdi">${kacis(etiket)}</label>` : ''}
          ${cokSatir
            ? `<textarea id="msGirdi" rows="5" placeholder="${kacis(yerTutucu)}"></textarea>`
            : `<input id="msGirdi" placeholder="${kacis(yerTutucu)}">`}
        </div>
        <div class="pencere-alt">
          <button type="button" class="dugme dugme-cerceve" id="msIptal">Vazgeç</button>
          <button type="submit" class="dugme dugme-ana">${kacis(dugme)}</button>
        </div>
      </form>`);
    p.querySelector('#msGirdi').focus();
    p.querySelector('#msForm').addEventListener('submit', (o) => {
      o.preventDefault();
      const v = p.querySelector('#msGirdi').value.trim();
      pencereKapat();
      coz(v); // boş metin '' döner; vazgeçilirse null
    });
    p.querySelector('#msIptal').addEventListener('click', () => { pencereKapat(); coz(null); });
  });
}

function secimSor({ baslik, aciklama, secenekler }) {
  return new Promise((coz) => {
    const p = pencereAc(`
      <h2 id="pencereBaslik">${kacis(baslik)}</h2>
      ${aciklama ? `<p>${aciklama}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px">
        ${secenekler.map((s, i) => `<button type="button" class="secenek" data-i="${i}"><strong>${kacis(s.ad)}</strong>${s.aciklama ? `<span class="soluk">${kacis(s.aciklama)}</span>` : ''}</button>`).join('')}
      </div>
      <div class="pencere-alt"><button type="button" class="dugme dugme-cerceve" id="ssIptal">Vazgeç</button></div>`);
    p.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { pencereKapat(); coz(secenekler[+b.dataset.i].deger); }));
    p.querySelector('#ssIptal').addEventListener('click', () => { pencereKapat(); coz(null); });
  });
}

// ---------- Yeni proje ----------

export async function yeniProjeAkisi(k) {
  const yol = await secimSor({
    baslik: 'Yeni proje',
    aciklama: 'Nasıl başlamak istersin?',
    secenekler: [
      { ad: 'Bir fikirden başla', aciklama: 'Meclis önce araştırır, sonra sana tek tek soru sorarak tasarımı netleştirir.', deger: 'fikir' },
      { ad: 'Mevcut bir projeyi içeri al', aciklama: 'Bilgisayardaki klasörden, GitHub deposundan ya da dosyalardan.', deger: 'mevcut' },
      { ad: 'Dışa aktarılmış bir Meclis projesini aç', aciklama: 'Tablette ya da başka cihazda kaydettiğin proje dosyası.', deger: 'aktarim' }
    ]
  });
  if (!yol) return;

  if (yol === 'aktarim') return projeIceAktar(k);

  const ad = await metinSor({ baslik: 'Projenin adı', etiket: 'Ad', yerTutucu: yol === 'fikir' ? 'Örneğin: Ezan vakti' : 'Örneğin: Gamepad kartı', dugme: 'Devam' });
  if (!ad) return;
  const p = P.yeniProje(ad);

  if (yol === 'fikir') {
    const fikir = await metinSor({ baslik: 'Fikrini anlat', aciklama: 'Ne yapmak istediğini kendi cümlelerinle yaz. Meclis önce araştırma yapacak, sonra sorular soracak.', cokSatir: true, yerTutucu: 'Örneğin: Bulunduğum şehre göre namaz vakitlerini gösteren, vakit gelince bildirim veren bir uygulama...', dugme: 'Araştırmayı başlat' });
    if (!fikir) return;
    p.hafiza.fikir = fikir;
    await P.projeKaydet(p);
    await k.projeAc(p.id);
    await gorusmeBaslat(k);
  } else {
    await P.projeKaydet(p);
    await k.projeAc(p.id);
    k.panelSekme('hafiza');
    k.bildir('Proje oluşturuldu. Sağdaki panelden dosyalarını içeri al.');
  }
}

async function projeIceAktar(k) {
  const girdi = document.createElement('input');
  girdi.type = 'file';
  girdi.accept = '.json,application/json';
  girdi.addEventListener('change', async () => {
    const f = girdi.files?.[0];
    if (!f) return;
    try {
      const v = JSON.parse(await f.text());
      if (!v?.proje?.id) throw new Error('Bu bir Meclis proje dosyası değil');
      await P.projeKaydet(v.proje);
      await P.dosyalariYaz(v.proje, v.dosyalar || []);
      await k.projeAc(v.proje.id);
      k.bildir(`${v.proje.ad} içeri alındı.`);
    } catch (h) {
      k.bildir(`İçeri alınamadı: ${h.message}`);
    }
  });
  girdi.click();
}

// ---------- Sağ panel ----------

const SEKMELER = [['hafiza', 'Hafıza'], ['yol', 'Yol'], ['liste', 'Liste'], ['dene', 'Dene']];

export function panelCiz(k, kap) {
  const p = k.d.proje;
  if (!p) {
    kap.innerHTML = `<section class="kart panel-bolum"><h2>Proje paneli</h2><p class="soluk">Bir proje açınca hafızası, yol haritası, çalışması gerekenler listesi ve önizlemesi burada görünür. Soldaki "Projeler" kısmından yeni proje oluşturabilirsin.</p></section>`;
    return;
  }
  const sekme = k.d.panelSekmesi || 'yol';
  kap.innerHTML = `
    <div class="sekmeler" role="tablist" aria-label="Proje sekmeleri">
      ${SEKMELER.map(([id, ad]) => `<button type="button" role="tab" aria-selected="${id === sekme}" data-panel-sekme="${id}">${ad}</button>`).join('')}
    </div>
    <div id="panelIcerik">${sekme === 'hafiza' ? hafizaHTML(k, p) : sekme === 'liste' ? listeHTML(p) : sekme === 'dene' ? deneHTML(k) : yolHTML(k, p)}</div>`;
  if (sekme === 'dene') onizlemeYukle(k, kap);
}

function hafizaHTML(k, p) {
  const h = p.hafiza;
  const kaynak = p.kaynak?.tur === 'github' ? `GitHub: ${p.kaynak.sahip}/${p.kaynak.depo}` : p.kaynak?.tur === 'klasor' ? `Klasör: ${p.kaynak.ad}` : p.kaynak?.tur === 'dosya' ? 'Seçilen dosyalar' : 'Henüz dosya yok';
  return `<div class="panel-bolum">
    <h3>Fikir</h3>
    <textarea data-hafiza="fikir" rows="3" placeholder="Uygulama ne yapacak?">${kacis(h.fikir)}</textarea>
    <h3>Alınan kararlar</h3>
    ${h.kararlar.length ? h.kararlar.map((x, i) => `<div class="madde"><span>${kacis(x)}</span><button type="button" class="mini mini-sil" data-eylem="karar-sil" data-arg="${i}" aria-label="Kararı sil">Sil</button></div>`).join('') : '<p class="soluk">Henüz karar yok.</p>'}
    <form class="satir-ekle" data-form="karar"><input type="text" placeholder="Yeni karar ekle" aria-label="Yeni karar"><button type="submit" class="mini">Ekle</button></form>
    <h3>Ortak dil</h3>
    <textarea data-hafiza="ortakDil" rows="3" placeholder="Parçalar arasındaki komutlar, dosya adları (örneğin kart ile ayar sayfası arasındaki komutlar)">${kacis(h.ortakDil)}</textarea>
    <h3>Nasıl yüklenir / çalıştırılır</h3>
    <textarea data-hafiza="nasilYuklenir" rows="2" placeholder="Örneğin: APK'da İndir, sonra Kartı güncelle">${kacis(h.nasilYuklenir)}</textarea>

    <h3>Dosyalar</h3>
    <p class="soluk" id="dosyaOzeti">${kacis(kaynak)}</p>
    <div class="adim-eylem">
      ${klasorDestekleniyor ? '<button type="button" class="mini" data-eylem="klasorden-yukle">Klasörden yükle</button>' : ''}
      <button type="button" class="mini" data-eylem="githubdan-yukle">GitHub'dan yükle</button>
      <button type="button" class="mini" data-eylem="dosyadan-yukle">Dosya seç</button>
      <button type="button" class="mini" data-eylem="dosyalari-indir">Dosyaları indir</button>
    </div>
    ${klasorDestekleniyor ? '<p class="soluk" style="font-size:13px">Klasörden yüklersen, uyguladığın değişiklikler doğrudan o klasöre de yazılır.</p>' : ''}

    <h3>Proje</h3>
    <div class="adim-eylem">
      <button type="button" class="mini" data-eylem="proje-yeniden-adlandir">Adını değiştir</button>
      <button type="button" class="mini" data-eylem="proje-disa-aktar">Dışa aktar</button>
      <button type="button" class="mini mini-sil" data-eylem="proje-sil">Projeyi sil</button>
    </div>
  </div>`;
}

function yolHTML(k, p) {
  const kodlama = p.asama === 'kodlama';
  return `<div class="panel-bolum">
    ${!kodlama ? `<div class="uyari" style="font-size:14px">Kod kapısı kapalı: sen "Kodu yaz" demeden kod yazılmaz.${p.yol.length ? ' Plan hazırsa üstteki "Kodu yaz" düğmesine bas.' : ''}</div>` : ''}
    ${p.yol.length ? p.yol.map((a, i) => `
      <div class="adim ${a.durum}">
        <span class="adim-isaret" aria-hidden="true"></span>
        <div class="adim-metin">${i + 1}. ${kacis(a.baslik)}${a.aciklama ? `<small>${kacis(kirp(a.aciklama, 160))}</small>` : ''}
          <div class="adim-eylem">
            ${kodlama && a.durum !== 'tamam' ? `<button type="button" class="mini mini-ana" data-eylem="adim-baslat" data-arg="${a.id}">${a.durum === 'suruyor' ? 'Tekrar dene' : 'Başlat'}</button>` : ''}
            ${a.durum !== 'tamam' ? `<button type="button" class="mini" data-eylem="adim-tamamla" data-arg="${a.id}">Tamamlandı</button>` : `<button type="button" class="mini" data-eylem="adim-ac" data-arg="${a.id}">Yeniden aç</button>`}
            <button type="button" class="mini mini-sil" data-eylem="adim-sil" data-arg="${a.id}" aria-label="Adımı sil">Sil</button>
          </div>
        </div>
      </div>`).join('') : '<p class="soluk">Yol haritası boş. Tasarım görüşmesinin sonunda ya da "Projeyi incelet" raporundan adım eklenir.</p>'}
    <form class="satir-ekle" data-form="adim"><input type="text" placeholder="Yeni adım ekle" aria-label="Yeni adım"><button type="submit" class="mini">Ekle</button></form>
    ${p.yedekler?.length ? `<h3>Yedekler</h3>${p.yedekler.slice(0, 6).map((y) => `<div class="madde"><span>${kacis(new Date(y.zaman).toLocaleString('tr-TR'))}<small style="display:block;color:var(--soluk);font-size:13px">${kacis(kirp(y.aciklama || '', 80))}</small></span><button type="button" class="mini" data-eylem="geri-al" data-arg="${kacis(y.zaman)}">Geri al</button></div>`).join('')}` : ''}
  </div>`;
}

const MADDE_DURUM = { denenmedi: 'Denenmedi', calisiyor: 'Çalışıyor', bozuk: 'Bozuk' };
function listeHTML(p) {
  return `<div class="panel-bolum">
    <p class="soluk" style="font-size:14px">Her adımdan sonra bu maddeleri dene. Durumu değiştirmek için etikete bas.</p>
    ${p.liste.length ? p.liste.map((m) => `
      <div class="madde">
        <button type="button" class="madde-durum ${m.durum}" data-eylem="madde-durum" data-arg="${m.id}">${MADDE_DURUM[m.durum]}</button>
        <span>${kacis(m.metin)}</span>
        <button type="button" class="mini mini-sil" data-eylem="madde-sil" data-arg="${m.id}" aria-label="Maddeyi sil">Sil</button>
      </div>`).join('') : '<p class="soluk">Liste boş.</p>'}
    <form class="satir-ekle" data-form="madde"><input type="text" placeholder="Örneğin: A tuşu Enter gönderiyor" aria-label="Yeni madde"><button type="submit" class="mini">Ekle</button></form>
  </div>`;
}

function deneHTML(k) {
  return `<div class="panel-bolum" id="deneAlani"><p class="soluk">Yükleniyor...</p></div>`;
}

async function onizlemeYukle(k, kap) {
  const alan = kap.querySelector('#deneAlani');
  const dosyalar = await P.dosyalariOku(k.d.proje);
  const htmller = dosyalar.filter((d) => /\.html?$/i.test(d.yol));
  if (!htmller.length) {
    alan.innerHTML = '<p class="soluk">Projede önizlenecek bir HTML dosyası yok. Android ve kart programları burada çalışmaz; onlar için adımların "Deneme" talimatlarını kullan.</p>';
    return;
  }
  const secili = htmller.find((d) => d.yol === k.d.onizlemeDosyasi) || htmller.find((d) => /(^|\/)index\.html?$/i.test(d.yol)) || htmller[0];
  alan.innerHTML = `
    <select aria-label="Önizlenecek dosya" data-onizleme-sec>${htmller.map((d) => `<option ${d.yol === secili.yol ? 'selected' : ''}>${kacis(d.yol)}</option>`).join('')}</select>
    <iframe class="onizleme" title="Önizleme" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
    <div class="adim-eylem">
      <button type="button" class="mini" data-eylem="onizleme-yenile">Yenile</button>
      <button type="button" class="mini" data-eylem="onizleme-pencere">Büyük pencerede aç</button>
    </div>
    <p class="soluk" style="font-size:13px">Bluetooth, USB ve dosya erişimi gibi özellikler önizlemede çalışmaz; onları kendi adresinde dene.</p>`;
  alan.querySelector('iframe').srcdoc = onizlemeHazirla(secili.yol, dosyalar);
  k.d.onizlemeDosyasi = secili.yol;
}

// Panel olayları (bir kez bağlanır).
export function panelOlaylariniBagla(k, kap) {
  kap.addEventListener('click', async (o) => {
    const sekme = o.target.closest('[data-panel-sekme]');
    if (sekme) { k.panelSekme(sekme.dataset.panelSekme); return; }
    const b = o.target.closest('[data-eylem]');
    if (b) await eylemCalistir(k, b.dataset.eylem, b.dataset.arg, b.dataset.tur, b);
  });
  kap.addEventListener('change', async (o) => {
    const p = k.d.proje;
    if (!p) return;
    if (o.target.dataset.hafiza) {
      p.hafiza[o.target.dataset.hafiza] = o.target.value.trim();
      await k.kaydet();
    } else if (o.target.matches('[data-onizleme-sec]')) {
      k.d.onizlemeDosyasi = o.target.value;
      k.panelCiz();
    }
  });
  kap.addEventListener('submit', async (o) => {
    const form = o.target.closest('[data-form]');
    if (!form) return;
    o.preventDefault();
    const p = k.d.proje;
    const deger = form.querySelector('input').value.trim();
    if (!p || !deger) return;
    if (form.dataset.form === 'karar') p.hafiza.kararlar.push(deger);
    if (form.dataset.form === 'adim') p.yol.push(P.yolAdimi(deger));
    if (form.dataset.form === 'madde') p.liste.push(P.listeMaddesi(deger));
    await k.kaydet();
    k.panelCiz();
  });
}

// ---------- Dosyaları içeri alma ----------

async function dosyalariAl(k, sonuc, kaynak) {
  const p = k.d.proje;
  if (!sonuc.dosyalar.length) { k.bildir('Okunabilir dosya bulunamadı.'); return; }
  await P.dosyalariYaz(p, sonuc.dosyalar);
  p.kaynak = kaynak;
  await k.kaydet();
  k.panelCiz();
  k.bildir(`${sonuc.dosyalar.length} dosya içeri alındı${sonuc.atlananlar?.length ? `, ${sonuc.atlananlar.length} dosya atlandı` : ''}. Şimdi "Projeyi incelet" diyebilirsin.`);
  k.ustEylemleriCiz();
}

// ---------- Akıştaki proje kartları ----------

export function projeTurHTML(k, tur) {
  if (tur.tip === 'rapor') return raporHTML(tur);
  if (tur.tip === 'gorusme') return gorusmeHTML(k, tur);
  if (tur.tip === 'plan') return planHTML(k, tur);
  if (tur.tip === 'yarisma') return yarismaHTML(tur);
  return null;
}

function raporHTML(tur) {
  const r = tur.rapor;
  const eklendi = new Set(tur.eklenenler || []);
  const madde = (bolum, x, i) => `
    <div class="rapor-madde">
      ${bolum === 'hatalar' ? `<span class="onem ${x.onem}" title="Önem: ${x.onem}"></span>` : ''}
      <p>${kacis(x.madde)}<small>${x.bulanlar?.length ? `${x.bulanlar.length}/${tur.katilan} buldu: ${kacis(x.bulanlar.join(', '))}` : ''}</small></p>
      ${eklendi.has(`${bolum}|${i}`) ? '<span class="etiket etiket-yesil">Eklendi</span>' : `<button type="button" class="mini" data-eylem="yola-ekle" data-tur="${kacis(tur.id)}" data-arg="${bolum}|${i}">Yol haritasına ekle</button>`}
    </div>`;
  const grup = (baslik, bolum, liste) => liste.length ? `<h4 style="margin:6px 0 0">${baslik}</h4><div class="rapor-grup">${liste.map((x, i) => madde(bolum, x, i)).join('')}</div>` : '';
  return `
    <div class="soru-balon">Projeyi incelet${tur.odak ? `: ${kacis(tur.odak)}` : ''}</div>
    <section class="blok" aria-label="İnceleme raporu">
      <div class="blok-baslik"><span class="blok-ad">İnceleme raporu</span><span class="soluk" style="font-size:14px">${tur.katilan} yapay zeka inceledi${tur.baskan ? ` · birleştiren: ${kacis(tur.baskan)}` : ''}</span></div>
      ${r.ne_yapiyor.length ? `<h4 style="margin:6px 0 0">Bu program ne yapıyor?</h4><ul>${r.ne_yapiyor.map((x) => `<li>${kacis(x)}</li>`).join('')}</ul>
        <div>${tur.listeyeEklendi ? '<span class="etiket etiket-yesil">Çalışması gerekenler listesine eklendi</span>' : `<button type="button" class="mini" data-eylem="rapor-listeye" data-tur="${kacis(tur.id)}">Bunları "çalışması gerekenler" listesine ekle</button>`}</div>` : ''}
      ${grup('Hatalar', 'hatalar', r.hatalar)}
      ${grup('İyileştirmeler', 'iyilestirmeler', r.iyilestirmeler)}
      ${grup('Eksik özellikler', 'eksikler', r.eksikler)}
    </section>`;
}

function gorusmeHTML(k, tur) {
  if (tur.bitti) {
    return `<section class="blok blok-baskan"><span class="blok-ad">Başkan</span><p>Tasarım için gereken sorular tamamlandı. Şimdi planı çıkarabilirim.</p>
      ${tur.planCikti ? '' : `<div class="eylemler"><button type="button" class="dugme dugme-ana" data-eylem="plan-cikar">Planı çıkar</button></div>`}</section>`;
  }
  const sonGorusme = [...k.d.proje.turlar].reverse().find((t) => t.tip === 'gorusme');
  const acik = !tur.cevap && sonGorusme?.id === tur.id;
  return `
    <section class="blok blok-baskan" aria-label="Başkanın sorusu">
      <div class="blok-baslik"><span class="blok-ad">Başkanın sorusu</span>${tur.baskan ? `<span class="soluk" style="font-size:13px">${kacis(tur.baskan)}</span>` : ''}</div>
      <p class="oylama-metin">${kacis(tur.soru)}</p>
      ${tur.neden ? `<p class="soluk">Neden soruyorum: ${kacis(tur.neden)}</p>` : ''}
      ${tur.secenekler?.length ? `<div class="secenekler">${tur.secenekler.map((s) => `
        <button type="button" class="secenek" data-eylem="secenek-sec" data-arg="${kacis(s.ad)}" ${acik ? '' : 'disabled'}>
          <strong>${kacis(s.ad)}</strong>${s.arti ? `<span>+ ${kacis(s.arti)}</span>` : ''}${s.eksi ? `<span class="soluk">− ${kacis(s.eksi)}</span>` : ''}
        </button>`).join('')}</div>` : ''}
      ${tur.oneri ? `<p><strong>Önerim:</strong> ${kacis(tur.oneri)}</p>` : ''}
      ${tur.notlar?.length ? `<div class="blok blok-dikkat" style="padding:12px"><span class="blok-ad">Diğerlerinin notları</span><ul>${tur.notlar.map((n) => `<li><strong>${kacis(n.ad)}:</strong> ${kacis(n.metin)}</li>`).join('')}</ul></div>` : ''}
      ${acik ? '<p class="soluk" style="font-size:14px">Cevabını aşağıdaki kutuya yaz ya da bir seçeneğe bas.</p>' : ''}
    </section>
    ${tur.cevap ? `<div class="soru-balon">${kacis(tur.cevap)}</div>` : ''}`;
}

function planHTML(k, tur) {
  const p = k.d.proje;
  return `<section class="blok blok-oylama" aria-label="Plan">
    <div class="blok-baslik"><span class="blok-ad">Plan hazır</span><span class="soluk" style="font-size:13px">${kacis(tur.baskan || '')}</span></div>
    <p class="oylama-metin">${kacis(tur.fikir)}</p>
    <h4 style="margin:4px 0 0">Yol haritası</h4>
    <ol>${tur.yol.map((a) => `<li>${kacis(a.baslik)}</li>`).join('')}</ol>
    ${tur.liste.length ? `<h4 style="margin:4px 0 0">Çalışması gerekenler</h4><ul>${tur.liste.map((m) => `<li>${kacis(m)}</li>`).join('')}</ul>` : ''}
    <p class="soluk">Plan hafızaya ve yol haritasına yazıldı. Sağdaki panelden düzenleyebilirsin.</p>
    ${p.asama !== 'kodlama' ? `<div class="eylemler"><button type="button" class="dugme dugme-ana" data-eylem="kodu-yaz">Kodu yaz</button><button type="button" class="dugme dugme-cerceve" data-eylem="yarisma-baslat">Önce arayüz yarışması yap</button></div>` : ''}
  </section>`;
}

function yarismaHTML(tur) {
  return `
    <div class="soru-balon">Arayüz yarışması: ${kacis(tur.ekran)}</div>
    <section class="blok" aria-label="Arayüz yarışması">
      <div class="blok-baslik"><span class="blok-ad">Taslaklar</span><span class="soluk" style="font-size:14px">${tur.taslaklar.length} taslak</span></div>
      ${tur.taslaklar.length ? `<div class="taslaklar">${tur.taslaklar.map((t, i) => `
        <div class="taslak ${tur.secilen === t.ad ? 'secili' : ''}">
          <div class="blok-baslik"><strong>${kacis(t.ad)}</strong>${tur.secilen === t.ad ? '<span class="etiket etiket-mavi">Seçildi</span>' : ''}</div>
          ${t.aciklama ? `<p class="soluk" style="font-size:14px">${kacis(kirp(t.aciklama, 200))}</p>` : ''}
          <iframe title="${kacis(t.ad)} taslağı" sandbox="allow-scripts" data-taslak="${i}"></iframe>
          <div class="adim-eylem">
            ${tur.secilen === t.ad ? '' : `<button type="button" class="mini mini-ana" data-eylem="taslak-sec" data-tur="${kacis(tur.id)}" data-arg="${i}">Bunu seç</button>`}
            <button type="button" class="mini" data-eylem="taslak-ac" data-tur="${kacis(tur.id)}" data-arg="${i}">Büyük aç</button>
          </div>
        </div>`).join('')}</div>` : '<p>Hiçbir yapay zeka kullanılabilir bir taslak çizemedi.</p>'}
    </section>`;
}

// Akış çizildikten sonra taslak iframe'lerinin içeriğini doldurur.
export function taslaklariDoldur(k) {
  const turlar = k.konusma()?.turlar || [];
  document.querySelectorAll('#akis article').forEach((art) => {
    const tur = turlar.find((t) => t.id === art.id);
    if (tur?.tip !== 'yarisma') return;
    art.querySelectorAll('iframe[data-taslak]').forEach((f) => { f.srcdoc = tur.taslaklar[+f.dataset.taslak]?.html || ''; });
  });
}

// Kod adımı cevaplarının altına eklenen kısım: değişen dosyalar ve "Uygula".
export function adimCevapEki(k, tur, c) {
  const dosyalar = dosyaBloklariniCoz(c.metin);
  const uygulandi = tur.uygulanan?.servisId === c.servisId;
  return `<div class="dosya-listesi" style="margin-top:10px">${dosyalar.length ? dosyalar.map((d) => `<code>${kacis(d.yol)}</code>`).join('') : '<span class="soluk" style="font-size:14px">Bu cevapta dosya yok.</span>'}</div>
    ${dosyalar.length && !uygulandi ? `<div class="cevap-alt"><button type="button" class="dugme dugme-ana dugme-kucuk" data-eylem="uygula" data-tur="${kacis(tur.id)}" data-arg="${kacis(c.servisId)}">Bu çözümü uygula</button></div>` : ''}`;
}

export function adimSonuHTML(k, tur) {
  const u = tur.uygulanan;
  if (!u) return '';
  const adim = k.d.proje?.yol.find((a) => a.id === tur.adimId);
  const eklenen = new Set(tur.eklenenMaddeler || []);
  return `<section class="blok blok-inceleme" aria-label="Uygulandı">
    <div class="blok-baslik"><span class="blok-ad">Uygulandı</span><span class="soluk" style="font-size:14px">${kacis(u.ad)} çözümü · ${u.dosyalar.length} dosya${u.klasorYazildi ? ' · klasöre de yazıldı' : ''}</span></div>
    <div class="dosya-listesi">${u.dosyalar.map((y) => `<code>${kacis(y)}</code>`).join('')}</div>
    ${u.deneme ? `<h4 style="margin:4px 0 0">Şimdi dene</h4><div class="md">${mdCevir(u.deneme)}</div>` : ''}
    ${u.yeniMaddeler?.length ? `<h4 style="margin:4px 0 0">Listeye eklenmesi önerilenler</h4>${u.yeniMaddeler.map((m, i) => `<div class="madde"><span>${kacis(m)}</span>${eklenen.has(i) ? '<span class="etiket etiket-yesil">Eklendi</span>' : `<button type="button" class="mini" data-eylem="listeye-ekle" data-tur="${kacis(tur.id)}" data-arg="${i}">Listeye ekle</button>`}</div>`).join('')}` : ''}
    <div class="eylemler">
      ${adim && adim.durum !== 'tamam' ? `<button type="button" class="dugme dugme-ana" data-eylem="adim-tamamla" data-arg="${kacis(adim.id)}">Denedim, adım tamam</button>` : ''}
      <button type="button" class="dugme dugme-cerceve" data-eylem="geri-al" data-arg="${kacis(u.zaman)}">Geri al</button>
      <button type="button" class="dugme dugme-cerceve" data-eylem="uygulananlari-indir" data-tur="${kacis(tur.id)}">Değişen dosyaları indir</button>
      <button type="button" class="dugme dugme-sade" data-eylem="dene-ac">Dene sekmesini aç</button>
    </div>
  </section>`;
}

// Devret menüsü ve elle içeri alma kutusu.
export function devretHTML(k, tur) {
  const menu = `<details class="secim-menu">
    <summary class="dugme dugme-cerceve" role="button">Devret</summary>
    <div class="secim-icerik">${SITELER.map((s) => `<button type="button" data-eylem="devret" data-tur="${kacis(tur.id)}" data-arg="${s.id}">${kacis(s.ad)}'e devret</button>`).join('')}</div>
  </details>`;
  const kutu = tur.devretBekliyor ? `<div class="devret-kutu">
    <strong>${kacis(SITELER.find((s) => s.id === tur.devretBekliyor)?.ad || '')} cevabını içeri al</strong>
    <p class="soluk" style="font-size:14px">Paket panoya kopyalandı ve site açıldı. Sitede yapıştırıp gönder, gelen cevabı kopyala ve buraya dön. Meclis panodaki cevabı kendisi bulmaya çalışır.</p>
    <textarea data-devret-metin="${kacis(tur.id)}" placeholder="Cevabı buraya yapıştır"></textarea>
    <div class="adim-eylem">
      <button type="button" class="mini mini-ana" data-eylem="devret-iceri" data-tur="${kacis(tur.id)}">İçeri al</button>
      <button type="button" class="mini" data-eylem="devret-pano" data-tur="${kacis(tur.id)}">Panodan al</button>
      <button type="button" class="mini" data-eylem="devret-iptal" data-tur="${kacis(tur.id)}">Vazgeç</button>
    </div>
  </div>` : '';
  return { menu, kutu };
}

// Proje sayfasının üstündeki düğmeler.
export function ustEylemlerHTML(k) {
  const p = k.d.proje;
  if (!p) return '';
  const gorusmeVar = p.turlar.some((t) => t.tip === 'gorusme');
  const d = [];
  d.push('<button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="proje-incelet">Projeyi incelet</button>');
  d.push('<button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="yarisma-baslat">Arayüz yarışması</button>');
  if (p.asama !== 'kodlama') {
    if (!gorusmeVar) d.push('<button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="gorusme-baslat">Tasarım görüşmesi</button>');
    d.push('<button type="button" class="dugme dugme-ana dugme-kucuk" data-eylem="kodu-yaz">Kodu yaz</button>');
  } else {
    const siradaki = p.yol.find((a) => a.durum === 'suruyor') || p.yol.find((a) => a.durum === 'bekliyor');
    if (siradaki) d.push(`<button type="button" class="dugme dugme-ana dugme-kucuk" data-eylem="adim-baslat" data-arg="${siradaki.id}">Sıradaki adım: ${kacis(kirp(siradaki.baslik, 28).replace(/\n.*$/s, ''))}</button>`);
  }
  return d.join('');
}

// ---------- Eylemler ----------

export async function eylemCalistir(k, eylem, arg, turId, el) {
  const p = k.d.proje;
  const tur = turId ? k.konusma()?.turlar.find((t) => t.id === turId) : null;
  const f = EYLEMLER[eylem];
  if (!f) return false;
  try {
    await f(k, { p, tur, arg, el });
  } catch (h) {
    console.error(h);
    k.bildir(`Bir sorun oldu: ${h.message}`);
    k.mesgulBitir?.();
  }
  return true;
}

const EYLEMLER = {
  async 'karar-sil'(k, { p, arg }) { p.hafiza.kararlar.splice(+arg, 1); await k.kaydet(); k.panelCiz(); },
  async 'adim-sil'(k, { p, arg }) { p.yol = p.yol.filter((a) => a.id !== arg); await k.kaydet(); k.panelCiz(); k.ustEylemleriCiz(); },
  async 'adim-tamamla'(k, { p, arg }) {
    const a = p.yol.find((x) => x.id === arg);
    if (!a) return;
    a.durum = 'tamam';
    await k.kaydet();
    k.panelCiz(); k.akisiCiz(); k.ustEylemleriCiz();
    const siradaki = p.yol.find((x) => x.durum === 'bekliyor');
    k.bildir(siradaki ? `Adım tamamlandı. Sıradaki: ${siradaki.baslik}` : 'Adım tamamlandı. Yol haritasındaki bütün adımlar bitti!');
  },
  async 'adim-ac'(k, { p, arg }) { const a = p.yol.find((x) => x.id === arg); if (a) a.durum = 'bekliyor'; await k.kaydet(); k.panelCiz(); k.ustEylemleriCiz(); },
  async 'madde-durum'(k, { p, arg }) {
    const m = p.liste.find((x) => x.id === arg);
    if (!m) return;
    m.durum = { denenmedi: 'calisiyor', calisiyor: 'bozuk', bozuk: 'denenmedi' }[m.durum];
    await k.kaydet(); k.panelCiz();
  },
  async 'madde-sil'(k, { p, arg }) { p.liste = p.liste.filter((m) => m.id !== arg); await k.kaydet(); k.panelCiz(); },

  async 'klasorden-yukle'(k, { p }) {
    const dizin = await window.showDirectoryPicker({ id: `proje-${p.id}`, mode: 'readwrite' });
    k.bildir('Klasör okunuyor...');
    const sonuc = await dizindenOku(dizin);
    await P.klasoruBagla(p, dizin);
    await dosyalariAl(k, sonuc, { tur: 'klasor', ad: dizin.name });
  },
  async 'githubdan-yukle'(k) {
    const adres = await metinSor({ baslik: 'GitHub\'dan yükle', aciklama: 'Herkese açık (Public) bir deponun adresini yaz.', etiket: 'Depo', yerTutucu: 'pmape/gamepad ya da https://github.com/pmape/gamepad', dugme: 'Yükle' });
    if (!adres) return;
    k.bildir('GitHub\'dan dosyalar okunuyor...');
    const sonuc = await githubdanOku(adres, (yol) => k.bildir(`Okunuyor: ${yol}`));
    await dosyalariAl(k, sonuc, sonuc.kaynak);
  },
  async 'dosyadan-yukle'(k) {
    const girdi = document.createElement('input');
    girdi.type = 'file';
    girdi.multiple = true;
    girdi.addEventListener('change', async () => {
      const sonuc = await nesnelerdenOku([...girdi.files]);
      await dosyalariAl(k, sonuc, { tur: 'dosya' });
    });
    girdi.click();
  },
  async 'dosyalari-indir'(k, { p }) {
    const dosyalar = await P.dosyalariOku(p);
    if (!dosyalar.length) { k.bildir('Projede dosya yok.'); return; }
    for (const d of dosyalar) indir(d.yol, d.icerik);
    k.bildir(`${dosyalar.length} dosya indiriliyor. Tarayıcı birden fazla indirme için izin isteyebilir.`);
  },
  async 'proje-yeniden-adlandir'(k, { p }) {
    const ad = await metinSor({ baslik: 'Projenin yeni adı', etiket: 'Ad', yerTutucu: p.ad, dugme: 'Kaydet' });
    if (!ad) return;
    p.ad = ad; await k.kaydet(); k.menuCiz(); k.basligiCiz();
  },
  async 'proje-disa-aktar'(k, { p }) {
    const dosyalar = await P.dosyalariOku(p);
    indir(`${p.ad.replace(/[^\wçğıöşüÇĞİÖŞÜ -]/g, '')}.meclis.json`, JSON.stringify({ surum: 1, proje: p, dosyalar }, null, 2), 'application/json');
  },
  async 'proje-sil'(k, { p }) {
    if (!confirm(`"${p.ad}" projesi Meclis'ten silinsin mi? (Bilgisayarındaki kendi proje klasörüne dokunulmaz.)`)) return;
    await P.projeSil(p.id);
    k.projeKapat();
    k.bildir('Proje silindi.');
  },

  async 'dene-ac'(k) { k.panelSekme('dene'); },
  async 'onizleme-yenile'(k) { k.panelCiz(); },
  async 'onizleme-pencere'(k, { p }) {
    const dosyalar = await P.dosyalariOku(p);
    const html = onizlemeHazirla(k.d.onizlemeDosyasi, dosyalar);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  },

  // --- Projeyi incelet ---
  async 'proje-incelet'(k, { p }) {
    const dosyalar = await P.dosyalariOku(p);
    if (!dosyalar.length) {
      k.panelSekme('hafiza');
      k.bildir('Önce sağdaki panelden projenin dosyalarını içeri al.');
      return;
    }
    const odak = await metinSor({ baslik: 'Projeyi incelet', aciklama: `${dosyalar.length} dosya bütün yapay zekalara gönderilecek. Özellikle bakılmasını istediğin bir şey var mı? (Boş bırakabilirsin.)`, etiket: 'Odak (isteğe bağlı)', yerTutucu: 'Örneğin: Bağlantı kopma sorunu', dugme: 'İncelet' });
    if (odak === null) return;
    const servisler = k.servisler();
    const secenek = k.secenek();
    k.mesgulBasla('Yapay zekalar projeyi inceliyor', servisler, secenek);
    const sonuclar = await herkesten(servisler, (s) => P.incelemeMesajlari(s, p, dosyalar, odak), { secenek, ilerleme: k.ilerleme, zamanAsimi: 180 });
    await k.modelleriGuncelle(sonuclar);
    if (!sonuclar.length) { k.mesgulBitir(); k.bildir('Hiçbir yapay zeka inceleme yapamadı. Durum paneline bak.'); return; }
    k.mesgulBaslik('Başkan raporları birleştiriyor');
    const adlar = sonuclar.map((s) => s.ad);
    const b = sonuclar.length > 1 ? await baskanaSor(servisler, k.d.ayarlar.baskanId, P.raporBirlestirMesajlari(sonuclar)) : null;
    const rapor = P.raporuTemizle(b?.veri || P.raporlariYanYanaKoy(sonuclar), adlar);
    p.turlar.push({ id: `rapor-${Date.now()}`, tip: 'rapor', zaman: new Date().toISOString(), odak, rapor, katilan: sonuclar.length, baskan: b?.baskan, eklenenler: [] });
    await k.kaydet();
    k.mesgulBitir();
    k.enAlta();
  },
  async 'yola-ekle'(k, { p, tur, arg }) {
    const [bolum, i] = arg.split('|');
    const x = tur.rapor[bolum]?.[+i];
    if (!x) return;
    const onEk = { hatalar: 'Hatayı düzelt', iyilestirmeler: 'İyileştir', eksikler: 'Özellik ekle' }[bolum];
    p.yol.push(P.yolAdimi(`${onEk}: ${kirp(x.madde, 90).replace(/\n.*$/s, '')}`, x.madde));
    tur.eklenenler = [...(tur.eklenenler || []), arg];
    await k.kaydet(); k.akisiCiz(); k.panelCiz(); k.ustEylemleriCiz();
  },
  async 'rapor-listeye'(k, { p, tur }) {
    for (const x of tur.rapor.ne_yapiyor) if (!p.liste.some((m) => m.metin === x)) p.liste.push(P.listeMaddesi(x));
    tur.listeyeEklendi = true;
    await k.kaydet(); k.akisiCiz(); k.panelCiz();
  },

  // --- Kod adımı ---
  async 'adim-baslat'(k, { p, arg }) {
    if (p.asama !== 'kodlama') { k.bildir('Kod kapısı kapalı. Önce "Kodu yaz" düğmesine bas.'); return; }
    const adim = p.yol.find((a) => a.id === arg);
    if (!adim) return;
    const ekIstek = adim.durum === 'suruyor'
      ? await metinSor({ baslik: 'Adımı tekrar dene', aciklama: 'Önceki denemede ne olmadı? Yazarsan yapay zekalar buna dikkat eder. (Boş bırakabilirsin.)', etiket: 'Not', cokSatir: true, dugme: 'Başlat' })
      : '';
    if (ekIstek === null && adim.durum === 'suruyor') return;
    for (const a of p.yol) if (a.durum === 'suruyor' && a.id !== adim.id) a.durum = 'bekliyor';
    adim.durum = 'suruyor';
    const dosyalar = await P.dosyalariOku(p);
    const servisler = k.servisler();
    const secenek = { ...k.secenek(), siteler: eklentiBagli() && k.d.ayarlar.sitelerKodda !== false };
    k.panelCiz();
    const sira = p.yol.indexOf(adim) + 1;
    const turId = k.yerTutucuEkle({ tip: 'adim', soru: `${sira}. adım: ${adim.baslik}${ekIstek ? `\nNot: ${ekIstek}` : ''}`, adimId: adim.id });
    k.mesgulBasla('Yapay zekalar kodu yazıyor', servisler, secenek, turId);
    const tur = await turBaslat({
      soru: `${sira}. adım: ${adim.baslik}${ekIstek ? `\nNot: ${ekIstek}` : ''}`,
      mesajUret: (s) => P.adimMesajlari(s, p, adim, dosyalar, ekIstek),
      servisler, secenek, zamanAsimi: Math.max(k.d.ayarlar.zamanAsimi, 180), ilerleme: k.ilerleme,
      ek: { tip: 'adim', adimId: adim.id }
    });
    tur.id = turId;
    k.yerTutucuDegistir(turId, tur);
    await k.modelleriGuncelle(tur.cevaplar);
    if (basariliCevaplar(tur).length) {
      k.mesgulBaslik('Başkan özetliyor', turId);
      await ozetle(tur, servisler, k.d.ayarlar.baskanId);
      if (basariliCevaplar(tur).length >= 2) {
        k.mesgulBasla('Çözümler inceleniyor', servisler, secenek, turId);
        await incelet(tur, servisler, k.ilerleme, { secenek, ekTalimat: P.adimInceleTalimati(p) });
      }
    }
    await k.kaydet();
    k.mesgulBitir();
  },
  async 'uygula'(k, { p, tur, arg }) {
    const c = tur.cevaplar.find((x) => x.servisId === arg && !x.hata);
    const dosyalar = c ? dosyaBloklariniCoz(c.metin) : [];
    if (!dosyalar.length) return;
    const adim = p.yol.find((a) => a.id === tur.adimId);
    const { klasorYazildi } = await P.dosyalariUygula(p, dosyalar, `${adim?.baslik || 'Adım'} · ${c.ad}`);
    tur.uygulanan = {
      servisId: c.servisId, ad: c.ad, zaman: p.yedekler[0].zaman, dosyalar: dosyalar.map((d) => d.yol), klasorYazildi,
      deneme: bolumAl(c.metin, 'DENEME'),
      yeniMaddeler: maddelereBol(bolumAl(c.metin, 'YEN[İI] L[İI]STE MADDELER[İI]'))
    };
    await k.kaydet();
    k.akisiCiz(); k.panelCiz();
    k.bildir(klasorYazildi ? 'Uygulandı; dosyalar proje klasörüne de yazıldı.' : 'Uygulandı. Değişen dosyaları "indir" ile alabilirsin.');
  },
  async 'listeye-ekle'(k, { p, tur, arg }) {
    const m = tur.uygulanan?.yeniMaddeler?.[+arg];
    if (!m) return;
    p.liste.push(P.listeMaddesi(m));
    tur.eklenenMaddeler = [...(tur.eklenenMaddeler || []), +arg];
    await k.kaydet(); k.akisiCiz(); k.panelCiz();
  },
  async 'geri-al'(k, { p, arg }) {
    if (!confirm('Bu değişiklikten önceki hale dönülsün mü?')) return;
    await P.geriAl(p, arg);
    for (const t of p.turlar) if (t.uygulanan?.zaman === arg) delete t.uygulanan;
    await k.kaydet();
    k.akisiCiz(); k.panelCiz();
    k.bildir('Önceki hale dönüldü.');
  },
  async 'uygulananlari-indir'(k, { p, tur }) {
    const dosyalar = await P.dosyalariOku(p);
    for (const y of tur.uygulanan?.dosyalar || []) {
      const d = dosyalar.find((x) => x.yol === y);
      if (d) indir(d.yol, d.icerik);
    }
  },

  // --- Kod kapısı ---
  async 'kodu-yaz'(k, { p }) {
    if (!p.yol.length) {
      k.bildir('Yol haritası boş. Önce tasarım görüşmesini bitirip planı çıkar ya da "Projeyi incelet" raporundan adım ekle.');
      k.panelSekme('yol');
      return;
    }
    p.asama = 'kodlama';
    await k.kaydet();
    k.akisiCiz(); k.panelSekme('yol'); k.ustEylemleriCiz();
    k.bildir('Kod kapısı açıldı. Sıradaki adımı üstteki düğmeyle ya da yol haritasından başlatabilirsin.');
  },

  // --- Tasarım görüşmesi ---
  async 'gorusme-baslat'(k, { p }) {
    if (!p.hafiza.fikir) {
      const fikir = await metinSor({ baslik: 'Fikrini anlat', cokSatir: true, dugme: 'Araştırmayı başlat' });
      if (!fikir) return;
      p.hafiza.fikir = fikir;
    }
    await gorusmeBaslat(k);
  },
  async 'secenek-sec'(k, { arg }) { k.soruAlaninaYaz(arg); },
  async 'plan-cikar'(k, { p }) {
    const gecmis = p.turlar.filter((t) => t.tip === 'gorusme' && t.cevap).map((t) => ({ soru: t.soru, cevap: t.cevap }));
    k.mesgulBasla('Başkan planı çıkarıyor', [], {});
    const r = await baskanaSor(k.servisler(), k.d.ayarlar.baskanId, P.planMesajlari(p, p.arastirmaOzeti, gecmis));
    k.mesgulBitir();
    if (!r) { k.bildir('Plan çıkarılamadı. Biraz sonra tekrar dene.'); return; }
    const v = r.veri;
    if (v.fikir_ozeti) p.hafiza.fikir = String(v.fikir_ozeti);
    for (const x of v.kararlar || []) if (!p.hafiza.kararlar.includes(String(x))) p.hafiza.kararlar.push(String(x));
    if (v.nasil_yuklenir) p.hafiza.nasilYuklenir = String(v.nasil_yuklenir);
    const yol = (v.yol || []).map((a) => P.yolAdimi(String(a?.baslik || a), String(a?.aciklama || '')));
    if (yol.length) p.yol = [...p.yol.filter((a) => a.durum === 'tamam'), ...yol];
    for (const m of v.liste || []) if (!p.liste.some((x) => x.metin === String(m))) p.liste.push(P.listeMaddesi(String(m)));
    for (const t of p.turlar) if (t.tip === 'gorusme' && t.bitti) t.planCikti = true;
    p.turlar.push({ id: `plan-${Date.now()}`, tip: 'plan', zaman: new Date().toISOString(), baskan: r.baskan, fikir: p.hafiza.fikir, yol: yol.map((a) => ({ baslik: a.baslik })), liste: (v.liste || []).map(String) });
    await k.kaydet();
    k.akisiCiz(); k.panelSekme('yol'); k.ustEylemleriCiz(); k.enAlta();
  },

  // --- Arayüz yarışması ---
  async 'yarisma-baslat'(k, { p }) {
    const ekran = await metinSor({ baslik: 'Arayüz yarışması', aciklama: 'Her yapay zeka bu ekranın bir taslağını çizecek; sen yan yana görüp seçeceksin.', etiket: 'Hangi ekran?', yerTutucu: 'Örneğin: Ana ekran — bugünün vakitleri ve sıradaki vakte kalan süre', cokSatir: true, dugme: 'Yarışmayı başlat' });
    if (!ekran) return;
    const servisler = k.servisler();
    const secenek = k.secenek();
    k.mesgulBasla('Yapay zekalar taslak çiziyor', servisler, secenek);
    const sonuclar = await herkesten(servisler, (s) => P.yarismaMesajlari(s, p, ekran), { secenek, ilerleme: k.ilerleme, zamanAsimi: 180, json: false });
    await k.modelleriGuncelle(sonuclar);
    const taslaklar = sonuclar.map((s) => ({ ad: s.ad, html: P.htmlCikar(s.metin), aciklama: s.metin.split('```')[0].trim() })).filter((t) => t.html);
    p.turlar.push({ id: `yarisma-${Date.now()}`, tip: 'yarisma', zaman: new Date().toISOString(), ekran, taslaklar, secilen: null });
    await k.kaydet();
    k.mesgulBitir();
    k.enAlta();
  },
  async 'taslak-sec'(k, { p, tur, arg }) {
    const t = tur.taslaklar[+arg];
    if (!t) return;
    tur.secilen = t.ad;
    p.tasarim = { ekran: tur.ekran, ad: t.ad, html: t.html };
    const karar = `Arayüz (${kirp(tur.ekran, 60)}): ${t.ad}'in taslağı seçildi.`;
    p.hafiza.kararlar = p.hafiza.kararlar.filter((x) => !x.startsWith(`Arayüz (${kirp(tur.ekran, 60)})`));
    p.hafiza.kararlar.push(karar);
    await k.kaydet(); k.akisiCiz(); k.panelCiz();
    k.bildir('Taslak seçildi ve hafızaya yazıldı. Kod adımlarında bu düzen kullanılacak.');
  },
  async 'taslak-ac'(k, { tur, arg }) {
    const t = tur.taslaklar[+arg];
    if (t) window.open(URL.createObjectURL(new Blob([t.html], { type: 'text/html' })), '_blank');
  },

  // --- Devret ---
  async 'devret'(k, { tur, arg, el }) {
    el.closest('details')?.removeAttribute('open');
    const site = SITELER.find((s) => s.id === arg);
    if (!site) return;
    const paket = await devirPaketi(k, tur);
    if (eklentiBagli()) {
      k.mesgulBasla(`${site.ad} düşünüyor`, [], {}, tur.id);
      k.ilerleme({ id: site.id, ad: site.ad }, 'bekliyor');
      try {
        const metin = await sitedenSor(site.site, paket, { zamanAsimi: 300 });
        devredilenCevabiEkle(tur, site, metin);
        await k.kaydet();
      } catch (h) {
        k.bildir(`${site.ad} cevap vermedi: ${h.message}`);
      } finally {
        k.mesgulBitir();
      }
      return;
    }
    try { await navigator.clipboard.writeText(paket); } catch { /* aşağıda kutu yine açılır */ }
    tur.devretBekliyor = site.id;
    tur.devretPaketi = paket;
    k.akisiCiz();
    window.open(site.adres, '_blank', 'noopener');
    k.bildir(`Paket panoya kopyalandı. ${site.ad} sitesinde yapıştırıp gönder.`);
  },
  async 'devret-pano'(k, { tur }) {
    try {
      const metin = await navigator.clipboard.readText();
      const kutu = document.querySelector(`[data-devret-metin="${CSS.escape(tur.id)}"]`);
      if (kutu) kutu.value = metin;
    } catch {
      k.bildir('Panoya erişilemedi. Cevabı kutuya elle yapıştır (Ctrl+V).');
    }
  },
  async 'devret-iceri'(k, { tur }) {
    const kutu = document.querySelector(`[data-devret-metin="${CSS.escape(tur.id)}"]`);
    const metin = kutu?.value.trim();
    if (!metin) { k.bildir('Kutu boş.'); return; }
    if (metin === tur.devretPaketi) { k.bildir('Bu, gönderdiğin paketin kendisi. Sitedeki cevabı kopyalaman gerekiyor.'); return; }
    const site = SITELER.find((s) => s.id === tur.devretBekliyor);
    devredilenCevabiEkle(tur, site, metin);
    delete tur.devretBekliyor;
    delete tur.devretPaketi;
    await k.kaydet();
    k.akisiCiz();
  },
  async 'devret-iptal'(k, { tur }) { delete tur.devretBekliyor; delete tur.devretPaketi; await k.kaydet(); k.akisiCiz(); }
};

function devredilenCevabiEkle(tur, site, metin) {
  const id = `${site.id}-devret-${Date.now()}`;
  tur.cevaplar.push({ servisId: id, ad: `${site.ad} (devredildi)`, model: 'site', metin: String(metin).trim(), devret: true });
}

async function devirPaketi(k, tur) {
  const p = k.d.proje;
  const ozet = tur.ozet ? `\n\nDiğer yapay zekaların ortak görüşü: ${tur.ozet.ortakCozum}` : '';
  const sorunlar = tur.inceleme?.sorunlar?.length ? `\n\nİncelemede bulunan sorunlar:\n${tur.inceleme.sorunlar.slice(0, 8).map((s) => `- ${s.cevap}: ${s.sorun}`).join('\n')}` : '';
  const sahte = { sinir: 30000, tur: 'site' };
  if (tur.tip === 'adim' && p) {
    const adim = p.yol.find((a) => a.id === tur.adimId);
    const dosyalar = await P.dosyalariOku(p);
    const m = P.adimMesajlari(sahte, p, adim || { id: '', baslik: tur.soru }, dosyalar, '');
    return `${m.map((x) => x.icerik).join('\n\n')}${ozet}${sorunlar}\n\nBu adımı en iyi şekilde sen yap ve cevabını yukarıdaki biçimde ver.`;
  }
  const m = soruMesajlari(sahte, { soru: tur.soru, projeBaglami: p ? P.projeBaglami(p) : '' });
  return `${m.map((x) => x.icerik).join('\n\n')}${ozet}${sorunlar}\n\nBu soruya en iyi cevabı ver.`;
}

// ---------- Tasarım görüşmesi akışı ----------

export async function gorusmeBaslat(k) {
  const p = k.d.proje;
  const servisler = k.servisler();
  const secenek = k.secenek();
  const soru = P.arastirmaSorusu(p.hafiza.fikir);
  const turId = k.yerTutucuEkle({ tip: 'soru', soru, etiket: 'Araştırma' });
  k.mesgulBasla('Yapay zekalar araştırıyor', servisler, secenek, turId);
  const tur = await turBaslat({ soru, mesajUret: (s) => soruMesajlari(s, { soru }), servisler, secenek, zamanAsimi: k.d.ayarlar.zamanAsimi, ilerleme: k.ilerleme, ek: { etiket: 'Araştırma' } });
  tur.id = turId;
  k.yerTutucuDegistir(turId, tur);
  await k.modelleriGuncelle(tur.cevaplar);
  if (!basariliCevaplar(tur).length) { k.mesgulBitir(); await k.kaydet(); k.bildir('Araştırma yapılamadı. Durum paneline bak.'); return; }
  k.mesgulBaslik('Başkan araştırmayı özetliyor', turId);
  await ozetle(tur, servisler, k.d.ayarlar.baskanId);
  const ilk = basariliCevaplar(tur)[0];
  p.arastirmaOzeti = `${tur.ozet?.ortakCozum || ''}\n\n${kirp(ilk.metin, 3500)}`;
  await k.kaydet();
  await baskanSorusu(k);
}

export function gorusmeBekliyor(p) {
  if (!p || p.asama === 'kodlama') return null;
  const son = [...p.turlar].reverse().find((t) => t.tip === 'gorusme');
  return son && !son.bitti && !son.cevap ? son : null;
}

export async function gorusmeCevapla(k, cevap) {
  const p = k.d.proje;
  const bekleyen = gorusmeBekliyor(p);
  if (!bekleyen) return false;
  bekleyen.cevap = cevap;
  await k.kaydet();
  k.akisiCiz();
  await baskanSorusu(k);
  return true;
}

async function baskanSorusu(k) {
  const p = k.d.proje;
  const servisler = k.servisler();
  const gecmis = p.turlar.filter((t) => t.tip === 'gorusme' && t.cevap).map((t) => ({ soru: t.soru, cevap: t.cevap }));
  k.mesgulBasla('Başkan sıradaki soruyu hazırlıyor', [], {});
  const r = await baskanaSor(servisler, k.d.ayarlar.baskanId, P.baskanSorusuMesajlari(p, p.arastirmaOzeti, gecmis));
  if (!r) { k.mesgulBitir(); k.bildir('Başkan soru hazırlayamadı. "Tasarım görüşmesi" ile tekrar deneyebilirsin.'); return; }
  const v = r.veri;
  const karar = String(v.kaydedilecek_karar || '').trim();
  if (karar && !p.hafiza.kararlar.includes(karar)) p.hafiza.kararlar.push(karar);
  if (v.bitti || !v.soru) {
    p.turlar.push({ id: `gorusme-${Date.now()}`, tip: 'gorusme', bitti: true, zaman: new Date().toISOString() });
    await k.kaydet();
    k.mesgulBitir();
    k.enAlta();
    return;
  }
  const tur = {
    id: `gorusme-${Date.now()}`, tip: 'gorusme', zaman: new Date().toISOString(), baskan: r.baskan,
    soru: String(v.soru), neden: String(v.neden || ''), oneri: String(v.oneri || ''),
    secenekler: (Array.isArray(v.secenekler) ? v.secenekler : []).filter((s) => s?.ad).map((s) => ({ ad: String(s.ad), arti: String(s.arti || ''), eksi: String(s.eksi || '') })).slice(0, 4),
    notlar: []
  };
  p.turlar.push(tur);
  await k.kaydet();
  k.mesgulBitir();
  k.enAlta();
  k.soruAlaniniOdakla();

  // Diğer modellerden kısa notlar (başkanın atladığı noktalar) — arka planda, en fazla 3 model.
  const digerleri = kullanilabilirServisler(servisler).filter((s) => s.ad !== r.baskan && s.tur !== 'site').slice(0, 3);
  const notlar = await herkesten(digerleri, () => P.arkaPlanMesajlari(p, tur.soru), { json: false, zamanAsimi: 60 }).catch(() => []);
  tur.notlar = notlar.slice(0, 3).map((n) => ({ ad: n.ad, metin: kirp(n.metin.trim(), 300) })).filter((n) => !/^\W*yok\W*$/i.test(n.metin));
  if (tur.notlar.length) { await k.kaydet(); k.akisiCiz(); }
}
