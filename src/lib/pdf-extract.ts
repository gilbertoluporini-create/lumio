/**
 * Extração de texto de PDFs client-side via pdfjs-dist.
 *
 * Antes era inline em 3 lugares (content-wizard, document/[id], etc) — uma
 * função compartilhada garante que melhorias (cMaps, fontes padrão, mensagens
 * de erro) cheguem em todos os pontos sem drift.
 *
 * cMaps são necessários pra PDFs com encoding asiático ou Unicode complexo;
 * standardFonts pra PDFs que referenciam Helvetica/Times/Symbol sem embarcar.
 * Sem isso pdfjs falha calado em vários PDFs de aula (slides exportados de
 * PowerPoint frequentemente caem nesse caso).
 */

export type ExtractedPdf = {
  text: string;
  pages: number;
};

export type PdfExtractError =
  | { kind: "password"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "unknown"; message: string };

export class PdfExtractException extends Error {
  kind: PdfExtractError["kind"];
  constructor(err: PdfExtractError) {
    super(err.message);
    this.kind = err.kind;
    this.name = "PdfExtractException";
  }
}

/**
 * Fallback server-side via POST /api/pdf-extract.
 *
 * Quando o pdfjs do navegador falha (iPad Safari antigo com ES2022 issues,
 * engines com features faltando, etc), enviamos o arquivo binário pro server
 * que processa com pdf-parse (Node, sem worker, sem dependência de Web APIs).
 *
 * Não persiste — uso single-shot.
 */
async function extractPdfTextViaServer(file: File): Promise<ExtractedPdf> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch("/api/pdf-extract", {
    method: "POST",
    body: form,
  });
  const json = (await resp.json().catch(() => ({}))) as {
    text?: string;
    pages?: number;
    error?: string;
    kind?: PdfExtractError["kind"];
  };
  if (!resp.ok) {
    const kind = (json.kind ?? "unknown") as PdfExtractError["kind"];
    throw new PdfExtractException({
      kind,
      message: json.error || "Falha ao processar PDF no servidor.",
    });
  }
  if (!json.text || !json.pages) {
    throw new PdfExtractException({
      kind: "unknown",
      message: "Resposta do servidor sem texto/páginas.",
    });
  }
  return { text: json.text, pages: json.pages };
}

/**
 * Extrai texto de um PDF File. Lança PdfExtractException com kind específico
 * pra o caller poder mostrar mensagem útil ao user.
 *
 * Estratégia atual: SERVER-FIRST. Toda extração roda no Node via pdf-parse.
 *
 * Por quê: o pdfjs no client falha de formas obscuras em iPad Safari, Safari
 * antigo, alguns Android antigos — mesmo o legacy build (ES2017) deu erro
 * "undefined is not a function" pra usuários reais. O custo de eliminar
 * o client-path é ~1-2s extras por PDF (upload + parse) — vale a robustez.
 *
 * O `extractPdfTextClient` continua exportado/disponível pra futuros usos
 * onde latência importa mais que compat, mas o caminho default é o server.
 */
export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  return await extractPdfTextViaServer(file);
}

/**
 * Implementação client-side original — usa pdfjs no navegador.
 */
async function extractPdfTextClient(file: File): Promise<ExtractedPdf> {
  // Usa o legacy build (ES2017) pra compatibilidade com iPad Safari, navegadores
  // mais antigos e qualquer engine que não suporte todas as features do build
  // moderno do pdfjs 5.x. O legacy é levemente maior mas funciona em todo
  // lugar. (Isabella reportou "undefined is not a function (near '...t of e...')"
  // no iPad — sintoma clássico de feature ES2022 não suportada).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
  }

  let doc;
  try {
    const buf = await file.arrayBuffer();
    const task = pdfjs.getDocument({
      data: new Uint8Array(buf),
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      useSystemFonts: true,
      // Suprime os logs verbosos do pdfjs em console
      verbosity: 0,
    });
    doc = await task.promise;
  } catch (err) {
    const e = err as Error & { name?: string; code?: number };
    const msg = e?.message ?? "";
    // Padrões conhecidos do pdfjs
    if (
      e.name === "PasswordException" ||
      /password/i.test(msg) ||
      /encrypt/i.test(msg)
    ) {
      throw new PdfExtractException({
        kind: "password",
        message:
          "Esse PDF está protegido por senha — remova a proteção antes de subir.",
      });
    }
    if (/invalid pdf/i.test(msg) || e.name === "InvalidPDFException") {
      throw new PdfExtractException({
        kind: "invalid",
        message: "Arquivo não é um PDF válido (pode estar corrompido).",
      });
    }
    throw new PdfExtractException({
      kind: "unknown",
      message: msg || "Falha desconhecida ao abrir o PDF.",
    });
  }

  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .filter((s) => s.length > 0)
        .join(" ");
      if (pageText.trim().length > 0) {
        parts.push(`--- Página ${i} ---\n${pageText}`);
      }
      page.cleanup();
    }
    const pages = doc.numPages;
    await doc.destroy();
    const text = parts.join("\n\n");
    if (!text.trim()) {
      throw new PdfExtractException({
        kind: "empty",
        message:
          "Esse PDF não tem texto extraível (provavelmente é só imagem escaneada).",
      });
    }
    return { text, pages };
  } catch (err) {
    if (err instanceof PdfExtractException) throw err;
    const e = err as Error;
    throw new PdfExtractException({
      kind: "unknown",
      message: e?.message || "Falha ao ler páginas do PDF.",
    });
  }
}
