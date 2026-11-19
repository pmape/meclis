// İlk açılış kurulum sihirbazı:
// 1) veri klasörünü seç, 2) şifre belirle (ya da mevcut şifreyi gir),
// 3) ücretsiz servislerden anahtarları gir ve dene, 4) bitti.
// Ayrıca anahtar dosyası kilitliyken çıkan "şifreni gir" penceresi de burada.

import { kacis } from './metin.js';
import { klasorDestekleniyor, klasorAdi } from './depolama.js';
import { servisKarti, servisKartlariniBagla } from './ayarlar.js';
import { servisEtiketi } from './durum.js';

function pencereAc(icerik) {
  const p = document.getElementById('pencere');
  p.innerHTML = `<div class="pencere" role="dialog" aria-modal="true" aria-labelledby="pencereBaslik">${icerik}</div>`;
  p.hidden = false;
  const ilk = p.querySelector('input, button');
  ilk?.focus();
  return p;
}

export function pencereKapat() {
  const p = document.getElementById('pencere');
  p.hidden = true;
  p.innerHTML = '';
}

function adimCubugu(adim) {
  return `<div class="adimlar" aria-label="Adım ${adim} / 4">${[1, 2, 3, 4].map((i) => `<span class="${i <= adim ? 'gecti' : ''}"></span>`).join('')}</div>`;
}

export function sihirbaziBaslat(u) {
  let adim = 1;

  const ciz = () => {
    if (adim === 1) return adim1();
    if (adim === 2) return adim2();
    if (adim === 3) return adim3();
    return adim4();
  };

  function adim1() {
    const p = pencereAc(`
      ${adimCubugu(1)}
      <h2 id="pencereBaslik">Meclis'e hoş geldin</h2>
      <p>Meclis bir soruyu aynı anda birçok yapay zekaya sorar, cevapları karşılaştırır ve hangi çözümde birleştiklerini gösterir.</p>
      ${klasorDestekleniyor
        ? `<p><strong>Önce verilerin duracağı klasörü seç.</strong> Örneğin Google Drive masaüstünün yedeklediği bir klasör: sohbetlerin ve anahtarların böylece Drive'a da yedeklenir.</p>
           <p class="soluk" id="klasorBilgi">${klasorAdi() ? `Seçili: <strong>${kacis(klasorAdi())}</strong>` : 'Henüz klasör seçilmedi.'}</p>
           <div><button type="button" class="dugme dugme-cerceve" id="szKlasor">${klasorAdi() ? 'Başka klasör seç' : 'Klasör seç'}</button></div>`
        : `<div class="uyari">Bu cihazda klasör seçilemiyor. Veriler şimdilik bu tarayıcıda saklanır; Drive üzerinden erişim 4. aşamada gelecek.</div>`}
      <div class="pencere-alt">
        <span></span>
        <button type="button" class="dugme dugme-ana" id="szIleri">${klasorDestekleniyor && !klasorAdi() ? 'Klasörsüz devam et' : 'İleri'}</button>
      </div>`);
    p.querySelector('#szKlasor')?.addEventListener('click', async () => {
      try {
        await u.klasorDegistir({ sessiz: true });
        ciz();
      } catch (h) {
        if (h?.name !== 'AbortError') u.bildir(`Klasör seçilemedi: ${h.message}`);
      }
    });
    p.querySelector('#szIleri').addEventListener('click', () => { adim = 2; ciz(); });
  }

  function adim2() {
    const mevcut = u.anahtarDosyasiVar() && !u.kilitAcik();
    const zatenAcik = u.kilitAcik();
    const p = pencereAc(`
      ${adimCubugu(2)}
      <h2 id="pencereBaslik">${zatenAcik ? 'Şifre hazır' : mevcut ? 'Şifreni gir' : 'Bir şifre belirle'}</h2>
      ${zatenAcik
        ? '<p>Anahtarların zaten bir şifreyle kilitli ve bu cihazda açık. Bu adımı geçebilirsin.</p>'
        : mevcut
          ? '<p>Bu klasörde daha önce kaydedilmiş anahtarlar var. Onları açmak için şifreni gir.</p>'
          : '<p>API anahtarların bu şifreyle kilitlenip klasöre kaydedilir. Başka bir cihazda Meclis\'i açınca sadece bu şifreyi girersin.</p>'}
      ${zatenAcik ? '' : `
      <div class="alan">
        <label for="szSifre">Şifre</label>
        <input id="szSifre" type="password" autocomplete="${mevcut ? 'current-password' : 'new-password'}">
      </div>
      ${mevcut ? '' : `<div class="alan"><label for="szSifre2">Şifre (tekrar)</label><input id="szSifre2" type="password" autocomplete="new-password"></div>`}
      <label class="anahtar-cek"><input type="checkbox" id="szHatirla" checked> Bu cihazda hatırla (her açılışta sorulmaz)</label>
      <p class="soluk" style="font-size:14px">Şifreyi unutursan anahtarları yeniden girmen yeterli; hepsi ücretsiz servislerden geliyor.</p>`}
      <div class="hata-kutu" id="szHata" hidden></div>
      <div class="pencere-alt">
        <button type="button" class="dugme dugme-cerceve" id="szGeri">Geri</button>
        <button type="button" class="dugme dugme-ana" id="szIleri">İleri</button>
      </div>`);
    const hata = (m) => { const k = p.querySelector('#szHata'); k.textContent = m; k.hidden = false; };
    p.querySelector('#szGeri').addEventListener('click', () => { adim = 1; ciz(); });
    p.querySelector('#szIleri').addEventListener('click', async () => {
      if (zatenAcik) { adim = 3; return ciz(); }
      const s1 = p.querySelector('#szSifre').value;
      const hatirla = p.querySelector('#szHatirla').checked;
      if (mevcut) {
        const tamam = await u.kilidiAcSifreyle(s1, hatirla);
        if (!tamam) return hata('Şifre yanlış. Tekrar dene.');
      } else {
        const s2 = p.querySelector('#szSifre2').value;
        if (s1.length < 6) return hata('Şifre en az 6 karakter olmalı.');
        if (s1 !== s2) return hata('İki şifre aynı değil.');
        await u.yeniSifreBelirle(s1, hatirla);
      }
      adim = 3; ciz();
    });
  }

  function adim3() {
    const servisler = u.servisler().filter((s) => s.yerlesik);
    const p = pencereAc(`
      ${adimCubugu(3)}
      <h2 id="pencereBaslik">Ücretsiz anahtarları gir</h2>
      <p>Her servis için "Anahtar nasıl alınır?" kısmını aç, bağlantıdan anahtarı al, kutuya yapıştır ve "Dene"ye bas. En az bir servis yeterli ama ne kadar çok olursa Meclis o kadar güçlü olur. Sonradan Ayarlar'dan da ekleyebilirsin.</p>
      <div id="szServisler" style="display:flex;flex-direction:column;gap:12px">
        ${servisler.map((s) => servisKarti(s, { kompakt: true })).join('')}
      </div>
      <div class="pencere-alt">
        <button type="button" class="dugme dugme-cerceve" id="szGeri">Geri</button>
        <button type="button" class="dugme dugme-ana" id="szIleri">İleri</button>
      </div>`);
    servisKartlariniBagla(p, u);
    p.querySelector('#szGeri').addEventListener('click', () => { adim = 2; ciz(); });
    p.querySelector('#szIleri').addEventListener('click', async () => {
      // Kutularda kalan, change olayı gelmemiş değerleri de kaydet.
      for (const girdi of p.querySelectorAll('[data-alan="anahtar"]')) {
        const id = girdi.closest('[data-servis]').dataset.servis;
        u.anahtarlar[id] = girdi.value.trim();
      }
      await u.anahtarlariKaydet();
      adim = 4; ciz();
    });
  }

  function adim4() {
    const hazir = u.servisler().filter((s) => servisEtiketi(s).kullanilir);
    const p = pencereAc(`
      ${adimCubugu(4)}
      <h2 id="pencereBaslik">Hazırsın</h2>
      ${hazir.length
        ? `<p><strong>${hazir.length} yapay zeka</strong> Meclis'e katılmaya hazır: ${hazir.map((s) => kacis(s.ad)).join(', ')}.</p>`
        : '<div class="uyari">Henüz anahtarı girilmiş bir servis yok. Meclis\'i kullanmak için Ayarlar\'dan en az bir anahtar girmen gerekiyor.</div>'}
      ${hazir.length && hazir.length < u.ayarlar.esik ? `<p class="soluk">En az ${u.ayarlar.esik} katılımcı önerilir. Diğer anahtarları sonra Ayarlar'dan ekleyebilirsin.</p>` : ''}
      <p class="soluk">Windows'ta Chrome'un adres çubuğundaki "Uygulama olarak yükle" simgesiyle Meclis'i kendi penceresinde açılan bir uygulama gibi kurabilirsin.</p>
      <div class="pencere-alt">
        <button type="button" class="dugme dugme-cerceve" id="szGeri">Geri</button>
        <button type="button" class="dugme dugme-ana" id="szBitir">Meclis'i aç</button>
      </div>`);
    p.querySelector('#szGeri').addEventListener('click', () => { adim = 3; ciz(); });
    p.querySelector('#szBitir').addEventListener('click', async () => {
      u.ayarlar.kurulumTamam = true;
      await u.ayarlariKaydet();
      pencereKapat();
      u.yenidenCiz();
      document.getElementById('soru')?.focus();
    });
  }

  ciz();
}

// Anahtar dosyası var ama bu cihazda kilit açık değilse.
export function sifrePenceresi(u) {
  return new Promise((coz) => {
    const p = pencereAc(`
      <h2 id="pencereBaslik">Şifreni gir</h2>
      <p>API anahtarların şifreyle kilitli. Meclis'in yapay zekalara bağlanabilmesi için şifreni gir.</p>
      <form id="spForm" style="display:flex;flex-direction:column;gap:14px">
        <div class="alan"><label for="spSifre">Şifre</label><input id="spSifre" type="password" autocomplete="current-password"></div>
        <label class="anahtar-cek"><input type="checkbox" id="spHatirla" checked> Bu cihazda hatırla</label>
        <div class="hata-kutu" id="spHata" hidden>Şifre yanlış. Tekrar dene.</div>
        <div class="pencere-alt">
          <button type="button" class="dugme dugme-cerceve" id="spAtla">Şimdilik geç</button>
          <button type="submit" class="dugme dugme-ana">Aç</button>
        </div>
      </form>`);
    p.querySelector('#spForm').addEventListener('submit', async (o) => {
      o.preventDefault();
      const tamam = await u.kilidiAcSifreyle(p.querySelector('#spSifre').value, p.querySelector('#spHatirla').checked);
      if (!tamam) { p.querySelector('#spHata').hidden = false; return; }
      pencereKapat();
      coz(true);
    });
    p.querySelector('#spAtla').addEventListener('click', () => { pencereKapat(); coz(false); });
  });
}

// Tarayıcı, önceden seçilen klasöre erişim için yeniden izin isteyebilir.
export function klasorIzniPenceresi(ad) {
  return new Promise((coz) => {
    const p = pencereAc(`
      <h2 id="pencereBaslik">Klasöre erişim izni</h2>
      <p>Meclis verilerini <strong>${kacis(ad)}</strong> klasöründe tutuyor. Tarayıcı güvenlik için bu klasöre erişim iznini yeniden soruyor.</p>
      <div class="pencere-alt">
        <button type="button" class="dugme dugme-cerceve" id="kiHayir">Şimdi değil</button>
        <button type="button" class="dugme dugme-ana" id="kiEvet">İzin ver</button>
      </div>`);
    p.querySelector('#kiEvet').addEventListener('click', () => { pencereKapat(); coz(true); });
    p.querySelector('#kiHayir').addEventListener('click', () => { pencereKapat(); coz(false); });
  });
}
