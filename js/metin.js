// Yapay zeka cevaplarını güvenli şekilde ekrana çevirir.
// Önce her şey kaçışlanır (HTML olarak çalışmasın diye), sonra basit biçimler uygulanır.
// Kod blokları varsayılan olarak kapalı gelir: kullanıcı özet okur, kodu isterse açar.

export function kacis(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function satirIci(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function mdCevir(ham) {
  const satirlar = String(ham ?? '').replace(/\r\n/g, '\n').split('\n');
  const cikti = [];
  let liste = null; // 'ul' | 'ol'
  let paragraf = [];

  const paragrafiKapat = () => {
    if (paragraf.length) { cikti.push(`<p>${satirIci(paragraf.join('<br>'))}</p>`); paragraf = []; }
  };
  const listeyiKapat = () => { if (liste) { cikti.push(`</${liste}>`); liste = null; } };

  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i];
    const kodBas = satir.match(/^\s*```\s*([\w+-]*)/);
    if (kodBas) {
      paragrafiKapat(); listeyiKapat();
      const dil = kodBas[1] || 'kod';
      const kod = [];
      i++;
      while (i < satirlar.length && !/^\s*```/.test(satirlar[i])) { kod.push(satirlar[i]); i++; }
      cikti.push(`<details><summary>Kodu göster (${kacis(dil)}, ${kod.length} satır)</summary><pre><code>${kacis(kod.join('\n'))}</code></pre></details>`);
      continue;
    }
    const k = kacis(satir);
    const baslik = k.match(/^\s*(#{1,6})\s+(.*)$/);
    if (baslik) { paragrafiKapat(); listeyiKapat(); cikti.push(`<h4>${satirIci(baslik[2])}</h4>`); continue; }
    const madde = k.match(/^\s*[-*•]\s+(.*)$/);
    const sira = k.match(/^\s*\d+[.)]\s+(.*)$/);
    if (madde || sira) {
      paragrafiKapat();
      const tur = madde ? 'ul' : 'ol';
      if (liste !== tur) { listeyiKapat(); cikti.push(`<${tur}>`); liste = tur; }
      cikti.push(`<li>${satirIci((madde || sira)[1])}</li>`);
      continue;
    }
    if (!k.trim()) { paragrafiKapat(); listeyiKapat(); continue; }
    listeyiKapat();
    paragraf.push(k);
  }
  paragrafiKapat(); listeyiKapat();
  return cikti.join('');
}

// Cevabın ilk anlamlı cümlesinden kısa bir özet çıkarır (başkan özeti gelmezse kullanılır).
export function kisaOzet(ham, uzunluk = 110) {
  const temiz = String(ham ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return temiz.length > uzunluk ? temiz.slice(0, uzunluk - 1).trimEnd() + '…' : temiz;
}

// Model cevabının içinden JSON nesnesini bulur ({...} ya da ```json blokları).
export function jsonCikar(metin) {
  if (!metin) return null;
  const blok = metin.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const adaylar = [];
  if (blok) adaylar.push(blok[1]);
  const bas = metin.indexOf('{');
  const son = metin.lastIndexOf('}');
  if (bas !== -1 && son > bas) adaylar.push(metin.slice(bas, son + 1));
  for (const a of adaylar) {
    try { return JSON.parse(a); } catch { /* sıradakini dene */ }
  }
  return null;
}

export function kirp(metin, uzunluk) {
  const s = String(metin ?? '');
  return s.length > uzunluk ? s.slice(0, uzunluk) + '\n[... kısaltıldı ...]' : s;
}
