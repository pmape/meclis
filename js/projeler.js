// Projeler: hafıza, yol haritası, çalışması gerekenler listesi, çalışma kopyası, yedekler
// ve projeye özel yapay zeka istekleri (inceleme, kod adımı, tasarım görüşmesi, arayüz yarışması).

import * as depo from './depolama.js';
import { kirp } from './metin.js';
import { dosyalariMetneCevir, dizineYaz } from './dosyalar.js';
import { sinirAl } from './meclis.js';

const yeniId = (on) => `${on}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function yeniProje(ad) {
  return {
    id: yeniId('proje'),
    ad: ad || 'Yeni proje',
    olusturma: new Date().toISOString(),
    asama: 'gorusme', // 'gorusme' → tasarım netleşiyor; 'kodlama' → kullanıcı "kodu yaz" dedi
    hafiza: { fikir: '', kararlar: [], ortakDil: '', nasilYuklenir: '' },
    yol: [],
    liste: [],
    kaynak: { tur: 'yok' },
    tasarim: null,
    yedekler: [],
    turlar: []
  };
}

export function yolAdimi(baslik, aciklama = '') {
  return { id: yeniId('adim'), baslik, aciklama, durum: 'bekliyor' };
}

export function listeMaddesi(metin) {
  return { id: yeniId('madde'), metin, durum: 'denenmedi' };
}

// ---------- Kaydetme ----------

export async function projeKaydet(p) {
  p.guncelleme = new Date().toISOString();
  await depo.jsonYaz(`projeler/${p.id}/proje.json`, p);
  const dizin = await depo.jsonOku('projeler/dizin.json', []);
  const kayit = { id: p.id, ad: p.ad, guncelleme: p.guncelleme, tamam: p.yol.filter((a) => a.durum === 'tamam').length, toplam: p.yol.length };
  await depo.jsonYaz('projeler/dizin.json', [kayit, ...dizin.filter((x) => x.id !== p.id)]);
}

export const projeYukle = (id) => depo.jsonOku(`projeler/${id}/proje.json`);
export const projeListesi = () => depo.jsonOku('projeler/dizin.json', []);

export async function projeSil(id) {
  const dizin = await depo.jsonOku('projeler/dizin.json', []);
  await depo.jsonYaz('projeler/dizin.json', dizin.filter((x) => x.id !== id));
  await depo.dosyaSil(`projeler/${id}/proje.json`);
  await depo.dosyaSil(`projeler/${id}/dosyalar.json`);
  await depo.kvSil(`proje-klasor:${id}`);
}

// ---------- Çalışma kopyası (projenin dosyaları) ----------

export const dosyalariOku = async (p) => (await depo.jsonOku(`projeler/${p.id}/dosyalar.json`, [])) || [];

export async function dosyalariYaz(p, dosyalar) {
  await depo.jsonYaz(`projeler/${p.id}/dosyalar.json`, dosyalar);
  // Veri klasörü seçiliyse dosyalar gerçek dosya olarak da yazılır (Drive bunları da yedekler).
  if (depo.klasorKullaniliyor()) {
    for (const d of dosyalar) await depo.dosyaYaz(`projeler/${p.id}/kod/${d.yol}`, d.icerik);
  }
}

export const bagliKlasor = (p) => depo.kvAl(`proje-klasor:${p.id}`);
export const klasoruBagla = (p, dizin) => depo.kvYaz(`proje-klasor:${p.id}`, dizin);

// Seçilen çözümün dosyalarını uygular: önce yedek alır, sonra çalışma kopyasına
// ve (bağlıysa) kullanıcının kendi proje klasörüne yazar.
export async function dosyalariUygula(p, yeniDosyalar, aciklama) {
  const mevcut = await dosyalariOku(p);
  const zaman = new Date().toISOString();
  const yedek = yeniDosyalar.map((d) => ({ yol: d.yol, eski: mevcut.find((m) => m.yol === d.yol)?.icerik ?? null }));
  await depo.jsonYaz(`projeler/${p.id}/yedekler/${zaman.replace(/[:.]/g, '-')}.json`, yedek);
  p.yedekler = [{ zaman, aciklama, dosyalar: yeniDosyalar.map((d) => d.yol) }, ...(p.yedekler || [])].slice(0, 30);

  const sonuc = [...mevcut];
  for (const d of yeniDosyalar) {
    const i = sonuc.findIndex((m) => m.yol === d.yol);
    if (i === -1) sonuc.push({ yol: d.yol, icerik: d.icerik }); else sonuc[i] = { yol: d.yol, icerik: d.icerik };
  }
  await dosyalariYaz(p, sonuc);
  const klasorYazildi = await bagliKlasoreYaz(p, yeniDosyalar);
  return { klasorYazildi };
}

async function bagliKlasoreYaz(p, dosyalar) {
  const dizin = await bagliKlasor(p);
  if (!dizin) return false;
  try {
    if ((await dizin.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
        (await dizin.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
    for (const d of dosyalar) await dizineYaz(dizin, d.yol, d.icerik ?? '');
    return true;
  } catch {
    return false;
  }
}

export async function geriAl(p, zaman) {
  const yedek = await depo.jsonOku(`projeler/${p.id}/yedekler/${zaman.replace(/[:.]/g, '-')}.json`);
  if (!yedek) throw new Error('Yedek bulunamadı');
  let dosyalar = await dosyalariOku(p);
  for (const y of yedek) {
    if (y.eski == null) dosyalar = dosyalar.filter((d) => d.yol !== y.yol);
    else {
      const i = dosyalar.findIndex((d) => d.yol === y.yol);
      if (i === -1) dosyalar.push({ yol: y.yol, icerik: y.eski }); else dosyalar[i] = { yol: y.yol, icerik: y.eski };
    }
  }
  await dosyalariYaz(p, dosyalar);
  await bagliKlasoreYaz(p, yedek.filter((y) => y.eski != null).map((y) => ({ yol: y.yol, icerik: y.eski })));
  p.yedekler = (p.yedekler || []).filter((y) => y.zaman !== zaman);
}

// ---------- Proje bağlamı (her isteğin başına eklenen kısa özet) ----------

export function projeBaglami(p, { adimId } = {}) {
  const h = p.hafiza;
  const durumYazi = { tamam: 'tamamlandı', suruyor: 'şu an bunun üzerinde çalışılıyor', bekliyor: 'bekliyor' };
  const satirlar = [`PROJE: ${p.ad}`];
  if (h.fikir) satirlar.push(`Fikir: ${h.fikir}`);
  if (h.kararlar.length) satirlar.push(`Alınan kararlar (bunlara uy, değiştirme):\n${h.kararlar.map((k) => `- ${k}`).join('\n')}`);
  if (h.ortakDil) satirlar.push(`Parçalar arasındaki ortak dil (komutlar, dosya adları; bozma):\n${h.ortakDil}`);
  if (h.nasilYuklenir) satirlar.push(`Nasıl yüklenir/çalıştırılır: ${h.nasilYuklenir}`);
  if (p.yol.length) {
    satirlar.push(`Yol haritası:\n${p.yol.map((a, i) => `${i + 1}. ${a.baslik} [${a.id === adimId ? 'ŞU ANKİ ADIM' : durumYazi[a.durum]}]`).join('\n')}`);
  }
  if (p.liste.length) satirlar.push(`Çalışması gerekenler (hiçbiri bozulmamalı):\n${p.liste.map((m) => `- ${m.metin}`).join('\n')}`);
  if (p.tasarim) satirlar.push(`Kullanıcının seçtiği arayüz taslağı: ${p.tasarim.ekran} (${p.tasarim.ad} çizdi). Ekranlarda bu düzene uy.`);
  return satirlar.join('\n\n');
}

// ---------- 1) Projeyi İncelet ----------

const INCELE_SISTEMI = `Sen "Meclis"te bir yazılım incelemecisisin. Kullanıcı kod bilmiyor.
Projeyi dikkatle oku ve bulduklarını sade Türkçe, kısa maddelerle yaz. Teknik ayrıntıyı tek cümleyle açıkla.
SADECE geçerli JSON döndür.`;

export function incelemeMesajlari(servis, p, dosyalar, odak) {
  const { metin, kisaltildi } = dosyalariMetneCevir(dosyalar, Math.max(6000, sinirAl(servis) - 5000));
  return [
    { rol: 'sistem', icerik: INCELE_SISTEMI },
    {
      rol: 'kullanici',
      icerik: `${projeBaglami(p)}

${odak ? `Kullanıcının özellikle istediği: ${odak}\n\n` : ''}Projenin dosyaları${kisaltildi ? ' (bazı kısımlar yer sınırı nedeniyle kısaltıldı; görmediğin kısım hakkında kesin konuşma)' : ''}:

${metin}

Şu JSON'u doldur:
{
  "ne_yapiyor": ["programın şu an yaptığı işler, her biri tek kısa madde"],
  "hatalar": [{"madde": "bulduğun hata, hangi dosyada olduğuyla", "onem": "yuksek | orta | dusuk"}],
  "iyilestirmeler": ["daha iyi olabilecek şeyler"],
  "eksikler": ["benzer programlarda olup bunda olmayan özellikler"]
}`
    }
  ];
}

export function raporBirlestirMesajlari(sonuclar) {
  return [
    { rol: 'sistem', icerik: 'Sen "Meclis"in başkanısın. Birkaç yapay zekanın proje inceleme raporlarını tek rapora birleştir. Aynı anlama gelen maddeleri tek maddede topla ve kimlerin bulduğunu yaz. SADECE geçerli JSON döndür.' },
    {
      rol: 'kullanici',
      icerik: `Raporlar:\n${sonuclar.map((s) => `[${s.ad}]\n${kirp(JSON.stringify(s.veri), 6000)}`).join('\n\n')}

Şu JSON'u doldur (bulanlar dizisinde sadece şu adlar olabilir: ${sonuclar.map((s) => s.ad).join(', ')}):
{
  "ne_yapiyor": ["madde"],
  "hatalar": [{"madde": "...", "onem": "yuksek | orta | dusuk", "bulanlar": ["ad"]}],
  "iyilestirmeler": [{"madde": "...", "bulanlar": ["ad"]}],
  "eksikler": [{"madde": "...", "bulanlar": ["ad"]}]
}`
    }
  ];
}

// Başkan birleştiremezse raporlar olduğu gibi alt alta konur.
export function raporlariYanYanaKoy(sonuclar) {
  const r = { ne_yapiyor: [], hatalar: [], iyilestirmeler: [], eksikler: [] };
  for (const s of sonuclar) {
    const v = s.veri || {};
    for (const x of v.ne_yapiyor || []) if (!r.ne_yapiyor.includes(x)) r.ne_yapiyor.push(String(x));
    for (const x of v.hatalar || []) r.hatalar.push({ madde: String(x?.madde || x), onem: x?.onem || 'orta', bulanlar: [s.ad] });
    for (const x of v.iyilestirmeler || []) r.iyilestirmeler.push({ madde: String(x?.madde || x), bulanlar: [s.ad] });
    for (const x of v.eksikler || []) r.eksikler.push({ madde: String(x?.madde || x), bulanlar: [s.ad] });
  }
  return r;
}

export function raporuTemizle(r, adlar) {
  const liste = (x) => (Array.isArray(x) ? x : []);
  const bulan = (b) => liste(b).filter((a) => adlar.includes(a));
  const onemSira = { yuksek: 0, orta: 1, dusuk: 2 };
  return {
    ne_yapiyor: liste(r.ne_yapiyor).map(String).slice(0, 20),
    hatalar: liste(r.hatalar).map((x) => ({ madde: String(x?.madde || x), onem: ['yuksek', 'orta', 'dusuk'].includes(x?.onem) ? x.onem : 'orta', bulanlar: bulan(x?.bulanlar) }))
      .sort((a, b) => onemSira[a.onem] - onemSira[b.onem] || b.bulanlar.length - a.bulanlar.length),
    iyilestirmeler: liste(r.iyilestirmeler).map((x) => ({ madde: String(x?.madde || x), bulanlar: bulan(x?.bulanlar) })).sort((a, b) => b.bulanlar.length - a.bulanlar.length),
    eksikler: liste(r.eksikler).map((x) => ({ madde: String(x?.madde || x), bulanlar: bulan(x?.bulanlar) })).sort((a, b) => b.bulanlar.length - a.bulanlar.length)
  };
}

// ---------- 2) Kod adımı ----------

const ADIM_SISTEMI = `Sen "Meclis"te kod yazan bir yapay zekasın. Kullanıcı kod bilmiyor; kodu sen yazacaksın.
Kurallar:
- Sadece istenen adımı yap. Alınan kararlara ve "çalışması gerekenler" listesine kesinlikle uy; çalışan hiçbir şeyi bozma.
- Değiştirdiğin ya da yeni oluşturduğun HER dosyanın TAMAMINI ver, kısaltma yapma, "...", "aynı kalacak" gibi boşluk bırakma.
- Değiştirmediğin dosyaları yazma.
- Cevabını tam olarak aşağıdaki biçimde ver.`;

const ADIM_BICIMI = `Cevap biçimi:
## ÖZET
(2-3 sade cümle: bu adımda ne yaptın)
## DEĞİŞİKLİKLER
- (madde madde, sade Türkçe)
## DENEME
1. (kullanıcının sonucu denemek için yapacağı adımlar; donanım varsa ne görmesi gerektiğini yaz)
## YENİ LİSTE MADDELERİ
- (bu adım bitince her zaman çalışması gereken yeni özellikler, kısa; yoksa boş bırak)
## DOSYALAR
=== DOSYA: klasor/dosya-adi.uzanti ===
(dosyanın tam içeriği)
=== SON ===`;

export function adimMesajlari(servis, p, adim, dosyalar, ekIstek) {
  const sinir = sinirAl(servis);
  const baglam = projeBaglami(p, { adimId: adim.id });
  const { metin, kisaltildi } = dosyalariMetneCevir(dosyalar, Math.max(5000, sinir - baglam.length - 5000));
  const tasarim = p.tasarim ? `\n\nSeçilen arayüz taslağı (HTML, örnek olarak):\n${kirp(p.tasarim.html, Math.min(8000, Math.floor(sinir * 0.1)))}` : '';
  return [
    { rol: 'sistem', icerik: ADIM_SISTEMI },
    {
      rol: 'kullanici',
      icerik: `${baglam}${tasarim}

ŞU ANKİ ADIM: ${adim.baslik}${adim.aciklama ? `\n${adim.aciklama}` : ''}${ekIstek ? `\n\nKullanıcının ek isteği: ${ekIstek}` : ''}

Projenin mevcut dosyaları${kisaltildi ? ' (yer sınırı nedeniyle bazı kısımlar kısaltıldı; kısaltılmış dosyayı değiştirmen gerekirse kısaltılan bölümü yeniden yazma, kullanıcıya ÖZET bölümünde söyle)' : ''}:
${metin || '(henüz dosya yok; gerekenleri sen oluştur)'}

${ADIM_BICIMI}`
    }
  ];
}

export function adimInceleTalimati(p) {
  return `Bu bir kod adımı. Her cevabı şunlara göre incele:
- Değiştirilen dosyalar eksiksiz mi (kısaltma, "..." var mı)?
- Kod çalışır mı, sözdizimi hatası var mı?
- Şu "çalışması gerekenler" maddelerinden biri bozuluyor mu?
${p.liste.map((m) => `  - ${m.metin}`).join('\n') || '  (liste henüz boş)'}
- Alınan kararlara aykırı bir şey var mı?`;
}

// ---------- 3) Tasarım görüşmesi ----------

export function arastirmaSorusu(fikir) {
  return `Şöyle bir uygulama yapmak istiyorum: ${fikir}

Bunun için araştırma yap ve sade Türkçe cevapla:
1. Benzer uygulamalar ve en sevilen özellikleri
2. Bu uygulamada mutlaka olması gereken özellikler
3. Teknik olarak neler gerekir (hangi platform: tarayıcı uygulaması mı, Android mi; gereken izinler, donanım vb.)
4. Dikkat edilmesi gereken zorluklar ve riskler`;
}

export function baskanSorusuMesajlari(p, arastirmaOzeti, gecmis) {
  return [
    { rol: 'sistem', icerik: `Sen "Meclis"in başkanısın ve kod bilmeyen kullanıcıyla bir "tasarım görüşmesi" yapıyorsun.
Kurallar:
- Her seferinde SADECE TEK soru sor; sorunun neden önemli olduğunu bir cümleyle söyle.
- Seçenek varsa 2-3 seçeneği artı ve eksileriyle ver ve birini öner.
- Kullanıcının son cevabından çıkan kararı kısa bir cümleyle kaydet.
- Uygulamanın ne yapacağı, kimin için, hangi platformda, ana ekranlar, veriler, sınırlar netleşince "bitti": true yap.
- Sade Türkçe kullan. SADECE geçerli JSON döndür.` },
    {
      rol: 'kullanici',
      icerik: `${projeBaglami(p)}

Araştırma özeti:
${kirp(arastirmaOzeti || '(yok)', 5000)}

Şimdiye kadarki görüşme:
${gecmis.length ? gecmis.map((g, i) => `${i + 1}. Soru: ${g.soru}\n   Kullanıcının cevabı: ${g.cevap}`).join('\n') : '(henüz soru sorulmadı)'}

Şu JSON'u doldur:
{
  "kaydedilecek_karar": "kullanıcının son cevabından çıkan karar, tek cümle (ilk soruysa boş bırak)",
  "soru": "sıradaki tek soru",
  "neden": "bu sorunun neden önemli olduğu, tek cümle",
  "secenekler": [{"ad": "seçenek", "arti": "artısı", "eksi": "eksisi"}],
  "oneri": "önerdiğin seçenek ve kısa gerekçe (seçenek yoksa boş)",
  "bitti": false
}`
    }
  ];
}

export function arkaPlanMesajlari(p, soru) {
  return [
    { rol: 'sistem', icerik: 'Sen "Meclis"te bir danışmansın. Başkan kullanıcıya bir soru sordu. Başkanın atladığı önemli bir nokta, risk ya da daha iyi bir seçenek varsa TEK kısa cümleyle yaz. Yoksa sadece "yok" yaz.' },
    { rol: 'kullanici', icerik: `${kirp(projeBaglami(p), 4000)}\n\nBaşkanın sorusu: ${soru}` }
  ];
}

export function planMesajlari(p, arastirmaOzeti, gecmis) {
  return [
    { rol: 'sistem', icerik: 'Sen "Meclis"in başkanısın. Tasarım görüşmesi bitti. Projeyi kod bilmeyen kullanıcı için küçük, sıralı adımlara böl. Her adım tek başına denenebilir olsun. SADECE geçerli JSON döndür.' },
    {
      rol: 'kullanici',
      icerik: `${projeBaglami(p)}

Araştırma özeti:
${kirp(arastirmaOzeti || '(yok)', 4000)}

Görüşme:
${gecmis.map((g, i) => `${i + 1}. ${g.soru} → ${g.cevap}`).join('\n')}

Şu JSON'u doldur:
{
  "fikir_ozeti": "uygulamanın 2-3 cümlelik tanımı",
  "kararlar": ["görüşmede alınan kararlar, kısa maddeler"],
  "nasil_yuklenir": "uygulama nasıl çalıştırılacak/yüklenecek, tek cümle",
  "yol": [{"baslik": "küçük adım", "aciklama": "bu adımda tam olarak ne yapılacak"}],
  "liste": ["uygulama bitince her zaman çalışması gerekenler, kısa maddeler"]
}`
    }
  ];
}

// ---------- 4) Arayüz yarışması ----------

export function yarismaMesajlari(servis, p, ekran) {
  return [
    { rol: 'sistem', icerik: 'Sen "Meclis"te bir arayüz tasarımcısısın. İstenen ekranın görsel taslağını TEK bir HTML dosyası olarak çiz: stiller <style> içinde, gerekirse küçük bir <script>. Dışarıdan dosya, yazı tipi ya da resim yükleme. Türkçe metin kullan. Önce tek cümleyle tasarım fikrini yaz, sonra HTML\'i ```html bloğu içinde ver.' },
    { rol: 'kullanici', icerik: `${kirp(projeBaglami(p), Math.min(8000, sinirAl(servis) / 4))}\n\nÇizilecek ekran: ${ekran}` }
  ];
}

export function htmlCikar(metin) {
  const m = String(metin).match(/```html\s*\n([\s\S]*?)```/i) || String(metin).match(/(<!doctype html[\s\S]*<\/html>)/i) || String(metin).match(/(<html[\s\S]*<\/html>)/i);
  return m ? m[1].trim() : null;
}
