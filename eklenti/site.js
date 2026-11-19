// Meclis Köprüsü — sitelerin içinde çalışan kısım.
// Soruyu sitenin yazı kutusuna yazar, gönderir ve cevabın bitmesini izler.
// Siteler tasarımlarını sık değiştirir; bu yüzden her site için ipuçları + genel bir yedek yöntem var.

const IPUCLARI = {
  'chat.deepseek.com': {
    girdi: ['textarea#chat-input', 'textarea'],
    cevap: ['.ds-markdown'],
    mesgul: []
  },
  'www.kimi.com': {
    girdi: ['.chat-input-editor[contenteditable="true"]', '[contenteditable="true"]', 'textarea'],
    cevap: ['.segment-assistant .markdown', '.markdown-container', '.markdown'],
    mesgul: ['.stop-message-btn', '[class*="stop"]']
  },
  'kimi.com': null,
  'chatgpt.com': {
    girdi: ['#prompt-textarea', '[contenteditable="true"]', 'textarea'],
    gonder: ['[data-testid="send-button"]', 'button#composer-submit-button'],
    cevap: ['[data-message-author-role="assistant"]'],
    mesgul: ['[data-testid="stop-button"]']
  },
  'grok.com': {
    girdi: ['textarea', '[contenteditable="true"]'],
    gonder: ['button[type="submit"]', 'button[aria-label="Submit"]'],
    cevap: ['.message-bubble .response-content-markdown', '[class*="response-content"]'],
    mesgul: ['button[aria-label*="Stop"]']
  },
  'gemini.google.com': {
    girdi: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]', '[contenteditable="true"]'],
    gonder: ['button.send-button', 'button[aria-label*="Send"]', 'button[aria-label*="Gönder"]'],
    cevap: ['message-content .markdown', 'message-content', '.model-response-text'],
    mesgul: ['button[aria-label*="Stop"]', 'button[aria-label*="Durdur"]']
  },
  'claude.ai': {
    girdi: ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"]'],
    gonder: ['button[aria-label*="Send"]', 'button[aria-label*="Gönder"]'],
    cevap: ['.font-claude-response', '[data-is-streaming] .font-claude-message', '.font-claude-message'],
    mesgul: ['[data-is-streaming="true"]', 'button[aria-label*="Stop"]']
  }
};
IPUCLARI['kimi.com'] = IPUCLARI['www.kimi.com'];

const ip = IPUCLARI[location.hostname] || { girdi: [], cevap: [], mesgul: [] };
const GENEL_CEVAP = ['[data-message-author-role="assistant"]', '.markdown', '[class*="markdown"]', '.prose'];
const GENEL_MESGUL = ['button[aria-label*="Stop" i]', 'button[aria-label*="Durdur" i]', '[data-testid="stop-button"]'];
const GENEL_GONDER = ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Gönder" i]', 'button[type="submit"]'];

const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

function gorunur(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function ilkGorunen(secicler) {
  for (const s of secicler || []) {
    const adaylar = [...document.querySelectorAll(s)].filter(gorunur);
    if (adaylar.length) return adaylar[adaylar.length - 1];
  }
  return null;
}

function girdiBul() {
  const ipucu = ilkGorunen(ip.girdi);
  if (ipucu) return ipucu;
  // Yedek: sayfanın alt kısmındaki en büyük yazı alanı.
  const adaylar = [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(gorunur);
  adaylar.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
  return adaylar[0] || null;
}

function cevapElemanlari() {
  for (const s of [...(ip.cevap || []), ...GENEL_CEVAP]) {
    const l = [...document.querySelectorAll(s)];
    if (l.length) return l;
  }
  return [];
}

function mesgulMu() {
  return [...(ip.mesgul || []), ...GENEL_MESGUL].some((s) => {
    try { return [...document.querySelectorAll(s)].some(gorunur); } catch { return false; }
  });
}

function girisGerekliMi() {
  const metin = document.body?.innerText?.slice(0, 3000) || '';
  return /log ?in|sign ?in|sign ?up|giriş yap|oturum aç|continue with google/i.test(metin) && !girdiBul();
}

function girdiyeYaz(el, metin) {
  el.focus();
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const ayarlayici = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    ayarlayici ? ayarlayici.call(el, metin) : (el.value = metin);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  // contenteditable (ChatGPT, Claude, Gemini, Kimi): önce yapıştırma olayı dene, olmazsa insertText.
  const secim = window.getSelection();
  secim.selectAllChildren(el);
  let yazildi = false;
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', metin);
    const olay = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(olay);
    yazildi = olay.defaultPrevented && el.innerText.trim().length > 0;
  } catch { /* bazı tarayıcılarda desteklenmez */ }
  if (!yazildi) {
    secim.selectAllChildren(el);
    document.execCommand('insertText', false, metin);
  }
}

function girdiDolu(el) {
  const v = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText;
  return v.trim().length > 0;
}

function enterBas(el) {
  for (const tip of ['keydown', 'keypress', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(tip, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
}

let durum = null;

async function gonder(metin) {
  let el = null;
  for (let i = 0; i < 30 && !el; i++) { el = girdiBul(); if (!el) await bekle(500); }
  if (!el) {
    return { hata: girisGerekliMi() ? `Bu siteye Chrome'da giriş yapman gerekiyor (${location.hostname}).` : `Yazı kutusu bulunamadı (${location.hostname}). Site tasarımı değişmiş olabilir.` };
  }
  const onceki = cevapElemanlari();
  durum = {
    baslangicSayi: onceki.length,
    baslangicMetin: onceki.length ? onceki[onceki.length - 1].innerText : '',
    sonMetin: '',
    sonDegisim: Date.now(),
    gonderim: Date.now()
  };
  girdiyeYaz(el, metin);
  await bekle(600);
  enterBas(el);
  await bekle(1500);
  if (girdiDolu(el)) {
    const dugme = ilkGorunen([...(ip.gonder || []), ...GENEL_GONDER]);
    if (dugme && !dugme.disabled) dugme.click();
    await bekle(1000);
  }
  if (girdiDolu(el) && cevapElemanlari().length === durum.baslangicSayi) {
    return { hata: `Soru gönderilemedi (${location.hostname}). Gönder düğmesi bulunamadı.` };
  }
  return { tamam: true };
}

function durumBildir(zorla) {
  if (!durum) return { hata: 'Gönderilmiş bir soru yok' };
  const l = cevapElemanlari();
  const yeniVar = l.length > durum.baslangicSayi || (l.length && l[l.length - 1].innerText !== durum.baslangicMetin);
  const metin = yeniVar ? l[l.length - 1].innerText.trim() : '';
  if (metin !== durum.sonMetin) { durum.sonMetin = metin; durum.sonDegisim = Date.now(); }
  const sakin = Date.now() - durum.sonDegisim > 4000;
  const bitti = !!metin && sakin && !mesgulMu();
  return { bitti: bitti || (zorla && !!metin), metin };
}

chrome.runtime.onMessage.addListener((m, _g, cevap) => {
  if (m?.tip === 'gonder') {
    gonder(String(m.metin || '')).then(cevap, (h) => cevap({ hata: String(h?.message || h) }));
    return true;
  }
  if (m?.tip === 'durum') {
    cevap(durumBildir(m.zorla));
  }
  return false;
});
