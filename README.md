# Avenlyo AI Studio

Avenlyo, işletme bilgisini tek yerde tutup bu bağlamla çalışan yapay zeka ajanları oluşturabileceğiniz, lokal-first bir Next.js uygulamasıdır.

## Özellikler

- İşletme profili: marka, sektör, hedef kitle, ton, ürün/hizmet, SSS ve özel bilgiler
- Ajan oluşturma, düzenleme, çoğaltma ve silme
- Her ajana özel rol, amaç, talimat ve model seçimi
- OpenAI Responses API ile ajan playground
- Verilerin `data/avenlyo.json` dosyasında lokal tutulması
- API anahtarının yalnızca sunucu tarafında `.env.local` üzerinden kullanılması
- Responsive, sade ve koyu temalı arayüz

## Kurulum

```bash
npm install
cp .env.example .env.local
```

`.env.local` içine OpenAI anahtarınızı ekleyin:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-6-luna
```

Ardından:

```bash
npm run dev
```

Uygulama varsayılan olarak [http://localhost:3000](http://localhost:3000) adresinde açılır.

## Mimari

- **Next.js App Router + TypeScript**
- **Server Route Handlers**: business, agents ve chat API'leri
- **OpenAI Responses API**: doğrudan server-side fetch
- **Local JSON Store**: MVP için harici veritabanı gerektirmez

> Not: `data/avenlyo.json` çalışma anında otomatik oluşturulur ve Git'e eklenmez.

## Güvenlik

`OPENAI_API_KEY` hiçbir zaman istemci tarafına gönderilmez. Anahtarınızı repoya commit etmeyin; yalnızca `.env.local` içinde tutun.
