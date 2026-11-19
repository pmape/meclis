// Dosyalarla ilgili her şey: soruya dosya ekleme, klasörden ya da GitHub'dan proje okuma,
// dosyaları yapay zekaya gönderilecek metne çevirme ve yapay zekanın geri verdiği dosyaları ayıklama.

const METIN_UZANTILARI = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'md', 'txt', 'py', 'ino', 'cpp', 'cc',
  'c', 'h', 'hpp', 'java', 'kt', 'kts', 'xml', 'gradle', 'yml', 'yaml', 'csv', 'sh', 'bat', 'ps1', 'ini', 'cfg',
  'toml', 'svg', 'properties', 'go', 'rs', 'php', 'sql', 'vue', 'svelte', 'webmanifest', 'gitignore', 'env.example'
]);
const RESIM_UZANTILARI = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const ATLANAN_KLASORLER = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', '.idea', '__pycache__', 'out', 'bin', 'obj', '.vscode', '.next', 'vendor', 'meclis']);

export const DOSYA_SINIRI = 400 * 1024;     // tek dosya en fazla 400 KB
export const TOPLAM_SINIR = 3 * 1024 * 1024; // bir projede en fazla 3 MB metin

export function uzanti(ad) {
  const p = String(ad).toLowerCase().split('/').pop();
  if (p === '.gitignore') return 'gitignore';
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i + 1);
}

export const metinMi = (ad) => METIN_UZANTILARI.has(uzanti(ad)) || !uzanti(ad);
export const resimMi = (ad) => RESIM_UZANTILARI.has(uzanti(ad));

function base64(buf) {
  const bayt = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bayt.length; i += 0x8000) s += String.fromCharCode(...bayt.subarray(i, i + 0x8000));
  return btoa(s);
}

// Kullanıcının seçtiği/bıraktığı dosyaları okur.
// Dönüş: { dosyalar: [{yol, icerik}], resimler: [{ad, mime, veri}], atlananlar: [ad] }
export async function nesnelerdenOku(dosyaListesi) {
  const dosyalar = [];
  const resimler = [];
  const atlananlar = [];
  for (const f of dosyaListesi) {
    const yol = f.webkitRelativePath || f.name;
    if (resimMi(f.name)) {
      if (f.size > 4 * 1024 * 1024) { atlananlar.push(`${f.name} (resim 4 MB'tan büyük)`); continue; }
      resimler.push({ ad: f.name, mime: f.type || 'image/png', veri: base64(await f.arrayBuffer()) });
    } else if (metinMi(f.name)) {
      if (f.size > DOSYA_SINIRI) { atlananlar.push(`${f.name} (400 KB'tan büyük)`); continue; }
      dosyalar.push({ yol, icerik: await f.text() });
    } else {
      atlananlar.push(`${f.name} (desteklenmeyen tür)`);
    }
  }
  return { dosyalar, resimler, atlananlar };
}

// Bilgisayardaki bir proje klasörünü okur (gereksiz klasörleri atlar).
export async function dizindenOku(dizin, onEk = '', sonuc = { dosyalar: [], atlananlar: [], toplam: 0 }) {
  for await (const [ad, kayit] of dizin.entries()) {
    const yol = onEk ? `${onEk}/${ad}` : ad;
    if (kayit.kind === 'directory') {
      if (ATLANAN_KLASORLER.has(ad) || ad.startsWith('.')) continue;
      await dizindenOku(kayit, yol, sonuc);
    } else if (metinMi(ad)) {
      const f = await kayit.getFile();
      if (f.size > DOSYA_SINIRI) { sonuc.atlananlar.push(`${yol} (400 KB'tan büyük)`); continue; }
      if (sonuc.toplam + f.size > TOPLAM_SINIR) { sonuc.atlananlar.push(`${yol} (proje 3 MB sınırını aştı)`); continue; }
      sonuc.toplam += f.size;
      sonuc.dosyalar.push({ yol, icerik: await f.text() });
    }
  }
  return sonuc;
}

// Klasöre dosya yazar (ara klasörleri oluşturur).
export async function dizineYaz(dizin, yol, icerik) {
  const parcalar = yol.split('/').filter((p) => p && p !== '.' && p !== '..');
  let k = dizin;
  for (const p of parcalar.slice(0, -1)) k = await k.getDirectoryHandle(p, { create: true });
  const dosya = await k.getFileHandle(parcalar[parcalar.length - 1], { create: true });
  const yazici = await dosya.createWritable();
  await yazici.write(icerik);
  await yazici.close();
}

// "pmape/meclis", "https://github.com/pmape/meclis" ya da "https://pmape.github.io/meclis/" kabul eder.
export function githubAdresiniCoz(adres) {
  const a = String(adres).trim().replace(/\.git$/, '').replace(/\/+$/, '');
  let m = a.match(/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/#?]+))?/i);
  if (m) return { sahip: m[1], depo: m[2], dal: m[3] || null };
  m = a.match(/^https?:\/\/([^.]+)\.github\.io\/([^/#?]+)/i);
  if (m) return { sahip: m[1], depo: m[2], dal: null };
  m = a.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { sahip: m[1], depo: m[2], dal: null };
  return null;
}

// Herkese açık bir GitHub deposundaki metin dosyalarını okur (anahtar gerekmez).
export async function githubdanOku(adres, ilerleme = () => {}) {
  const g = githubAdresiniCoz(adres);
  if (!g) throw new Error('GitHub adresi anlaşılamadı. Örnek: pmape/gamepad ya da https://github.com/pmape/gamepad');
  const api = `https://api.github.com/repos/${g.sahip}/${g.depo}`;
  let dal = g.dal;
  if (!dal) {
    const r = await fetch(api);
    if (r.status === 404) throw new Error('Depo bulunamadı. Adı doğru mu ve depo herkese açık (Public) mı?');
    if (!r.ok) throw new Error(`GitHub cevap vermedi (${r.status}). Biraz sonra tekrar dene.`);
    dal = (await r.json()).default_branch;
  }
  const r = await fetch(`${api}/git/trees/${encodeURIComponent(dal)}?recursive=1`);
  if (!r.ok) throw new Error(`Dosya listesi alınamadı (${r.status}).`);
  const agac = await r.json();
  const adaylar = (agac.tree || []).filter((x) => x.type === 'blob' && metinMi(x.path) &&
    !x.path.split('/').some((p) => ATLANAN_KLASORLER.has(p) || p.startsWith('.')));
  const dosyalar = [];
  const atlananlar = [];
  let toplam = 0;
  for (const x of adaylar.slice(0, 120)) {
    if (x.size > DOSYA_SINIRI) { atlananlar.push(`${x.path} (400 KB'tan büyük)`); continue; }
    if (toplam + x.size > TOPLAM_SINIR) { atlananlar.push(`${x.path} (3 MB sınırı)`); continue; }
    ilerleme(x.path);
    const ham = await fetch(`https://raw.githubusercontent.com/${g.sahip}/${g.depo}/${encodeURIComponent(dal)}/${x.path.split('/').map(encodeURIComponent).join('/')}`);
    if (!ham.ok) { atlananlar.push(`${x.path} (okunamadı)`); continue; }
    toplam += x.size;
    dosyalar.push({ yol: x.path, icerik: await ham.text() });
  }
  if (adaylar.length > 120) atlananlar.push(`ve ${adaylar.length - 120} dosya daha (en fazla 120 dosya okunur)`);
  return { dosyalar, atlananlar, kaynak: { tur: 'github', sahip: g.sahip, depo: g.depo, dal } };
}

// Dosyaları yapay zekaya gidecek metne çevirir; sınırı aşarsa her dosyadan orantılı kısaltır.
export function dosyalariMetneCevir(dosyalar, sinir = 60000) {
  if (!dosyalar?.length) return { metin: '', kisaltildi: false };
  const kalip = (yol, icerik) => `=== DOSYA: ${yol} ===\n${icerik}\n=== SON ===`;
  const tam = dosyalar.map((d) => kalip(d.yol, d.icerik)).join('\n\n');
  if (tam.length <= sinir) return { metin: tam, kisaltildi: false };
  const ekYuk = dosyalar.reduce((t, d) => t + d.yol.length + 40, 0);
  const kullanilabilir = Math.max(2000, sinir - ekYuk);
  const toplamIcerik = dosyalar.reduce((t, d) => t + d.icerik.length, 0);
  const metin = dosyalar.map((d) => {
    const pay = Math.max(400, Math.floor(kullanilabilir * (d.icerik.length / toplamIcerik)));
    if (d.icerik.length <= pay) return kalip(d.yol, d.icerik);
    const yarim = Math.floor(pay / 2);
    return kalip(d.yol, `${d.icerik.slice(0, yarim)}\n\n[... bu dosyanın ${d.icerik.length - pay} karakteri yer sınırı nedeniyle gösterilmedi ...]\n\n${d.icerik.slice(-yarim)}`);
  }).join('\n\n');
  return { metin, kisaltildi: true };
}

// Yapay zekanın cevabındaki "=== DOSYA: yol === ... === SON ===" bloklarını ayıklar.
export function dosyaBloklariniCoz(metin) {
  const sonuc = [];
  const re = /={2,}\s*DOSYA:\s*([^\n=]+?)\s*={2,}\s*\n([\s\S]*?)\n\s*={2,}\s*SON\s*={2,}/g;
  let m;
  while ((m = re.exec(String(metin)))) {
    let icerik = m[2];
    // Model içeriği ayrıca ``` ile sardıysa çıkar.
    const cit = icerik.match(/^\s*```[\w+-]*\s*\n([\s\S]*?)\n\s*```\s*$/);
    if (cit) icerik = cit[1];
    const yol = m[1].trim().replace(/^\.?\//, '').replace(/`/g, '');
    if (yol && !yol.includes('..')) sonuc.push({ yol, icerik });
  }
  return sonuc;
}

// Cevaptaki "## BAŞLIK" bölümünü döndürür.
export function bolumAl(metin, baslik) {
  const re = new RegExp(`^#{1,4}\\s*${baslik}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,4}\\s|={2,}\\s*DOSYA:|$(?![\\s\\S]))`, 'im');
  const m = String(metin).match(re);
  return m ? m[1].trim() : '';
}

export function maddelereBol(metin) {
  return String(metin).split('\n').map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

export function indir(ad, icerik, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([icerik], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = ad.split('/').pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// HTML dosyasını, yanındaki CSS ve JS dosyalarını içine gömerek önizlenebilir hale getirir.
export function onizlemeHazirla(htmlYolu, dosyalar) {
  const bul = (yol) => dosyalar.find((d) => d.yol === yol);
  const kok = htmlYolu.includes('/') ? htmlYolu.slice(0, htmlYolu.lastIndexOf('/') + 1) : '';
  const coz = (href) => {
    if (!href || /^(https?:|data:|\/\/|#)/i.test(href)) return null;
    const temiz = href.split(/[?#]/)[0];
    const parcalar = (temiz.startsWith('/') ? temiz.slice(1) : kok + temiz).split('/');
    const yigin = [];
    for (const p of parcalar) { if (p === '..') yigin.pop(); else if (p && p !== '.') yigin.push(p); }
    return yigin.join('/');
  };
  let html = bul(htmlYolu)?.icerik || '';
  html = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (etiket) => {
    const href = (etiket.match(/href=["']([^"']+)["']/i) || [])[1];
    const d = bul(coz(href));
    return d ? `<style>/* ${href} */\n${d.icerik}\n</style>` : etiket;
  });
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (etiket, on, src, son) => {
    const d = bul(coz(src));
    return d ? `<script${on}${son}>/* ${src} */\n${d.icerik.replace(/<\/script/gi, '<\\/script')}\n</script>` : etiket;
  });
  return html;
}

// Cevaptaki dosya bloklarını ekranda kapalı kod bloklarına çevirir (okuması kolay olsun).
export function dosyaBloklariniGizle(metin) {
  return String(metin).replace(/={2,}\s*DOSYA:\s*([^\n=]+?)\s*={2,}\s*\n([\s\S]*?)\n\s*={2,}\s*SON\s*={2,}/g,
    (_, yol, icerik) => `**${yol.trim()}**\n\n\`\`\`${uzanti(yol.trim()) || 'kod'}\n${icerik.replace(/^\s*```[\w+-]*\s*\n|\n\s*```\s*$/g, '')}\n\`\`\``);
}
