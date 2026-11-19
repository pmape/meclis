// Meclis sayfası ile Chrome eklentisi arasındaki köprü.
// Web sayfaları güvenlik nedeniyle başka sitelere yazı yazamaz; bunu eklenti yapar.
// Sayfa ile eklenti window.postMessage üzerinden konuşur.

export const SITELER = [
  { id: 'site-deepseek', ad: 'DeepSeek', site: 'deepseek', adres: 'https://chat.deepseek.com/' },
  { id: 'site-kimi', ad: 'Kimi', site: 'kimi', adres: 'https://www.kimi.com/' },
  { id: 'site-chatgpt', ad: 'ChatGPT', site: 'chatgpt', adres: 'https://chatgpt.com/' },
  { id: 'site-grok', ad: 'Grok', site: 'grok', adres: 'https://grok.com/' },
  { id: 'site-gemini', ad: 'Gemini (site)', site: 'gemini', adres: 'https://gemini.google.com/app' },
  { id: 'site-claude', ad: 'Claude (site)', site: 'claude', adres: 'https://claude.ai/new', onemli: true }
];

let bagli = false;
let surum = null;
const bekleyenler = new Map();
const dinleyiciler = new Set();
let sayac = 0;

if (typeof window !== 'undefined') window.addEventListener('message', (olay) => {
  if (olay.source !== window) return;
  const m = olay.data;
  if (!m || m.kaynak !== 'meclis-eklenti') return;
  if (m.tip === 'merhaba-cevap') {
    bagli = true;
    surum = m.surum || null;
    dinleyiciler.forEach((f) => f());
    return;
  }
  const b = bekleyenler.get(m.id);
  if (!b) return;
  if (m.tip === 'cevap') {
    bekleyenler.delete(m.id);
    clearTimeout(b.zamanlayici);
    if (m.hata) b.reddet(new Error(m.hata)); else b.coz(m.metin);
  }
});

export function eklentiBagli() { return bagli; }
export function eklentiSurumu() { return surum; }
export function eklentiDinle(f) { dinleyiciler.add(f); return () => dinleyiciler.delete(f); }

// Sayfa açılınca ve birkaç saniye boyunca eklentiyi yoklar.
export function eklentiyiYokla() {
  let kalan = 6;
  const yokla = () => {
    if (bagli || kalan-- <= 0) return;
    window.postMessage({ kaynak: 'meclis-sayfa', tip: 'merhaba' }, '*');
    setTimeout(yokla, 700);
  };
  yokla();
}

// Siteye soruyu gönderir, cevabın metnini döndürür.
export function sitedenSor(site, metin, { zamanAsimi = 180 } = {}) {
  if (!bagli) return Promise.reject(new Error('Chrome eklentisi bağlı değil'));
  const id = `istek-${Date.now()}-${++sayac}`;
  return new Promise((coz, reddet) => {
    const zamanlayici = setTimeout(() => {
      bekleyenler.delete(id);
      reddet(new Error(`${zamanAsimi} saniyede cevap gelmedi`));
    }, zamanAsimi * 1000);
    bekleyenler.set(id, { coz, reddet, zamanlayici });
    window.postMessage({ kaynak: 'meclis-sayfa', tip: 'sor', id, site, metin, zamanAsimi }, '*');
  });
}
