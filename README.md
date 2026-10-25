# Avenlyo AI Studio

Avenlyo, işletme bilgisini ve yerel dokümanlarını tek yerde tutup bu bağlamla çalışan yapay zeka ajanları oluşturabileceğiniz local-first bir Next.js uygulamasıdır.

## Özellikler

- İşletme profili: marka, sektör, hedef kitle, ton, ürün/hizmet, SSS ve özel bilgiler
- Ajan oluşturma, düzenleme ve silme
- Her ajana özel rol, amaç, talimat ve model seçimi
- OpenAI Responses API ile ajan playground
- Ayrı `/bilgi-tabani` sayfası
- PDF, DOCX, TXT ve Markdown dosya yükleme
- Yerel SQLite bilgi tabanı ve FTS5 keyword arama
- OpenAI embeddings + cosine similarity ile semantic retrieval
- Semantic + keyword hybrid RAG ranking
- Her ajana ayrı bilgi kaynağı atama
- Playground cevaplarında belge ve PDF sayfa kaynaklarını gösterme
- Duplicate dosya tespiti, yeniden indeksleme ve belge silme
- Açık tema, responsive arayüz
- API anahtarının yalnızca sunucu tarafında kullanılması

## Kurulum

```bash
npm install
cp .env.example .env.local
```

`.env.local` içine OpenAI anahtarınızı ekleyin:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Ardından:

```bash
npm run dev
```

Uygulama varsayılan olarak [http://localhost:3000](http://localhost:3000) adresinde açılır.

## Bilgi Tabanı ve RAG

1. Sol menüden **Bilgi Tabanı** sayfasını açın.
2. Bir PDF, DOCX, TXT veya MD dosyası yükleyin.
3. Belgenin **Hazır** durumuna gelmesini bekleyin.
4. **Ajanlar** sayfasında bir ajanı düzenleyin.
5. Ajanın kullanabileceği bilgi kaynaklarını seçin.
6. Playground'da belge hakkında soru sorun.
7. Getirilen kaynaklar cevabın altında dosya adı ve varsa PDF sayfasıyla gösterilir.

İlk sürümde dosya başına maksimum boyut 25 MB, PDF sınırı 300 sayfadır. Metin katmanı olmayan taranmış PDF'ler için OCR henüz etkin değildir.

### Local-first davranış

Orijinal yüklenen dosyalar OpenAI'ye dosya olarak yüklenmez. Yerel dosyalar:

```text
data/uploads/
```

altında tutulur. RAG metadata, chunk, embedding ve ajan-belge ilişkileri:

```text
data/knowledge.db
```

SQLite veritabanında saklanır.

OpenAI'ye yalnızca:
- indeksleme sırasında embedding üretilecek metin parçaları,
- chat sırasında retrieval ile seçilen ilgili metin parçaları

gönderilir.

## Mimari

- **Next.js App Router + TypeScript**
- **Server Route Handlers**: business, agents, knowledge ve chat API'leri
- **OpenAI Responses API**: cevap üretimi
- **OpenAI Embeddings API**: doküman ve sorgu embedding'leri
- **SQLite + FTS5**: yerel metadata, chunk ve keyword retrieval
- **Node cosine similarity**: semantic retrieval
- **Hybrid retrieval**: semantic + keyword sonuçlarının RRF ile birleştirilmesi
- **unpdf**: PDF metin çıkarma
- **Mammoth**: DOCX metin çıkarma
- **js-tiktoken**: token tabanlı chunking
- **Local JSON Store**: işletme profili ve ajan ayarları

Çalışma anında oluşturulan `data/avenlyo.json`, `data/knowledge.db` ve `data/uploads/` Git'e eklenmez.

## Güvenlik

`OPENAI_API_KEY` hiçbir zaman istemci tarafına gönderilmez. Anahtarınızı repoya commit etmeyin; yalnızca `.env.local` içinde tutun.

Yüklenen belgeler kullanıcı girdisi olarak kabul edilir; uygulama dosya uzantısı, boyut ve PDF sayfa limitleri uygular. Taranmış PDF/OCR desteği sonraki aşamaya bırakılmıştır.
