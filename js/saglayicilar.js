// Yapay zeka servisleriyle konuşan kısım.
// Servislerin çoğu ortak bir "dil" (OpenAI uyumlu istek biçimi) konuşur;
// Gemini kendi biçimini kullanır. Yeni bir servis eklemek için kod yazmak
// gerekmez: Ayarlar'daki "Yapay zeka ekle" formu OpenAI uyumlu her servisi kabul eder.

export class AnahtarHatasi extends Error {}
export class KotaHatasi extends Error {
  constructor(mesaj, bekleSaniye) { super(mesaj); this.bekleSaniye = bekleSaniye; }
}
export class BaglantiHatasi extends Error {}

// Başlangıç seti. Limitler Kasım 2026 araştırmasına göredir ve değişebilir.
export const YERLESIK_SERVISLER = [
  {
    id: 'gemini',
    ad: 'Gemini',
    tur: 'gemini',
    adres: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.8-flash',
    not: 'Ücretsiz; limitler model başına ve AI Studio\'da görünür. Türkiye\'de gönderilen veriler eğitimde kullanılabilir.',
    yardim: {
      url: 'https://aistudio.google.com/apikey',
      adimlar: [
        'Bağlantıyı aç ve Google hesabınla giriş yap.',
        '"Create API key" (API anahtarı oluştur) düğmesine bas.',
        'Oluşan anahtarı kopyalayıp aşağıdaki kutuya yapıştır.'
      ]
    }
  },
  {
    id: 'gemma',
    ad: 'Gemma',
    tur: 'gemini',
    adres: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemma-3-27b-it',
    anahtarKaynagi: 'gemini',
    sistemYok: true,
    not: 'Google\'ın açık modeli; Gemini anahtarınla çalışır, ayrı hesap gerekmez. Kotası bol (Gemma 3\'te günde 14.400 istek), Gemini meşgulken de cevap verir.'
  },
  {
    id: 'groq',
    ad: 'Groq',
    tur: 'openai',
    adres: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    not: 'Ücretsiz; model başına dakikada 30, günde 1.000 istek. Çok hızlı.',
    yardim: {
      url: 'https://console.groq.com/keys',
      adimlar: [
        'Bağlantıyı aç; Google hesabınla ya da e-postanla kaydol.',
        '"Create API Key" düğmesine bas, bir isim ver (örneğin Meclis).',
        'Anahtar sadece bir kez gösterilir: hemen kopyalayıp aşağıya yapıştır.'
      ]
    }
  },
  {
    id: 'openrouter',
    ad: 'OpenRouter',
    tur: 'openai',
    adres: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    modelFiltre: 'ucretsiz',
    not: 'Tek anahtarla birçok ücretsiz model; dakikada 20, günde 50 istek (bir kerelik 10 dolar yüklemeden sonra 1.000).',
    yardim: {
      url: 'https://openrouter.ai/keys',
      adimlar: [
        'Bağlantıyı aç ve giriş yap.',
        '"Create Key" düğmesine bas, bir isim ver.',
        'Anahtarı kopyalayıp aşağıya yapıştır. "openrouter/free" modeli o an çalışan ücretsiz modeli kendisi seçer.'
      ]
    }
  },
  {
    id: 'sambanova',
    ad: 'SambaNova',
    tur: 'openai',
    adres: 'https://api.sambanova.ai/v1',
    model: 'DeepSeek-V3.1',
    not: 'Ücretsiz, kart istemez. DeepSeek ve Llama modellerini sunar. Model başına günde sadece 20 istek.',
    yardim: {
      url: 'https://cloud.sambanova.ai/apis',
      adimlar: [
        'Bağlantıyı aç ve Google hesabınla ya da e-postanla kaydol.',
        'API Keys sayfasında "Create API Key" (anahtar oluştur) düğmesine bas.',
        'Anahtarı kopyalayıp aşağıya yapıştır. Model adı çalışmazsa "Modelleri getir" ile listeden DeepSeek ile başlayan birini seç.'
      ]
    }
  },
  {
    id: 'nvidia',
    ad: 'NVIDIA',
    tur: 'openai',
    adres: 'https://integrate.api.nvidia.com/v1',
    model: '',
    not: 'Deneme amaçlı ücretsiz erişim; telefon doğrulaması ister. Tarayıcıdan bağlantıya izin vermeyebilir: bu durumda Meclis bunu "bağlanamadı" diye gösterir.',
    yardim: {
      url: 'https://build.nvidia.com',
      adimlar: [
        'Bağlantıyı aç ve giriş yap (telefon doğrulaması istenebilir).',
        'Herhangi bir modelin sayfasında "Get API Key" düğmesine bas.',
        'Anahtarı kopyalayıp aşağıya yapıştır, sonra "Modelleri getir" ile bir model seç.'
      ]
    }
  }
];

function zamanAsimiSinyali(saniye, dis) {
  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(new BaglantiHatasi(`${saniye} saniyede cevap gelmedi`)), saniye * 1000);
  if (dis) dis.addEventListener('abort', () => kontrol.abort(dis.reason), { once: true });
  return { sinyal: kontrol.signal, temizle: () => clearTimeout(zamanlayici) };
}

const GECICI_HATALAR = new Set([500, 502, 503, 504, 529]);
const BEKLEMELER = [3, 8]; // saniye: geçici yoğunlukta önce 3, sonra 8 saniye bekleyip yeniden dener

const bekle = (sn) => new Promise((coz) => setTimeout(coz, sn * 1000));

// Servis "şu an çok yoğun" (503 vb.) derse hemen pes etmez, kısa aralarla yeniden dener.
async function istekGonder(url, secenekler, zamanAsimi, disSinyal) {
  for (let deneme = 0; ; deneme++) {
    try {
      return await tekIstek(url, secenekler, zamanAsimi, disSinyal);
    } catch (h) {
      const gecici = h instanceof BaglantiHatasi && GECICI_HATALAR.has(h.durumKodu);
      if (!gecici || deneme >= BEKLEMELER.length || disSinyal?.aborted) {
        if (gecici) h.message = `Servis şu an çok yoğun, birkaç denemede de cevap vermedi. Biraz sonra tekrar dene. (${h.durumKodu})`;
        throw h;
      }
      await bekle(BEKLEMELER[deneme]);
    }
  }
}

async function tekIstek(url, secenekler, zamanAsimi, disSinyal) {
  const { sinyal, temizle } = zamanAsimiSinyali(zamanAsimi, disSinyal);
  let yanit;
  try {
    yanit = await fetch(url, { ...secenekler, signal: sinyal });
  } catch (h) {
    if (sinyal.aborted) throw sinyal.reason instanceof Error ? sinyal.reason : new BaglantiHatasi('İstek durduruldu');
    throw new BaglantiHatasi('Servise bağlanılamadı. İnternet bağlantısı olmayabilir ya da servis tarayıcıdan bağlanmaya izin vermiyor olabilir.');
  } finally {
    temizle();
  }
  if (!yanit.ok) {
    let ayrinti = '';
    try { ayrinti = (await yanit.text()).slice(0, 400); } catch { /* boş */ }
    const kisa = hataMetniniCikar(ayrinti);
    if (yanit.status === 401 || yanit.status === 403) throw new AnahtarHatasi(`Anahtar kabul edilmedi${kisa ? ': ' + kisa : ''}`);
    if (yanit.status === 429 || yanit.status === 402) {
      const bekle = parseInt(yanit.headers.get('retry-after') || '', 10);
      throw new KotaHatasi(`Kota doldu${kisa ? ': ' + kisa : ''}`, Number.isFinite(bekle) ? bekle : null);
    }
    const h = new BaglantiHatasi(`Servis hata verdi (${yanit.status})${kisa ? ': ' + kisa : ''}`);
    h.durumKodu = yanit.status;
    throw h;
  }
  return yanit.json();
}

function hataMetniniCikar(metin) {
  if (!metin) return '';
  try {
    const j = JSON.parse(metin);
    const m = j?.error?.message || j?.message || j?.detail || (typeof j?.error === 'string' ? j.error : '');
    return String(m || '').slice(0, 200);
  } catch {
    return metin.replace(/<[^>]+>/g, ' ').trim().slice(0, 200);
  }
}

// mesajlar: [{ rol: 'sistem' | 'kullanici' | 'asistan', icerik: '...' }]
export async function sor(servis, mesajlar, { zamanAsimi = 90, sinyal, sicaklik = 0.7 } = {}) {
  if (!servis.anahtar) throw new AnahtarHatasi('Anahtar girilmemiş');
  if (!servis.model) throw new AnahtarHatasi('Model seçilmemiş');
  const calistir = (s) => (s.tur === 'gemini'
    ? geminiSor(s, mesajlar, zamanAsimi, sinyal, sicaklik)
    : openaiSor(s, mesajlar, zamanAsimi, sinyal, sicaklik));
  try {
    return await calistir(servis);
  } catch (h) {
    // Servis "bu model kapandı, şunu kullan" derse önerilen modelle bir kez daha dene.
    // Çağıran taraf yeniModel'i görünce ayarları kendisi günceller.
    const oneri = onerilenModel(h, servis.model);
    if (!oneri) throw h;
    const sonuc = await calistir({ ...servis, model: oneri });
    return { ...sonuc, yeniModel: oneri };
  }
}

// "... is no longer available ... use models/gemini-3.8-flash ..." gibi mesajlardan yeni model adını çıkarır.
export function onerilenModel(hata, eskiModel) {
  if (!(hata instanceof BaglantiHatasi)) return null;
  const m = String(hata.message).match(/\buse\s+(?:the\s+)?(?:model\s+)?models\/([A-Za-z0-9._\-]+)/i);
  if (!m) return null;
  const oneri = m[1].replace(/[.\-]+$/, '');
  return oneri && oneri !== String(eskiModel).replace(/^models\//, '') ? oneri : null;
}

async function openaiSor(servis, mesajlar, zamanAsimi, sinyal, sicaklik) {
  const rolHaritasi = { sistem: 'system', kullanici: 'user', asistan: 'assistant' };
  const basliklar = { 'Content-Type': 'application/json', Authorization: `Bearer ${servis.anahtar}` };
  if (servis.adres.includes('openrouter.ai')) basliklar['X-Title'] = 'Meclis';
  const veri = await istekGonder(
    `${servis.adres.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: basliklar,
      body: JSON.stringify({
        model: servis.model,
        messages: mesajlar.map((m) => ({ role: rolHaritasi[m.rol], content: m.icerik })),
        temperature: sicaklik
      })
    },
    zamanAsimi, sinyal
  );
  const secenek = veri?.choices?.[0];
  const metin = secenek?.message?.content ?? '';
  if (!metin.trim()) throw new BaglantiHatasi('Servis boş cevap döndürdü');
  return { metin: metin.trim(), model: veri?.model || servis.model };
}

async function geminiSor(servis, mesajlar, zamanAsimi, sinyal, sicaklik) {
  const sistem = mesajlar.filter((m) => m.rol === 'sistem').map((m) => m.icerik).join('\n\n');
  const icerik = mesajlar
    .filter((m) => m.rol !== 'sistem')
    .map((m) => ({ role: m.rol === 'asistan' ? 'model' : 'user', parts: [{ text: m.icerik }] }));
  const govde = { contents: icerik, generationConfig: { temperature: sicaklik } };
  if (sistem && servis.sistemYok) {
    // Gemma gibi modeller ayrı sistem talimatını kabul etmez; talimat ilk mesajın başına eklenir.
    const ilk = icerik.find((m) => m.role === 'user');
    if (ilk) ilk.parts[0].text = `${sistem}\n\n${ilk.parts[0].text}`;
  } else if (sistem) {
    govde.systemInstruction = { parts: [{ text: sistem }] };
  }
  const model = servis.model.replace(/^models\//, '');
  const veri = await istekGonder(
    `${servis.adres.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(servis.anahtar)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) },
    zamanAsimi, sinyal
  );
  const parcalar = veri?.candidates?.[0]?.content?.parts || [];
  const metin = parcalar.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!metin.trim()) {
    const neden = veri?.candidates?.[0]?.finishReason || veri?.promptFeedback?.blockReason;
    throw new BaglantiHatasi(`Gemini boş cevap döndürdü${neden ? ' (' + neden + ')' : ''}`);
  }
  return { metin: metin.trim(), model };
}

// Servisin güncel model listesini çeker (listeler sık değiştiği için elle yazılmaz).
export async function modelleriGetir(servis) {
  if (!servis.anahtar) throw new AnahtarHatasi('Önce anahtarı gir');
  if (servis.tur === 'gemini') {
    const veri = await istekGonder(
      `${servis.adres.replace(/\/$/, '')}/models?pageSize=200&key=${encodeURIComponent(servis.anahtar)}`,
      { method: 'GET' }, 30
    );
    return (veri.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort();
  }
  const veri = await istekGonder(
    `${servis.adres.replace(/\/$/, '')}/models`,
    { method: 'GET', headers: { Authorization: `Bearer ${servis.anahtar}` } }, 30
  );
  let liste = (veri.data || veri.models || []).map((m) => m.id || m.name).filter(Boolean);
  if (servis.modelFiltre === 'ucretsiz') {
    liste = liste.filter((id) => id.endsWith(':free') || id === 'openrouter/free');
    if (!liste.includes('openrouter/free')) liste.unshift('openrouter/free');
  }
  return [...new Set(liste)].sort();
}

// Ayarlar'daki "Dene" düğmesi için kısa bir deneme sorusu.
export async function dene(servis) {
  const sonuc = await sor(servis, [{ rol: 'kullanici', icerik: 'Sadece "hazırım" yaz.' }], { zamanAsimi: 45, sicaklik: 0 });
  return { metin: sonuc.metin.slice(0, 80), yeniModel: sonuc.yeniModel };
}
