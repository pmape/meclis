// Verilerin nerede saklandığı.
// Bilgisayarda (Chrome/Edge): kullanıcının seçtiği klasör. Drive masaüstü programı
// bu klasörü Google Drive'a yedekler; Meclis Drive ile ayrıca uğraşmaz.
// Klasör seçilemeyen yerlerde (tablet, Firefox): tarayıcının kendi deposu (IndexedDB).
// Meclis'in verileri seçilen klasörün içindeki "meclis" alt klasöründe durur.

const DB_ADI = 'meclis';
const DEPO = 'kv';
const VERI_KLASORU = 'meclis';

let dbSozu = null;
function db() {
  if (!dbSozu) {
    dbSozu = new Promise((coz, reddet) => {
      const istek = indexedDB.open(DB_ADI, 1);
      istek.onupgradeneeded = () => istek.result.createObjectStore(DEPO);
      istek.onsuccess = () => coz(istek.result);
      istek.onerror = () => reddet(istek.error);
    });
  }
  return dbSozu;
}

export async function kvAl(anahtar) {
  const d = await db();
  return new Promise((coz, reddet) => {
    const istek = d.transaction(DEPO).objectStore(DEPO).get(anahtar);
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => reddet(istek.error);
  });
}

export async function kvYaz(anahtar, deger) {
  const d = await db();
  return new Promise((coz, reddet) => {
    const t = d.transaction(DEPO, 'readwrite');
    t.objectStore(DEPO).put(deger, anahtar);
    t.oncomplete = () => coz();
    t.onerror = () => reddet(t.error);
  });
}

export async function kvSil(anahtar) {
  const d = await db();
  return new Promise((coz, reddet) => {
    const t = d.transaction(DEPO, 'readwrite');
    t.objectStore(DEPO).delete(anahtar);
    t.oncomplete = () => coz();
    t.onerror = () => reddet(t.error);
  });
}

async function kvAnahtarlari(onEk) {
  const d = await db();
  return new Promise((coz, reddet) => {
    const istek = d.transaction(DEPO).objectStore(DEPO).getAllKeys();
    istek.onsuccess = () => coz(istek.result.filter((k) => typeof k === 'string' && k.startsWith(onEk)));
    istek.onerror = () => reddet(istek.error);
  });
}

// ---------- Klasör ----------

export const klasorDestekleniyor = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let kokKlasor = null; // FileSystemDirectoryHandle (kullanıcının seçtiği)
let veriKlasoru = null; // kokKlasor/meclis

export function klasorAdi() { return kokKlasor?.name || null; }
export function klasorKullaniliyor() { return !!veriKlasoru; }

export async function klasorSec() {
  const secilen = await window.showDirectoryPicker({ id: 'meclis', mode: 'readwrite' });
  await klasoruBagla(secilen);
  await kvYaz('klasor', secilen);
  return secilen.name;
}

async function klasoruBagla(kok) {
  kokKlasor = kok;
  veriKlasoru = await kok.getDirectoryHandle(VERI_KLASORU, { create: true });
}

// Daha önce seçilmiş klasörü geri yükler. Tarayıcı izni yeniden isteyebilir:
// 'hazir' | 'izin-gerekli' | 'yok'
export async function kayitliKlasoruYukle() {
  if (!klasorDestekleniyor) return 'yok';
  const kok = await kvAl('klasor');
  if (!kok) return 'yok';
  const izin = await kok.queryPermission({ mode: 'readwrite' });
  if (izin === 'granted') { await klasoruBagla(kok); return 'hazir'; }
  kokKlasor = kok;
  return 'izin-gerekli';
}

// Bir düğme tıklamasının içinden çağrılmalı (tarayıcı kuralı).
export async function klasorIzniIste() {
  if (!kokKlasor) return false;
  const izin = await kokKlasor.requestPermission({ mode: 'readwrite' });
  if (izin !== 'granted') return false;
  await klasoruBagla(kokKlasor);
  return true;
}

export async function klasoruBirak() {
  kokKlasor = null;
  veriKlasoru = null;
  await kvSil('klasor');
}

// ---------- Dosya işlemleri (klasör ya da tarayıcı deposu) ----------

async function altKlasor(yolParcalari, olustur) {
  let k = veriKlasoru;
  for (const p of yolParcalari) k = await k.getDirectoryHandle(p, { create: olustur });
  return k;
}

function yolBol(yol) {
  const parcalar = yol.split('/').filter(Boolean);
  return { klasorler: parcalar.slice(0, -1), ad: parcalar[parcalar.length - 1] };
}

export async function dosyaYaz(yol, metin) {
  if (!veriKlasoru) return kvYaz(`dosya:${yol}`, metin);
  const { klasorler, ad } = yolBol(yol);
  const k = await altKlasor(klasorler, true);
  const dosya = await k.getFileHandle(ad, { create: true });
  const yazici = await dosya.createWritable();
  await yazici.write(metin);
  await yazici.close();
}

export async function dosyaOku(yol) {
  if (!veriKlasoru) return (await kvAl(`dosya:${yol}`)) ?? null;
  try {
    const { klasorler, ad } = yolBol(yol);
    const k = await altKlasor(klasorler, false);
    const dosya = await k.getFileHandle(ad);
    return await (await dosya.getFile()).text();
  } catch (h) {
    if (h?.name === 'NotFoundError') return null;
    throw h;
  }
}

export async function dosyaSil(yol) {
  if (!veriKlasoru) return kvSil(`dosya:${yol}`);
  try {
    const { klasorler, ad } = yolBol(yol);
    const k = await altKlasor(klasorler, false);
    await k.removeEntry(ad);
  } catch (h) {
    if (h?.name !== 'NotFoundError') throw h;
  }
}

export async function jsonOku(yol, varsayilan = null) {
  const metin = await dosyaOku(yol);
  if (metin == null) return varsayilan;
  try { return JSON.parse(metin); } catch { return varsayilan; }
}

export async function jsonYaz(yol, veri) {
  return dosyaYaz(yol, JSON.stringify(veri, null, 2));
}

// Klasör seçildiğinde, daha önce tarayıcı deposunda biriken verileri klasöre taşır.
export async function tarayicidanKlasoreTasi() {
  if (!veriKlasoru) return 0;
  const anahtarlar = await kvAnahtarlari('dosya:');
  let sayi = 0;
  for (const a of anahtarlar) {
    const yol = a.slice('dosya:'.length);
    const mevcut = await dosyaOku(yol);
    if (mevcut == null) {
      await dosyaYaz(yol, await kvAl(a));
      sayi++;
    }
    await kvSil(a);
  }
  return sayi;
}
