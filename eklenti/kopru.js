// Meclis sayfası ile eklentinin arka planı arasında mesaj taşır.
// Sadece Meclis sayfasında (pmape.github.io ve yerel deneme adresleri) çalışır.

const SURUM = chrome.runtime.getManifest().version;

function sayfayaGonder(veri) {
  window.postMessage({ kaynak: 'meclis-eklenti', ...veri }, '*');
}

window.addEventListener('message', (olay) => {
  if (olay.source !== window) return;
  const m = olay.data;
  if (!m || m.kaynak !== 'meclis-sayfa') return;
  // Sadece Meclis sayfasının kendisi konuşabilir (pmape.github.io altındaki başka sayfalar değil).
  if (location.hostname.endsWith('github.io') && !location.pathname.startsWith('/meclis')) return;
  if (m.tip === 'merhaba') {
    sayfayaGonder({ tip: 'merhaba-cevap', surum: SURUM });
  } else if (m.tip === 'sor') {
    try {
      chrome.runtime.sendMessage({ tip: 'sor', id: m.id, site: m.site, metin: String(m.metin || ''), zamanAsimi: m.zamanAsimi });
    } catch (h) {
      sayfayaGonder({ tip: 'cevap', id: m.id, hata: 'Eklenti yeniden yüklenmiş; Meclis sayfasını yenile.' });
    }
  }
});

chrome.runtime.onMessage.addListener((m) => {
  if (m?.tip === 'cevap') sayfayaGonder({ tip: 'cevap', id: m.id, metin: m.metin, hata: m.hata });
});
