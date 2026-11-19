// Ayarlar ekranı: genel ayarlar, klasör, yapay zeka servisleri ve "Yapay zeka ekle" formu.
// u: uygulama.js'nin verdiği ortak işlemler (ayarlar, anahtarlar, kaydetme, bildirim...).

import { kacis } from './metin.js';
import { modelleriGetir, dene, AnahtarHatasi } from './saglayicilar.js';
import { durumAyarla, dinlenmeBitti, servisEtiketi } from './durum.js';
import { klasorDestekleniyor, klasorAdi } from './depolama.js';

export function servisKarti(s, { kompakt = false } = {}) {
  const e = servisEtiketi(s);
  const yardim = s.yardim
    ? `<details class="anahtar-yardim">
         <summary>Anahtar nasıl alınır?</summary>
         <ol>${s.yardim.adimlar.map((a) => `<li>${kacis(a)}</li>`).join('')}</ol>
         <p><a href="${kacis(s.yardim.url)}" target="_blank" rel="noopener">Anahtar sayfasını aç</a></p>
       </details>`
    : '';
  return `
  <div class="kart servis" data-servis="${kacis(s.id)}">
    <div class="servis-ust">
      <h3>${kacis(s.ad)}</h3>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span class="etiket etiket-${e.renk}">${kacis(e.metin)}</span>
        ${kompakt ? '' : `<label class="anahtar-cek"><input type="checkbox" data-alan="acik" ${s.acik ? 'checked' : ''}> Kullan</label>`}
      </div>
    </div>
    ${s.not ? `<p class="soluk">${kacis(s.not)}</p>` : ''}
    ${yardim}
    <div class="alan">
      <label for="anahtar-${kacis(s.id)}">API anahtarı</label>
      <div class="anahtar-sarmal">
        <input id="anahtar-${kacis(s.id)}" type="password" autocomplete="off" spellcheck="false" data-alan="anahtar" value="${kacis(s.anahtar || '')}" placeholder="Anahtarı buraya yapıştır">
        <button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="goster" aria-label="Anahtarı göster ya da gizle">Göster</button>
      </div>
    </div>
    ${kompakt ? '' : `
    <div class="alan">
      <label for="model-${kacis(s.id)}">Model</label>
      <div class="anahtar-sarmal">
        <input id="model-${kacis(s.id)}" list="liste-${kacis(s.id)}" data-alan="model" value="${kacis(s.model || '')}" placeholder="Model adı ya da listeden seç">
        <datalist id="liste-${kacis(s.id)}"></datalist>
        <button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="modeller">Modelleri getir</button>
      </div>
    </div>`}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button type="button" class="dugme dugme-cerceve dugme-kucuk" data-eylem="dene">Dene</button>
      ${!kompakt && !s.yerlesik ? '<button type="button" class="dugme dugme-tehlike dugme-kucuk" data-eylem="sil">Kaldır</button>' : ''}
      <span class="anahtar-sonuc" data-sonuc aria-live="polite"></span>
    </div>
  </div>`;
}

function etiketiYenile(kart, u) {
  const s = u.servisler().find((x) => x.id === kart.dataset.servis);
  const et = kart.querySelector('.servis-ust .etiket');
  if (!s || !et) return;
  const e = servisEtiketi(s);
  et.className = `etiket etiket-${e.renk}`;
  et.textContent = e.metin;
}

// Servis kartlarındaki olayları bağlar (Ayarlar ve sihirbaz ortak kullanır).
export function servisKartlariniBagla(kok, u) {
  if (kok.dataset.bagli) return;
  kok.dataset.bagli = '1';
  kok.addEventListener('change', async (olay) => {
    const kart = olay.target.closest('[data-servis]');
    if (!kart) return;
    const id = kart.dataset.servis;
    const alan = olay.target.dataset.alan;
    if (!alan) return;
    const s = u.ayarlar.servisler.find((x) => x.id === id);
    if (!s) return;
    if (alan === 'anahtar') {
      u.anahtarlar[id] = olay.target.value.trim();
      durumAyarla(id, 'hazir');
      dinlenmeBitti(id);
      await u.anahtarlariKaydet();
    } else if (alan === 'acik') {
      s.acik = olay.target.checked;
      await u.ayarlariKaydet();
    } else if (alan === 'model') {
      s.model = olay.target.value.trim();
      durumAyarla(id, 'hazir');
      await u.ayarlariKaydet();
    }
    etiketiYenile(kart, u);
    u.paneliYenile();
  });

  kok.addEventListener('click', async (olay) => {
    const dugme = olay.target.closest('[data-eylem]');
    if (!dugme) return;
    const kart = dugme.closest('[data-servis]');
    if (!kart) return;
    const id = kart.dataset.servis;
    const sonuc = kart.querySelector('[data-sonuc]');
    const yaz = (metin, tur) => { sonuc.textContent = metin; sonuc.className = `anahtar-sonuc ${tur}`; };
    const eylem = dugme.dataset.eylem;

    if (eylem === 'goster') {
      const girdi = kart.querySelector('[data-alan="anahtar"]');
      girdi.type = girdi.type === 'password' ? 'text' : 'password';
      dugme.textContent = girdi.type === 'password' ? 'Göster' : 'Gizle';
      return;
    }
    // Kutudaki son değeri hemen al (change olayı henüz gelmemiş olabilir).
    const anahtarGirdi = kart.querySelector('[data-alan="anahtar"]');
    if (anahtarGirdi && anahtarGirdi.value.trim() !== (u.anahtarlar[id] || '')) {
      u.anahtarlar[id] = anahtarGirdi.value.trim();
      await u.anahtarlariKaydet();
    }
    const modelGirdi = kart.querySelector('[data-alan="model"]');
    const s0 = u.ayarlar.servisler.find((x) => x.id === id);
    if (modelGirdi && s0 && modelGirdi.value.trim() !== (s0.model || '')) {
      s0.model = modelGirdi.value.trim();
      await u.ayarlariKaydet();
    }
    const s = u.servisler().find((x) => x.id === id);
    if (!s) return;

    if (eylem === 'modeller') {
      yaz('Liste getiriliyor...', 'bilgi');
      dugme.disabled = true;
      try {
        const liste = await modelleriGetir(s);
        const dl = kart.querySelector('datalist');
        dl.innerHTML = liste.map((m) => `<option value="${kacis(m)}"></option>`).join('');
        yaz(`${liste.length} model bulundu. Model kutusuna tıklayıp seçebilirsin.`, 'iyi');
      } catch (h) {
        yaz(h.message, 'kotu');
      } finally {
        dugme.disabled = false;
      }
    } else if (eylem === 'dene') {
      yaz('Deneniyor...', 'bilgi');
      dugme.disabled = true;
      try {
        const cevap = await dene(s);
        durumAyarla(id, 'hazir');
        dinlenmeBitti(id);
        yaz(`Çalışıyor. Cevap: "${cevap}"`, 'iyi');
      } catch (h) {
        durumAyarla(id, h instanceof AnahtarHatasi ? 'anahtar' : 'hata', h.message);
        yaz(h.message, 'kotu');
      } finally {
        dugme.disabled = false;
        etiketiYenile(kart, u);
        u.paneliYenile();
      }
    } else if (eylem === 'sil') {
      if (!confirm(`${s.ad} kaldırılsın mı?`)) return;
      u.ayarlar.servisler = u.ayarlar.servisler.filter((x) => x.id !== id);
      delete u.anahtarlar[id];
      await u.ayarlariKaydet();
      await u.anahtarlariKaydet();
      u.ayarlariCiz();
    }
  });
}

export function ayarlariCiz(kap, u) {
  const servisler = u.servisler();
  const a = u.ayarlar;
  kap.innerHTML = `
  <div class="ayarlar">
    <section class="kart servis">
      <h2>Genel</h2>
      <div class="alan-satir">
        <div class="alan">
          <label for="ayBaskan">Başkan model</label>
          <select id="ayBaskan">
            ${servisler.map((s) => `<option value="${kacis(s.id)}" ${s.id === a.baskanId ? 'selected' : ''}>${kacis(s.ad)}</option>`).join('')}
          </select>
          <span class="soluk" style="font-size:14px">Cevapları özetler ve oylamayı çıkarır. Çalışmazsa sıradaki dener.</span>
        </div>
        <div class="alan">
          <label for="ayEsik">En az katılımcı</label>
          <input id="ayEsik" type="number" min="1" max="20" value="${a.esik}">
          <span class="soluk" style="font-size:14px">Bunun altına düşünce Meclis devam etmeden önce sorar.</span>
        </div>
        <div class="alan">
          <label for="aySure">Bekleme süresi (saniye)</label>
          <input id="aySure" type="number" min="20" max="300" value="${a.zamanAsimi}">
          <span class="soluk" style="font-size:14px">Bu sürede cevap vermeyen beklenmez.</span>
        </div>
      </div>
    </section>

    <section class="kart servis">
      <h2>Veri klasörü</h2>
      ${klasorDestekleniyor
        ? `<p class="soluk">${klasorAdi() ? `Seçili klasör: <strong>${kacis(klasorAdi())}</strong>. Meclis verileri bu klasörün içindeki "meclis" klasöründe durur. Drive masaüstü bu klasörü yedekliyorsa her şey Drive'a da gider.` : 'Henüz klasör seçilmedi; veriler şimdilik tarayıcıda duruyor.'}</p>
           <div><button type="button" class="dugme dugme-cerceve" id="ayKlasor">${klasorAdi() ? 'Klasörü değiştir' : 'Klasör seç'}</button></div>`
        : '<p class="soluk">Bu cihazda klasör seçilemiyor; veriler tarayıcıda saklanıyor. Drive üzerinden erişim 4. aşamada gelecek.</p>'}
    </section>

    <section class="servis">
      <h2>Yapay zekalar</h2>
      <p class="soluk">Anahtarlar şifrenle kilitlenip veri klasörüne kaydedilir. Bir servis tarayıcıdan bağlanmaya izin vermezse "Dene" bunu gösterir.</p>
    </section>
    ${servisler.map((s) => servisKarti(s)).join('')}

    <section class="kart servis">
      <h2>Yapay zeka ekle</h2>
      <p class="soluk">Yeni bir servis çıktığında kod güncellemesi gerekmeden buradan eklenir. OpenAI uyumlu istek biçimini kullanan her servis çalışır.</p>
      <form id="ekleFormu" class="servis">
        <div class="alan-satir">
          <div class="alan"><label for="ekAd">Görünen ad</label><input id="ekAd" required placeholder="Örneğin: Cerebras"></div>
          <div class="alan"><label for="ekModel">Model adı</label><input id="ekModel" placeholder="Sonra listeden de seçebilirsin"></div>
        </div>
        <div class="alan"><label for="ekAdres">Adres</label><input id="ekAdres" required type="url" placeholder="https://.../v1"></div>
        <div class="alan"><label for="ekAnahtar">API anahtarı</label><input id="ekAnahtar" type="password" autocomplete="off"></div>
        <div><button type="submit" class="dugme dugme-ana">Ekle</button></div>
      </form>
    </section>

    <section class="kart servis">
      <h2>Şifre</h2>
      <p class="soluk">Anahtarları kilitleyen şifre bu cihazda ${u.cihazdaHatirlaniyor() ? 'hatırlanıyor' : 'hatırlanmıyor'}.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${u.cihazdaHatirlaniyor() ? '<button type="button" class="dugme dugme-cerceve" id="ayUnut">Bu cihazda unut</button>' : ''}
        <button type="button" class="dugme dugme-cerceve" id="aySihirbaz">Kurulum sihirbazını yeniden aç</button>
      </div>
    </section>
  </div>`;

  kap.querySelector('#ayBaskan').addEventListener('change', async (o) => { a.baskanId = o.target.value; await u.ayarlariKaydet(); });
  kap.querySelector('#ayEsik').addEventListener('change', async (o) => { a.esik = Math.max(1, parseInt(o.target.value, 10) || 3); await u.ayarlariKaydet(); });
  kap.querySelector('#aySure').addEventListener('change', async (o) => { a.zamanAsimi = Math.min(300, Math.max(20, parseInt(o.target.value, 10) || 90)); await u.ayarlariKaydet(); });
  kap.querySelector('#ayKlasor')?.addEventListener('click', () => u.klasorDegistir());
  kap.querySelector('#ayUnut')?.addEventListener('click', async () => { await u.cihazdaUnut(); u.ayarlariCiz(); });
  kap.querySelector('#aySihirbaz').addEventListener('click', () => u.sihirbaziAc());

  kap.querySelector('#ekleFormu').addEventListener('submit', async (o) => {
    o.preventDefault();
    const ad = kap.querySelector('#ekAd').value.trim();
    const adres = kap.querySelector('#ekAdres').value.trim().replace(/\/(chat\/completions)?\/?$/, '');
    if (!ad || !adres) return;
    let id = ad.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'servis';
    while (a.servisler.some((s) => s.id === id)) id += '-2';
    a.servisler.push({ id, ad, tur: 'openai', adres, model: kap.querySelector('#ekModel').value.trim(), acik: true, yerlesik: false });
    const anahtar = kap.querySelector('#ekAnahtar').value.trim();
    if (anahtar) u.anahtarlar[id] = anahtar;
    await u.ayarlariKaydet();
    await u.anahtarlariKaydet();
    u.bildir(`${ad} eklendi. "Dene" ile çalıştığını kontrol et.`);
    u.ayarlariCiz();
  });

  servisKartlariniBagla(kap, u);
}
