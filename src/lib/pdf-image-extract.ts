/**
 * Extração de IMAGENS (com caption inferida) de PDFs server-side via pdfjs-dist.
 *
 * Usada pela feature "Atlas" — student sobe PDF de atlas de anatomia /
 * histologia / banco de imagens de exames, e a gente extrai cada figura como
 * blob + texto adjacente que parece caption pra depois cruzar com a
 * transcrição da aula via embeddings.
 *
 * Função PURA: recebe Buffer, devolve array. Sem fs, sem fetch, sem DB, sem
 * Supabase. Quem persiste é o caller (rota / job).
 *
 * Estratégia (em Node, sem canvas):
 *   1. Carrega o doc com pdfjs legacy build (mesmo build do pdf-extract.ts).
 *   2. Pra cada página, pega `operatorList` + `commonObjs`/`objs` pra extrair
 *      os objetos de imagem brutos (sem rasterizar via NodeCanvas — evitamos
 *      a dep nativa). Pegamos os bytes originais quando o PDF embute JPEG/JPX
 *      direto; pra outros formatos serializamos os bytes raw num PNG manual
 *      mínimo via DEFLATE simples ou caímos pro caminho "skip".
 *   3. Pra cada imagem, calcula bbox a partir da matriz de transformação do
 *      último `paintImageXObject`/`paintInlineImageXObject` daquela imagem.
 *   4. Caption: pega `getTextContent` da página, ordena os items por (y, x) e
 *      escolhe o trecho mais próximo abaixo/direita da bbox, priorizando
 *      strings que começam com "Fig"/"Figura"/"Figure"/"Imagem".
 *
 * Trade-offs documentados:
 * - Em PDFs onde a imagem é vetorizada (paths SVG-like, não XObject), nada é
 *   extraído — pdfjs não expõe esses como "imagem". É consciente: o foco do
 *   Atlas é atlas escaneado / com fotos embutidas.
 * - Captions de PDFs com layout multi-coluna complexo podem vir truncadas; a
 *   heurística usa proximidade euclidiana simples, não detecção de coluna.
 * - Não convertemos pra PNG via canvas (evita dep `canvas`/`node-canvas`); se
 *   o stream interno não for JPEG/JPX nem RGBA decodificável, a imagem é
 *   pulada com um console.warn.
 */
import { deflateSync } from "node:zlib";

export type ExtractedPdfImage = {
  pageNumber: number;
  imageBuffer: Buffer;
  mimeType: string; // image/png ou image/jpeg
  caption: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
};

export type ExtractImagesOptions = {
  /** Ignora imagens cuja menor dimensão é abaixo desse valor (px).
   *  Default 100 — corta ícones, logos, ornamentos. */
  minDimensionPx?: number;
  /** Limite de imagens retornadas por página. Default 10 — segurança contra
   *  PDFs com centenas de thumbs. */
  maxImagesPerPage?: number;
};

/**
 * Shape mínimo dos objetos `Image` que o pdfjs entrega via `commonObjs`/`objs`.
 * O tipo público do pdfjs não exporta isso, então definimos o subset que
 * usamos. `data` é o pixel buffer já decodificado pelo pdfjs em vários casos;
 * `kind` indica o layout (1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP).
 */
type PdfjsImageObject = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  /** Quando o pdfjs preserva o stream original (JPEG/JPX embarcado), entrega
   *  aqui em vez de `data`. Nem todas as versões expõem — usamos via cast. */
  bitmap?: unknown;
};

/** Operação que o pdfjs entrega em `operatorList.fnArray` / `argsArray`. */
type PdfOpFn = number;

/**
 * Bbox em coordenadas de página (origem bottom-left, pré-viewport).
 */
type ImagePlacement = {
  name: string;
  bbox: { x: number; y: number; width: number; height: number };
};

const FIG_RX = /^\s*(fig(?:ure|ura)?\.?|imagem)\b/i;

/**
 * Lê um item do `commonObjs`/`objs` do pdfjs de forma síncrona quando já está
 * resolvido, ou retorna null. O pdfjs usa um padrão de callback que fica
 * "pendente" em alguns drivers; preferimos pular em vez de bloquear.
 */
function tryGetObject(
  store: { get: (name: string) => unknown; has?: (name: string) => boolean },
  name: string,
): unknown {
  try {
    if (store.has && !store.has(name)) return null;
    return store.get(name);
  } catch {
    return null;
  }
}

/**
 * Constrói um PNG mínimo (sem filtros, scanlines com filter byte 0) a partir
 * de um buffer RGBA ou RGB. Evita dependência de `canvas`/`sharp` em Node.
 * Não é a PNG mais eficiente do mundo, mas é correta e os arquivos resultam
 * em alguns KB — bom o suficiente pra blobs guardados como anexo.
 */
function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  hasAlpha: boolean,
): Buffer {
  const channels = hasAlpha ? 4 : 3;
  const stride = width * channels;
  // Adiciona filter byte 0 (None) por scanline conforme PNG spec.
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(Buffer.from(raw));

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(hasAlpha ? 6 : 2, 9); // color type
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const chunks: Buffer[] = [signature, makeChunk("IHDR", ihdr), makeChunk("IDAT", idat), makeChunk("IEND", Buffer.alloc(0))];
  return Buffer.concat(chunks);
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC32 padrão PNG. Tabela é gerada uma vez.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Detecta se um Uint8Array é um JPEG (FF D8 ... FF D9) — quando o pdfjs nos
 * entrega o stream original sem decodificar, conseguimos sair com o blob
 * intacto, sem reencodar.
 */
function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

/**
 * Converte um objeto de imagem do pdfjs num Buffer + mimeType. Retorna null
 * quando o formato não é suportado (logs via console.warn no caller).
 */
function imageObjectToBuffer(
  img: PdfjsImageObject,
): { buffer: Buffer; mimeType: string } | null {
  const data = img.data;
  if (!data || !img.width || !img.height) return null;

  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Caso JPEG bruto preservado: sai direto.
  if (looksLikeJpeg(u8)) {
    return { buffer: Buffer.from(u8), mimeType: "image/jpeg" };
  }

  // pdfjs ImageKind: 1 = GRAYSCALE_1BPP (1 bit por px), 2 = RGB_24BPP, 3 = RGBA_32BPP.
  const expectedRgb = img.width * img.height * 3;
  const expectedRgba = img.width * img.height * 4;
  const expectedGray = img.width * img.height;

  if (img.kind === 3 && u8.length >= expectedRgba) {
    return {
      buffer: encodePng(u8.subarray(0, expectedRgba), img.width, img.height, true),
      mimeType: "image/png",
    };
  }
  if (img.kind === 2 && u8.length >= expectedRgb) {
    return {
      buffer: encodePng(u8.subarray(0, expectedRgb), img.width, img.height, false),
      mimeType: "image/png",
    };
  }
  // GRAYSCALE_1BPP: expandimos pra RGB pra simplificar o encode (PNG bit-depth 8).
  if (img.kind === 1 && u8.length >= Math.ceil(expectedGray / 8)) {
    const rgb = new Uint8Array(expectedRgb);
    for (let i = 0; i < expectedGray; i++) {
      const bit = (u8[i >> 3] >> (7 - (i & 7))) & 1;
      const v = bit ? 255 : 0;
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    }
    return {
      buffer: encodePng(rgb, img.width, img.height, false),
      mimeType: "image/png",
    };
  }
  // Fallback: tenta interpretar como RGB direto se o tamanho bate.
  if (u8.length === expectedRgb) {
    return {
      buffer: encodePng(u8, img.width, img.height, false),
      mimeType: "image/png",
    };
  }
  if (u8.length === expectedRgba) {
    return {
      buffer: encodePng(u8, img.width, img.height, true),
      mimeType: "image/png",
    };
  }
  return null;
}

/**
 * Caminha a operatorList da página coletando bboxes (cada paintImageXObject
 * vem precedido por uma sequência de transform que define a matriz CTM).
 *
 * O pdfjs expõe as constantes em `OPS`; importamos pra confiar nos números.
 */
type OpsMap = {
  paintImageXObject: PdfOpFn;
  paintInlineImageXObject?: PdfOpFn;
  paintJpegXObject?: PdfOpFn;
  transform: PdfOpFn;
  save: PdfOpFn;
  restore: PdfOpFn;
};

function collectImagePlacements(
  fnArray: PdfOpFn[],
  argsArray: unknown[][],
  ops: OpsMap,
): ImagePlacement[] {
  // Stack de CTM 3x3 reduzido a 6 valores [a, b, c, d, e, f] (modelo PDF).
  type Matrix = [number, number, number, number, number, number];
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [identity.slice() as Matrix];

  function top(): Matrix {
    return stack[stack.length - 1];
  }
  function multiply(a: Matrix, b: Matrix): Matrix {
    // PDF aplica m * CTM (pre-multiply em algumas convenções). pdfjs usa
    // transform(a,b,c,d,e,f) que multiplica a CTM atual pela matriz dada.
    return [
      a[0] * b[0] + a[1] * b[2],
      a[0] * b[1] + a[1] * b[3],
      a[2] * b[0] + a[3] * b[2],
      a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4],
      a[4] * b[1] + a[5] * b[3] + b[5],
    ];
  }

  const placements: ImagePlacement[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === ops.save) {
      stack.push(top().slice() as Matrix);
    } else if (fn === ops.restore) {
      if (stack.length > 1) stack.pop();
    } else if (fn === ops.transform) {
      const m = args as Matrix;
      stack[stack.length - 1] = multiply(top(), m);
    } else if (
      fn === ops.paintImageXObject ||
      (ops.paintInlineImageXObject !== undefined && fn === ops.paintInlineImageXObject) ||
      (ops.paintJpegXObject !== undefined && fn === ops.paintJpegXObject)
    ) {
      // CTM neste ponto mapeia o unit square (0..1) onde a imagem é desenhada
      // pro espaço da página. A bbox é a imagem do quadrado (0,0)-(1,1).
      const m = top();
      // Os 4 cantos do unit square:
      const corners: Array<[number, number]> = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ];
      const projected = corners.map(([x, y]) => [
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
      ]);
      const xs = projected.map((p) => p[0]);
      const ys = projected.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const name = typeof args?.[0] === "string" ? (args[0] as string) : `inline_${i}`;
      placements.push({
        name,
        bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      });
    }
  }
  return placements;
}

/**
 * Texto da página representado como um array de runs com posição.
 */
type TextRun = { str: string; x: number; y: number; width: number; height: number };

/**
 * Escolhe a caption pra uma bbox dado os runs da página.
 *
 * Critérios (em ordem):
 *   1. Runs cuja string começa com "Fig"/"Figura"/"Figure"/"Imagem" e estão
 *      visualmente próximos da imagem (abaixo ou ao lado direito).
 *   2. Senão, run mais próximo (distância euclidiana do centro do run pro
 *      centro/borda inferior da bbox), desde que esteja abaixo ou ao lado.
 *   3. Junta runs adjacentes (mesma linha-ish) até ~300 chars ou até bater
 *      em outra imagem (proxy: outro run "Fig...") ou um título (heurística:
 *      run muito maior em y-altura).
 */
function pickCaption(
  bbox: { x: number; y: number; width: number; height: number },
  runs: TextRun[],
  otherImages: ImagePlacement[],
): string | null {
  if (runs.length === 0) return null;

  // Filtra runs que estão "abaixo" (y menor — origin bottom-left no PDF) ou
  // ao lado direito da imagem.
  const candidates = runs
    .map((r, idx) => {
      const isBelow = r.y < bbox.y && r.x >= bbox.x - bbox.width * 0.2 && r.x <= bbox.x + bbox.width * 1.2;
      const isRight = r.x >= bbox.x + bbox.width * 0.9 && r.y >= bbox.y - bbox.height * 0.1 && r.y <= bbox.y + bbox.height * 1.1;
      if (!isBelow && !isRight) return null;
      // Distância: priorizamos "logo abaixo".
      const dx = Math.max(0, Math.abs(r.x + r.width / 2 - (bbox.x + bbox.width / 2)) - bbox.width / 2);
      const dy = isBelow ? bbox.y - (r.y + r.height) : Math.abs(r.y - bbox.y);
      const dist = Math.hypot(dx, dy);
      return { run: r, idx, dist, isBelow };
    })
    .filter((v): v is { run: TextRun; idx: number; dist: number; isBelow: boolean } => v !== null)
    .sort((a, b) => {
      const aFig = FIG_RX.test(a.run.str) ? 0 : 1;
      const bFig = FIG_RX.test(b.run.str) ? 0 : 1;
      if (aFig !== bFig) return aFig - bFig;
      return a.dist - b.dist;
    });

  if (candidates.length === 0) return null;
  const seed = candidates[0];

  // Constrói uma área de "stop" — outras imagens nessa página delimitam até
  // onde a caption pode crescer.
  const stopYs = otherImages
    .filter((o) => o.bbox.x !== bbox.x || o.bbox.y !== bbox.y)
    .map((o) => o.bbox.y + o.bbox.height)
    .filter((y) => y < seed.run.y); // imagens acima do seed (no eixo PDF y cresce pra cima)

  // Junta runs sequenciais a partir do seed que estejam na mesma região,
  // até bater em FIG_RX de outra figura ou exceder ~300 chars.
  const ordered = runs
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      // Mesma região vertical aproximada do seed e dentro do "corredor" da bbox.
      const inCorridor = r.x >= bbox.x - bbox.width * 0.2 && r.x <= bbox.x + bbox.width * 1.2;
      const closeY = Math.abs(r.y - seed.run.y) < bbox.height * 1.5;
      return inCorridor && closeY;
    })
    .sort((a, b) => {
      // Y desc (mais alto primeiro = mais perto da bbox que está acima),
      // depois X asc.
      if (Math.abs(a.r.y - b.r.y) > 2) return b.r.y - a.r.y;
      return a.r.x - b.r.x;
    });

  let collected = "";
  let started = false;
  for (const { r } of ordered) {
    if (!started) {
      if (r.str === seed.run.str && r.x === seed.run.x && r.y === seed.run.y) {
        started = true;
      } else {
        continue;
      }
    }
    // Stop em outra figura
    if (collected.length > 0 && FIG_RX.test(r.str)) break;
    // Stop se cruzou pra abaixo de outra imagem
    if (stopYs.some((sy) => r.y < sy && r.y > seed.run.y - bbox.height * 1.5)) break;
    if (collected.length > 0) collected += " ";
    collected += r.str.trim();
    if (collected.length >= 300) {
      collected = collected.slice(0, 300).replace(/\s+\S*$/, "");
      break;
    }
  }
  const cleaned = collected.trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Tipo estrutural mínimo da página do pdfjs que usamos. Definido aqui pra
 * não acoplar a tipos privados do pacote.
 */
type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type PdfTextContent = { items: PdfTextItem[] };
type PdfOperatorList = { fnArray: PdfOpFn[]; argsArray: unknown[][] };
type PdfObjsStore = { get: (name: string) => unknown; has?: (name: string) => boolean };
type PdfPage = {
  getOperatorList: () => Promise<PdfOperatorList>;
  getTextContent: () => Promise<PdfTextContent>;
  objs: PdfObjsStore;
  commonObjs: PdfObjsStore;
  cleanup: () => void;
};
type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfjsModule = {
  getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocument> };
  OPS: Record<string, number>;
  GlobalWorkerOptions?: { workerSrc?: string };
};

/**
 * Função pública. Não lança nos casos de erro do pdfjs — encapsula em
 * console.warn e retorna o que conseguiu coletar até ali.
 */
export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
  opts?: ExtractImagesOptions,
): Promise<ExtractedPdfImage[]> {
  const minDim = opts?.minDimensionPx ?? 100;
  const maxPerPage = opts?.maxImagesPerPage ?? 10;

  const out: ExtractedPdfImage[] = [];

  let pdfjs: PdfjsModule;
  try {
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  } catch (err) {
    console.warn("[pdf-image-extract] falha ao carregar pdfjs:", (err as Error).message);
    return out;
  }

  // Server-side: desabilita worker (não temos Web Worker em Node, e o
  // legacy build aceita rodar inline).
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }

  let doc: PdfDocument;
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength),
      // Sem cMaps/standardFonts em Node — pra texto basta.
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    doc = await task.promise;
  } catch (err) {
    console.warn("[pdf-image-extract] não abriu o PDF:", (err as Error).message);
    return out;
  }

  const ops: OpsMap = {
    paintImageXObject: pdfjs.OPS.paintImageXObject as PdfOpFn,
    paintInlineImageXObject: pdfjs.OPS.paintInlineImageXObject as PdfOpFn | undefined,
    paintJpegXObject: pdfjs.OPS.paintJpegXObject as PdfOpFn | undefined,
    transform: pdfjs.OPS.transform as PdfOpFn,
    save: pdfjs.OPS.save as PdfOpFn,
    restore: pdfjs.OPS.restore as PdfOpFn,
  };

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    let page: PdfPage;
    try {
      page = await doc.getPage(pageNum);
    } catch (err) {
      console.warn(`[pdf-image-extract] página ${pageNum} falhou:`, (err as Error).message);
      continue;
    }

    try {
      const opList = await page.getOperatorList();
      const placements = collectImagePlacements(opList.fnArray, opList.argsArray, ops);

      // Constrói os runs textuais com posição absoluta (pdfjs entrega
      // transform = [a,b,c,d,e,f] do texto; e=x, f=y).
      const textContent = await page.getTextContent();
      const runs: TextRun[] = textContent.items
        .map((it) => {
          const str = it.str ?? "";
          const t = it.transform ?? [];
          const x = typeof t[4] === "number" ? t[4] : 0;
          const y = typeof t[5] === "number" ? t[5] : 0;
          return {
            str,
            x,
            y,
            width: typeof it.width === "number" ? it.width : str.length * 4,
            height: typeof it.height === "number" ? it.height : 10,
          };
        })
        .filter((r) => r.str.trim().length > 0);

      let kept = 0;
      for (const placement of placements) {
        if (kept >= maxPerPage) break;

        // Resolve o objeto da imagem. O pdfjs guarda por nome em `objs` (página)
        // ou `commonObjs` (compartilhado). Tentamos os dois.
        let raw = tryGetObject(page.objs, placement.name);
        if (!raw) raw = tryGetObject(page.commonObjs, placement.name);
        if (!raw || typeof raw !== "object") continue;

        const img = raw as PdfjsImageObject;
        if (!img.width || !img.height) continue;
        if (Math.min(img.width, img.height) < minDim) continue;

        let encoded: { buffer: Buffer; mimeType: string } | null = null;
        try {
          encoded = imageObjectToBuffer(img);
        } catch (err) {
          console.warn(
            `[pdf-image-extract] encode falhou em ${placement.name} (p.${pageNum}):`,
            (err as Error).message,
          );
        }
        if (!encoded) continue;

        const caption = pickCaption(placement.bbox, runs, placements);

        out.push({
          pageNumber: pageNum,
          imageBuffer: encoded.buffer,
          mimeType: encoded.mimeType,
          caption,
          bbox: placement.bbox,
          width: img.width,
          height: img.height,
        });
        kept++;
      }
    } catch (err) {
      console.warn(`[pdf-image-extract] processamento p.${pageNum} falhou:`, (err as Error).message);
    } finally {
      try {
        page.cleanup();
      } catch {
        // ignore
      }
    }
  }

  try {
    await doc.destroy();
  } catch {
    // ignore
  }

  return out;
}
