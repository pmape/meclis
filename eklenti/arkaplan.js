// Meclis Köprüsü — arka plan.
// Meclis'ten gelen soruyu ilgili sitenin sekmesine iletir, cevap bitince Meclis'e geri gönderir.
// Siteler, kullanıcının penceresini karıştırmamak için ayrı bir "Meclis siteleri" penceresinde açılır.

const SITELER = {
  deepseek: { yeni: 'https://chat.deepseek.com/', desen: ['https://chat.deepseek.com/*'] },
  kimi: { yeni: 'https://www.kimi.com/', desen: ['https://www.kimi.com/*', 'https://kimi.com/*'] },
  chatgpt: { yeni: 'https://chatgpt.com/', desen: ['https://chatgpt.com/*'] },
  grok: { yeni: 'https://grok.com/', desen: ['https://grok.com/*'] },
  gemini: { yeni: 'https://gemini.google.com/app', desen: ['https://gemini.google.com/*'] },
  claude: { yeni: 'https://claude.ai/new', desen: ['https://claude.ai/*'] }
};

const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));
const kuyruklar = {}; // aynı siteye gelen istekler sırayla işlenir

chrome.runtime.onMessage.addListener((m, gonderen) => {
  if (m?.tip !== 'sor' || !gonderen.tab) return;
  const meclisSekmesi = gonderen.tab.id;
  const site = SITELER[m.site];
  if (!site) {
    cevapla(meclisSekmesi, m.id, null, 'Bilinmeyen site');
    return;
  }
  const onceki = kuyruklar[m.site] || Promise.resolve();
  kuyruklar[m.site] = onceki.then(() => isle(m, site, meclisSekmesi)).catch(() => {});
});

function cevapla(sekme, id, metin, hata) {
  chrome.tabs.sendMessage(sekme, { tip: 'cevap', id, metin, hata }).catch(() => {});
}

async function siteleriPenceresi() {
  const { pencereId } = await chrome.storage.session.get('pencereId');
  if (pencereId) {
    try { await chrome.windows.get(pencereId); return pencereId; } catch { /* kapatılmış */ }
  }
  const p = await chrome.windows.create({ url: 'about:blank', focused: false, width: 900, height: 800, state: 'normal' });
  await chrome.storage.session.set({ pencereId: p.id });
  return p.id;
}

async function sekmeHazirla(adi, site) {
  const pencere = await siteleriPenceresi();
  const { sekmeler = {} } = await chrome.storage.session.get('sekmeler');
  let sekme = null;
  if (sekmeler[adi]) {
    try { sekme = await chrome.tabs.get(sekmeler[adi]); } catch { sekme = null; }
  }
  if (sekme) {
    // Her soru için yeni sohbet açılır ki önceki konuşma karışmasın.
    await chrome.tabs.update(sekme.id, { url: site.yeni });
  } else {
    sekme = await chrome.tabs.create({ windowId: pencere, url: site.yeni, active: true });
    sekmeler[adi] = sekme.id;
    await chrome.storage.session.set({ sekmeler });
    // Pencerede kalan boş sekmeyi kapat.
    const bos = await chrome.tabs.query({ windowId: pencere, url: 'about:blank' }).catch(() => []);
    for (const b of bos) chrome.tabs.remove(b.id).catch(() => {});
  }
  // Sayfanın yüklenmesini bekle.
  const bitis = Date.now() + 45000;
  await bekle(800);
  while (Date.now() < bitis) {
    const s = await chrome.tabs.get(sekme.id);
    if (s.status === 'complete') break;
    await bekle(500);
  }
  // Sekmeyi kendi penceresinde öne al ki site cevabı yazarken yavaşlamasın.
  await chrome.tabs.update(sekme.id, { active: true }).catch(() => {});
  return sekme.id;
}

async function siteyeSor(sekme, mesaj, deneme = 25) {
  for (let i = 0; i < deneme; i++) {
    try {
      const c = await chrome.tabs.sendMessage(sekme, mesaj);
      if (c) return c;
    } catch { /* site betiği henüz hazır değil */ }
    await bekle(1000);
  }
  return { hata: 'Sitenin sayfası cevap vermedi' };
}

async function isle(m, site, meclisSekmesi) {
  const zamanAsimi = Math.min(Math.max(Number(m.zamanAsimi) || 180, 60), 600) * 1000;
  const bitis = Date.now() + zamanAsimi;
  try {
    const sekme = await sekmeHazirla(m.site, site);
    const g = await siteyeSor(sekme, { tip: 'gonder', metin: m.metin });
    if (g.hata) { cevapla(meclisSekmesi, m.id, null, g.hata); return; }
    while (Date.now() < bitis) {
      await bekle(2000);
      const d = await siteyeSor(sekme, { tip: 'durum' }, 3);
      if (d.hata) { cevapla(meclisSekmesi, m.id, null, d.hata); return; }
      if (d.bitti) { cevapla(meclisSekmesi, m.id, d.metin); return; }
    }
    const son = await siteyeSor(sekme, { tip: 'durum', zorla: true }, 2);
    if (son.metin) cevapla(meclisSekmesi, m.id, son.metin);
    else cevapla(meclisSekmesi, m.id, null, 'Site zamanında cevap vermedi');
  } catch (h) {
    cevapla(meclisSekmesi, m.id, null, String(h?.message || h));
  }
}
