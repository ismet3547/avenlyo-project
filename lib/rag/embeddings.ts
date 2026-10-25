const EMBEDDING_BATCH_SIZE = 64;

type EmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  error?: { message?: string };
};

function apiError(payload: EmbeddingResponse, fallback: string) {
  return payload.error?.message || fallback;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY tanımlı değil. Bilgi tabanını indekslemek için anahtarı .env.local dosyanıza ekleyin.",
    );
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: batch,
        encoding_format: "float",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const payload = (await response.json()) as EmbeddingResponse;
    if (!response.ok || !Array.isArray(payload.data)) {
      throw new Error(
        apiError(payload, "OpenAI embedding isteği başarısız oldu."),
      );
    }

    const ordered = [...payload.data].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );

    for (const item of ordered) {
      if (!Array.isArray(item.embedding)) {
        throw new Error("Embedding yanıtı beklenen formatta değil.");
      }
      embeddings.push(item.embedding);
    }
  }

  if (embeddings.length !== texts.length) {
    throw new Error("Embedding sayısı belge parçalarıyla eşleşmedi.");
  }

  return embeddings;
}

export async function embedQuery(query: string) {
  const [embedding] = await embedTexts([query]);
  return embedding;
}
