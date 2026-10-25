# Avenlyo AI Studio

Avenlyo, işletme bilgisini ve yerel dokümanlarını tek yerde tutup bu bağlamla çalışan yapay zeka ajanları oluşturabileceğiniz local-first bir Next.js uygulamasıdır.

## Özellikler

- İşletme profili: marka, sektör, hedef kitle, ton, ürün/hizmet, SSS ve özel bilgiler
- Ajan oluşturma, düzenleme ve silme
- Her ajana özel rol, amaç, talimat ve model seçimi
- OpenAI Responses API ile gerçek zamanlı streaming ajan playground
- Güvenli Markdown/GFM cevap render'ı
- Yanıtı durdurma, kopyalama ve yeniden oluşturma
- Ajan bazlı yerel sohbet geçmişi
- Ayrı `/bilgi-tabani` sayfası
- PDF, DOCX, TXT ve Markdown dosya yükleme
- Yerel SQLite bilgi tabanı ve FTS5 keyword arama
- OpenAI embeddings + cosine similarity ile semantic retrieval
- Semantic + keyword hybrid RAG ranking
- Her ajana ayrı bilgi kaynağı atama
- Playground cevaplarında belge ve PDF sayfa kaynaklarını gösterme
- PDF kaynaklarına tıklayıp ilgili sayfayı viewer içinde açma
- Sayfa bazlı OCR fallback (Türkçe + İngilizce varsayılan)
- İsteğe bağlı RAG debug paneli: semantic/keyword/final ranking ve süreler
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
AVENLYO_RAG_DEBUG=false
AVENLYO_OCR_LANGS=tur,eng
AVENLYO_RAG_SEMANTIC_MIN=0.22
AVENLYO_TOOLS_ENABLED=false
AVENLYO_TOOL_READS_ENABLED=true
AVENLYO_TOOL_WRITES_ENABLED=false
AVENLYO_TOOL_DESTRUCTIVE_ENABLED=false
AVENLYO_TOOL_DRY_RUN=true
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
8. PDF kaynağına tıklayarak viewer içinde doğrudan ilgili sayfayı açabilirsiniz.

Dosya başına maksimum boyut 25 MB, PDF sınırı 300 sayfadır. Bir PDF sayfasında yeterli native metin yoksa sistem sayfayı PNG olarak render edip OCR fallback çalıştırır. OCR gereken sayfa sayısı ilk sürümde belge başına en fazla 100'dür.

### RAG Debug

Geliştirme sırasında retrieval davranışını görmek için:

```env
AVENLYO_RAG_DEBUG=true
```

ayarlayın. Bir chat cevabından sonra Playground başlığında **RAG Debug** düğmesi görünür. Panel semantic adayları, keyword sonuçlarını, final hybrid seçimi, confidence seviyesini, relevance threshold'u, elenen duplicate/alakasız adayları, kısa chunk önizlemelerini, seçilen token miktarını ve retrieval sürelerini gösterir.

Semantic retrieval için varsayılan minimum eşik:

```env
AVENLYO_RAG_SEMANTIC_MIN=0.22
```

olarak ayarlanır. Keyword eşleşmesi olmayan ve bu eşikten düşük semantic skora sahip chunk'lar modele gönderilmez. Aynı sayfadan tekrar eden veya çok benzer chunk'lar ayrıca elenir.

### OCR

Varsayılan OCR dilleri Türkçe ve İngilizcedir:

```env
AVENLYO_OCR_LANGS=tur,eng
```

OCR yalnızca native PDF metni yetersiz olan sayfalarda çalışır. Chunk metadata'sında extraction method ve OCR confidence saklanır; kaynak etiketinde OCR kullanımı görünür.

### Local-first davranış

Orijinal yüklenen dosyalar OpenAI'ye dosya olarak yüklenmez. Yerel dosyalar:

```text
data/uploads/
```

altında tutulur. RAG metadata, chunk, embedding ve ajan-belge ilişkileri:

```text
data/knowledge.db
```

SQLite veritabanında saklanır. Ajan bazlı sohbetler ve mesaj geçmişi de aynı yerel `knowledge.db` içinde `conversations` ve `chat_messages` tablolarında tutulur.

OpenAI'ye yalnızca:
- indeksleme sırasında embedding üretilecek metin parçaları,
- chat sırasında retrieval ile seçilen ilgili metin parçaları,
- kontrollü context için son konuşma mesajları

gönderilir.

Chat tarafında her istekte tüm geçmiş yerine son 12 mesaj kullanılır. Responses API çağrıları `store: false` ile yapılır; sohbet geçmişinin ürün içi kalıcı kopyası yalnızca yerel SQLite veritabanında tutulur.

## Tools / Actions Foundation

Tools V1 altyapısı güvenli varsayılanlarla çalışır. İlk read-only executor olan `lookup_order`, OpenAI Responses function calling ile Playground'a bağlanmıştır. Write tool'lar henüz çalıştırılmaz.

Yerel SQLite içinde şu tablolar bulunur:

- `tools`: kod kontrollü built-in tool metadata ve strict JSON Schema
- `agent_tools`: ajan → tool yetkilendirmesi
- `tool_runs`: gelecekteki execution state, argument hash ve idempotency metadata
- `tool_approvals`: write/destructive onay kayıtları
- `tool_run_attempts`: retry/attempt metadata
- `tool_audit_events`: secret-redacted yerel audit olayları

İlk registry tanımları:

- `lookup_order`: read-only, onay gerektirmez, local demo executor hazır
- `create_crm_contact`: write, kullanıcı onayı gerektirir, executor henüz bağlı değildir

`lookup_order` akışı:

```text
Kullanıcı
→ Responses API
→ function_call: lookup_order
→ Agent permission + policy + Zod validation
→ local read-only executor
→ function_call_output
→ Responses API continuation
→ streaming final cevap
```

Tool call sonucu, run/attempt/audit metadata ile yerel SQLite'a kaydedilir. Chat içinde Tool Activity kartı görünür ve sohbet geçmişiyle birlikte kalıcıdır.

### lookup_order test verisi

Local demo executor şu siparişleri içerir:

- `ORD-4582` → Kargoya verildi · Transfer merkezinde
- `ORD-9041` → Hazırlanıyor · Paketleme aşamasında
- `ORD-1207` → Teslim edildi

Tool execution'ı test etmek için `.env.local` içinde:

```env
AVENLYO_TOOLS_ENABLED=true
AVENLYO_TOOL_READS_ENABLED=true
AVENLYO_TOOL_WRITES_ENABLED=false
```

ayarlayın, dev server'ı yeniden başlatın, ardından **Ajanlar → Ajanı düzenle → Sipariş sorgula** aracını seçin. Playground'da örneğin `ORD-4582 siparişim nerede?` sorun.

Foundation API'leri:

- `GET /api/tools`: tool kataloğu + güvenlik flag/limitleri
- `PATCH /api/tools`: built-in tool enable/disable
- `GET /api/agents/:id/tools`: ajana atanmış tool kimlikleri
- `PUT /api/agents/:id/tools`: ajan tool izinlerini güncelleme

Tool input şemalarının tek kaynağı Zod'dur. OpenAI strict function calling ile uyum için object şemaları `additionalProperties: false` ve tüm properties required olacak şekilde doğrulanır. Runtime'da model argümanları aynı Zod şemalarıyla yeniden parse edilmeden execution aşamasına geçemez.

Güvenli varsayılanlar:

```env
AVENLYO_TOOLS_ENABLED=false
AVENLYO_TOOL_READS_ENABLED=true
AVENLYO_TOOL_WRITES_ENABLED=false
AVENLYO_TOOL_DESTRUCTIVE_ENABLED=false
AVENLYO_TOOL_DRY_RUN=true
```

Bu sayede model bir tool çağrısı üretse bile Avenlyo'nun local policy katmanı izin vermeden execution gerçekleşmez. Read-only `lookup_order` için master anahtar ayrıca açık olmalıdır; write/destructive işlemler varsayılan olarak kapalı kalır.

## Mimari

- **Next.js App Router + TypeScript**
- **Server Route Handlers**: business, agents, knowledge ve chat API'leri
- **OpenAI Responses API**: SSE tabanlı streaming cevap üretimi ve strict function calling
- **React Markdown + GFM**: güvenli Markdown, tablo, liste ve kod render'ı
- **SQLite chat store**: ajan bazlı konuşma ve mesaj geçmişi
- **OpenAI Embeddings API**: doküman ve sorgu embedding'leri
- **SQLite + FTS5**: yerel metadata, chunk ve keyword retrieval
- **Node cosine similarity**: semantic retrieval
- **Hybrid retrieval**: semantic + keyword sonuçlarının RRF ile birleştirilmesi
- **unpdf**: PDF metin çıkarma ve OCR için sayfa render etme
- **React-PDF / PDF.js**: kaynak PDF viewer
- **Tesseract.js**: sayfa bazlı OCR
- **@napi-rs/canvas**: Node tarafında PDF sayfasını PNG'ye render etme
- **Mammoth**: DOCX metin çıkarma
- **js-tiktoken**: token tabanlı chunking
- **Local JSON Store**: işletme profili ve ajan ayarları
- **Tools Runtime**: Zod tabanlı strict tool registry, ajan-tool izinleri, policy engine, read-only local executor, tool run/audit ve Responses function-call loop

Çalışma anında oluşturulan `data/avenlyo.json`, `data/knowledge.db` ve `data/uploads/` Git'e eklenmez.

## Güvenlik

`OPENAI_API_KEY` hiçbir zaman istemci tarafına gönderilmez. Anahtarınızı repoya commit etmeyin; yalnızca `.env.local` içinde tutun.

Yüklenen belgeler kullanıcı girdisi olarak kabul edilir; uygulama dosya uzantısı, boyut, PDF sayfa ve OCR sayfa limitleri uygular. PDF dosyaları tarayıcıya yalnızca doğrulanmış belge kimliği üzerinden `/api/knowledge/:id/file` endpoint'i ile inline aktarılır.
