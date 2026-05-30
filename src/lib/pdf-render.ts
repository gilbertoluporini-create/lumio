"use client";

// Renderiza páginas de um PDF pra dataURLs (JPEG comprimido) usando pdfjs-dist.
// Roda 100% no client. Limita tamanho/qualidade pra caber no localStorage.

export type RenderedPage = {
  pageNumber: number;
  imageDataUrl: string;
};

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.72;

let workerConfigured = false;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!workerConfigured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
    workerConfigured = true;
  }
  return pdfjs;
}

/**
 * Renderiza páginas do PDF como JPEG dataURL.
 * @param file  PDF
 * @param maxPages  Opcional — para após N páginas (default: todas).
 *                  Útil pra summary-images que só usa 1-2 páginas como referência.
 */
export async function renderPdfToImages(
  file: File,
  maxPages?: number,
): Promise<RenderedPage[]> {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await loadingTask.promise;
  const pages: RenderedPage[] = [];
  const limit = Math.min(doc.numPages, maxPages ?? doc.numPages);
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      pages.push({ pageNumber: i, imageDataUrl: "" });
      continue;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    pages.push({ pageNumber: i, imageDataUrl: dataUrl });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}
