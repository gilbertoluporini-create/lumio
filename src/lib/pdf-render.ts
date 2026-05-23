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
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    workerConfigured = true;
  }
  return pdfjs;
}

export async function renderPdfToImages(file: File): Promise<RenderedPage[]> {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await loadingTask.promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
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
