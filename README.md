# Meclis

Bir soruyu aynı anda birçok yapay zekaya soran, cevapları karşılaştıran ve hangi çözümde birleştiklerini gösteren çalışma aracı.

Adres: **https://pmape.github.io/meclis/**

## Şu an neler var (1. aşama)

- Soru aynı anda bütün hazır yapay zekalara gider: Gemini, Gemma, Groq, OpenRouter, SambaNova ve senin eklediklerin.
- **Oylama:** Başkan model cevapları özetler ve kaç yapay zekanın aynı çözümde birleştiğini gösterir.
- **Dikkat çekilenler** ve **farklı görüşler** ayrı ayrı listelenir.
- **İncelet:** Her yapay zeka diğerlerinin cevaplarını inceler, hata arar ve en iyi cevaba oy verir.
- **Bu cevaptan devam et:** Seçtiğin cevap bir sonraki soruya bağlam olarak gider. Kota korunsun diye sohbetin tamamı değil, sadece seçilen cevap gönderilir.
- Kod, cevapların içinde varsayılan olarak gizlidir. "Kodu göster" ile açılır.
- **Akıllı kota:** Kotası dolan servis bir süre dinlenmeye alınır, diğerleri devam eder. Süre bitince servis kendiliğinden geri döner.
- **Yapay zeka ekle:** OpenAI uyumlu her yeni servis, kod değiştirmeden Ayarlar'dan eklenir.
- Anahtarlar senin şifrenle kilitlenip veri klasörüne kaydedilir.
- Koyu ve açık tema.

## İlk kurulum

1. Chrome'da **https://pmape.github.io/meclis/** adresini aç. Kurulum sihirbazı kendiliğinden başlar.
2. **Veri klasörünü seç.** Google Drive masaüstünün yedeklediği bir klasör seçersen sohbetlerin ve kilitli anahtarların Drive'a da yedeklenir. Meclis bu klasörün içinde `meclis` adlı bir alt klasör açar.
3. **Bir şifre belirle.** API anahtarların bu şifreyle kilitlenir. "Bu cihazda hatırla" işaretliyse her açılışta sorulmaz.
4. **Anahtarları gir.** Her servisin kartında "Anahtar nasıl alınır?" kısmı var. Anahtarı yapıştırıp **Dene**'ye bas.
5. **Uygulama olarak yükle:** Chrome adres çubuğunun sağındaki "Uygulamayı yükle" simgesine bas. Meclis kendi penceresinde açılır ve Başlat menüsünde görünür.

Başka bir bilgisayarda: aynı Drive klasörünü seçip şifreni girmen yeterli, anahtarların gelir.

## Ücretsiz anahtarlar

| Servis | Anahtar sayfası | Not |
| --- | --- | --- |
| Gemini | https://aistudio.google.com/apikey | Türkiye'de gönderilen veriler eğitimde kullanılabilir |
| Gemma | Gemini anahtarını kullanır | Ayrı hesap gerekmez; kotası bol |
| Groq | https://console.groq.com/keys | Çok hızlı; dakikada 30, günde 1.000 istek |
| OpenRouter | https://openrouter.ai/keys | Günde 50 istek; `openrouter/free` o an çalışan ücretsiz modeli seçer |
| SambaNova | https://cloud.sambanova.ai/apis | DeepSeek ve Llama modelleri; model başına günde 20 istek |

Limitler Kasım 2026 araştırmasına göredir ve servisler tarafından değiştirilebilir.

## Bilinmesi gerekenler

- Bazı servisler tarayıcıdan doğrudan bağlanmaya izin vermeyebilir. Böyle bir durumda "Dene" düğmesi "Servise bağlanılamadı" der ve Meclis o servisi atlayıp diğerleriyle devam eder. Gemini ve OpenRouter tarayıcıdan bağlanmaya izin veriyor.
- Ücretsiz servislerin bir kısmı gönderilen soruları eğitimde kullanır. Şifre ve kişisel bilgi gönderme.
- Klasör seçme özelliği bilgisayardaki Chrome ve Edge'de çalışır. Tablette veriler şimdilik tarayıcının içinde saklanır.

## Dosyalar

| Dosya | Görevi |
| --- | --- |
| `index.html` | Ekran düzeni |
| `css/stil.css` | Görünüm (renkler, yazılar, koyu tema) |
| `js/uygulama.js` | Ana dosya: durum, ekran, olaylar |
| `js/meclis.js` | Meclis turu: soru, başkan özeti, inceleme |
| `js/saglayicilar.js` | Yapay zeka servisleriyle konuşma |
| `js/durum.js` | Servis durumları ve kota dinlenmesi |
| `js/depolama.js` | Klasör ve tarayıcı deposu |
| `js/sifreleme.js` | Anahtarların şifrelenmesi |
| `js/ayarlar.js` | Ayarlar ekranı |
| `js/sihirbaz.js` | Kurulum sihirbazı |
| `js/metin.js` | Cevapların güvenli gösterimi |
| `sw.js`, `manifest.webmanifest` | Uygulama olarak yükleme |

Yeni bir sürüm yayınlarken `sw.js` içindeki `SURUM` değerini artır; böylece her cihaz güncel dosyaları alır.

## Sıradaki aşamalar

1. ~~Soru-cevap, oylama, inceleme, ayarlar~~ (tamamlandı)
2. Proje paneli: hafıza, yol haritası, çalışması gerekenler listesi, Projeyi İncelet, Dene önizlemesi, tasarım görüşmesi
3. Chrome eklentisi ve site katılımcıları (DeepSeek, Kimi, Gemini, Grok, ChatGPT, Claude), Devret
4. Tablet erişimi (Drive), arayüz yarışması, ilk test projesi
