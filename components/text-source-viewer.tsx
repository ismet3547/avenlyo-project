"use client";

import { useEffect, useState } from "react";

type PreviewData = {
  document: {
    id: string;
    name: string;
    extension: string;
  };
  pageStart: number | null;
  extractionMethod: "native" | "ocr";
  ocrConfidence: number | null;
  text: string;
};

type Props = {
  documentId: string;
  documentName: string;
  chunkId?: string;
  page?: number | null;
  onClose: () => void;
};

export function TextSourceViewer({
  documentId,
  documentName,
  chunkId,
  page,
  onClose,
}: Props) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    if (chunkId) query.set("chunkId", chunkId);
    if (page) query.set("page", String(page));

    fetch(
      `/api/knowledge/${encodeURIComponent(documentId)}/preview?${query.toString()}`,
    )
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Kaynak açılamadı.");
        setData(payload);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Kaynak açılamadı."),
      );
  }, [chunkId, documentId, page]);

  return (
    <div className="modal-layer viewer-layer" role="dialog" aria-modal="true">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Kaynak önizlemeyi kapat"
      />
      <section className="text-source-viewer">
        <header className="pdf-viewer-head">
          <div>
            <span className="eyebrow accent">KAYNAK METİN</span>
            <strong>{data?.document.name || documentName}</strong>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </header>

        <div className="text-source-meta">
          {data?.pageStart && <span>Sayfa {data.pageStart}</span>}
          {data?.extractionMethod === "ocr" && (
            <span>
              OCR
              {data.ocrConfidence !== null ? ` · güven %${data.ocrConfidence}` : ""}
            </span>
          )}
          {data?.extractionMethod === "native" && <span>Native text</span>}
        </div>

        <div className="text-source-body">
          {error ? (
            <div className="viewer-state viewer-error">{error}</div>
          ) : data ? (
            <pre>{data.text || "Bu kaynakta önizlenecek metin bulunamadı."}</pre>
          ) : (
            <div className="viewer-state">Kaynak yükleniyor…</div>
          )}
        </div>
      </section>
    </div>
  );
}
