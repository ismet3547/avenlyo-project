"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  documentId: string;
  documentName: string;
  initialPage?: number | null;
  onClose: () => void;
};

export function PdfSourceViewer({
  documentId,
  documentName,
  initialPage,
  onClose,
}: Props) {
  const [pageNumber, setPageNumber] = useState(Math.max(1, initialPage || 1));
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [pageWidth, setPageWidth] = useState(760);

  useEffect(() => {
    setPageNumber(Math.max(1, initialPage || 1));
    setScale(1);
  }, [documentId, initialPage]);

  useEffect(() => {
    function resize() {
      setPageWidth(Math.max(280, Math.min(760, window.innerWidth - 80)));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const fileUrl = `/api/knowledge/${encodeURIComponent(documentId)}/file`;

  return (
    <div className="modal-layer viewer-layer" role="dialog" aria-modal="true">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="PDF görüntüleyiciyi kapat"
      />
      <section className="pdf-viewer">
        <header className="pdf-viewer-head">
          <div>
            <span className="eyebrow accent">KAYNAK BELGE</span>
            <strong title={documentName}>{documentName}</strong>
          </div>
          <div className="pdf-viewer-controls">
            <button
              className="viewer-control"
              onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
              disabled={pageNumber <= 1}
            >
              ←
            </button>
            <span>{pageNumber} / {pageCount || "…"}</span>
            <button
              className="viewer-control"
              onClick={() =>
                setPageNumber((value) =>
                  pageCount ? Math.min(pageCount, value + 1) : value + 1,
                )
              }
              disabled={Boolean(pageCount && pageNumber >= pageCount)}
            >
              →
            </button>
            <button
              className="viewer-control"
              onClick={() => setScale((value) => Math.max(.65, value - .15))}
            >
              −
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button
              className="viewer-control"
              onClick={() => setScale((value) => Math.min(2, value + .15))}
            >
              +
            </button>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="pdf-viewer-body">
          <Document
            file={fileUrl}
            suspense={false}
            loading={<div className="viewer-state">PDF yükleniyor…</div>}
            error={<div className="viewer-state viewer-error">PDF açılamadı.</div>}
            onLoadSuccess={({ numPages }) => {
              setPageCount(numPages);
              setPageNumber((value) => Math.min(Math.max(1, value), numPages));
            }}
          >
            <div className="pdf-page-frame">
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </Document>
        </div>
      </section>
    </div>
  );
}
