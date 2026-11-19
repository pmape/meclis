import { eklentiBagli } from './eklenti-baglanti.js';

// Her yapay zekanın anlık durumu: hazır, bekliyor, kota doldu, hata...
// Kotası dolan servis bir süre dinlenmeye alınır, süre bitince kendiliğinden geri döner.

const SAKLAMA_ANAHTARI = 'meclis.dinlenme';
const VARSAYILAN_DINLENME_DK = 15;

const durumlar = new Map(); // id -> { durum, mesaj, zaman }
const dinleyiciler = new Set();

let dinlenme = {};
try { dinlenme = JSON.parse(localStorage.getItem(SAKLAMA_ANAHTARI) || '{}'); } catch { dinlenme = {}; }

function kaydet() {
  try { localStorage.setItem(SAKLAMA_ANAHTARI, JSON.stringify(dinlenme)); } catch { /* boş */ }
}

function bildir() { dinleyiciler.forEach((f) => f()); }

export function durumDinle(f) { dinleyiciler.add(f); return () => dinleyiciler.delete(f); }

export function durumAyarla(id, durum, mesaj = '') {
  durumlar.set(id, { durum, mesaj, zaman: Date.now() });
  bildir();
}

export function durumAl(id) { return durumlar.get(id); }

const NEDEN_YAZI = { kota: 'Kota doldu', baglanti: 'Bağlanamıyor' };

export function dinlenmeyeAl(id, saniye, neden = 'kota') {
  const sure = (saniye && saniye > 0 ? saniye : VARSAYILAN_DINLENME_DK * 60) * 1000;
  dinlenme[id] = { bitis: Date.now() + sure, neden };
  kaydet();
  bildir();
}

export function dinlenmeBitti(id) {
  delete dinlenme[id];
  kaydet();
  bildir();
}

// Dinlenmedeyse kalan dakikayı döndürür, değilse 0.
export function dinlenmeKalan(id) {
  const k = dinlenme[id];
  const bitis = typeof k === 'number' ? k : k?.bitis;
  if (!bitis) return 0;
  const kalan = bitis - Date.now();
  if (kalan <= 0) { delete dinlenme[id]; kaydet(); return 0; }
  return Math.ceil(kalan / 60000);
}

// Servisin bu turda kullanılıp kullanılamayacağını ve görünen etiketi verir.
export function servisEtiketi(servis) {
  if (!servis.acik) return { kullanilir: false, renk: 'gri', metin: 'Kapalı' };
  if (servis.tur === 'site') {
    if (!eklentiBagli()) return { kullanilir: false, renk: 'gri', metin: 'Eklenti yok' };
  } else {
    if (!servis.anahtar) return { kullanilir: false, renk: 'gri', metin: 'Anahtar yok' };
    if (!servis.model) return { kullanilir: false, renk: 'gri', metin: 'Model seçilmedi' };
  }
  const kalan = dinlenmeKalan(servis.id);
  if (kalan) {
    const neden = NEDEN_YAZI[dinlenme[servis.id]?.neden] || 'Kota doldu';
    return { kullanilir: false, renk: 'kirmizi', metin: `${neden} · ~${kalan} dk`, mesaj: durumlar.get(servis.id)?.mesaj };
  }
  const d = durumlar.get(servis.id);
  if (d?.durum === 'bekliyor') return { kullanilir: true, renk: 'mavi', metin: 'Düşünüyor' };
  if (d?.durum === 'hata') return { kullanilir: true, renk: 'sari', metin: 'Son turda hata', mesaj: d.mesaj };
  if (d?.durum === 'anahtar') return { kullanilir: false, renk: 'kirmizi', metin: 'Anahtar sorunu', mesaj: d.mesaj };
  return { kullanilir: true, renk: 'yesil', metin: 'Hazır' };
}

// Dinlenme süreleri dolunca ekran kendiliğinden güncellensin.
setInterval(bildir, 60000);
