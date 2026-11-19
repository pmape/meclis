// API anahtarları kullanıcının belirlediği şifreyle kilitlenir (AES-GCM).
// Kilitli dosya proje klasöründe durur ve Drive üzerinden diğer cihazlara gider.
// "Bu cihazda hatırla" seçilirse şifrenin kendisi değil, ondan türetilen ve
// dışarı çıkarılamayan anahtar bu tarayıcıda saklanır.

const TEKRAR = 250000;

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64Coz(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export async function anahtarTuret(sifre, tuz) {
  const ham = await crypto.subtle.importKey('raw', new TextEncoder().encode(sifre), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: tuz, iterations: TEKRAR, hash: 'SHA-256' },
    ham,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function yeniTuz() { return crypto.getRandomValues(new Uint8Array(16)); }

export async function kilitle(nesne, anahtar, tuz) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const veri = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, anahtar, new TextEncoder().encode(JSON.stringify(nesne)));
  return { surum: 1, aciklama: 'Meclis API anahtarları (şifreli). Bu dosyayı silmeyin.', tuz: b64(tuz), iv: b64(iv), veri: b64(veri) };
}

// Şifre yanlışsa hata fırlatır.
export async function kilidiAc(paket, anahtar) {
  const acik = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Coz(paket.iv) }, anahtar, b64Coz(paket.veri));
  return JSON.parse(new TextDecoder().decode(acik));
}

export function paketTuzu(paket) { return b64Coz(paket.tuz); }
