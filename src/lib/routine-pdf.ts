/**
 * Renderiza um PDF "padrão Lumio" de rotina de estudo semanal.
 *
 * Layout:
 *  - Header: "Rotina de Estudo · {matéria}" + data + custo
 *  - Sub-header: resumo (objetivo, total semanal)
 *  - 7 seções (Dom..Sáb), cada uma com blocos {hora — tópico — observação}
 *  - Footer: marca "Lumio" + nota "revise sempre"
 *
 * Sem fontes customizadas — Helvetica padrão do PDF cobre PT-BR via WinAnsi.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type RoutineBlock = {
  startTime: string; // "HH:MM"
  endTime: string;
  topic: string;
  note?: string;
};

export type RoutineDay = {
  dayOfWeek: number; // 0=dom..6=sáb
  dayLabel: string;
  blocks: RoutineBlock[];
};

export type RoutineDoc = {
  subjectName: string;
  title: string; // ex: "Rotina — Endócrino"
  generatedAt: Date;
  summary?: string; // 1-3 frases de objetivo da rotina
  weeklyPlan: RoutineDay[];
  totalMinutesPerWeek?: number;
};

// --- Brand colors (alinhado ao app Lumio) ---
const COLOR_PRIMARY = rgb(0.46, 0.32, 0.95); // violet ≈ #7551F2
const COLOR_INK = rgb(0.12, 0.12, 0.16);
const COLOR_MUTED = rgb(0.45, 0.45, 0.52);
const COLOR_RULE = rgb(0.88, 0.88, 0.92);
const COLOR_CARD = rgb(0.97, 0.96, 1.0);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOT = 48;

/**
 * Normaliza pra caracteres que WinAnsi (Helvetica) suporta.
 * pdf-lib lança "WinAnsi cannot encode" pra qualquer char fora do mapa —
 * LLM gosta de meter →, •, ≈, ☆, emojis. Trocamos os comuns por equivalentes
 * ASCII e, no fim, removemos tudo que sobrar fora do WinAnsi.
 */
function sanitize(text: string): string {
  const mapped = text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·▪►◆◼]/g, "-")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/≈/g, "~")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/ /g, " ")
    .replace(/​|‌|‍|﻿/g, "");
  // Stripa qualquer char fora do range que Helvetica/WinAnsi codifica
  // sem erro. WinAnsi cobre Latin-1 + alguns símbolos em 0x80–0x9F.
  // Mantém ASCII, letras latinas acentuadas e os símbolos comuns; remove o resto.
  return mapped.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "");
}

/** Quebra texto em linhas que cabem em maxWidth. */
function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? `${cur} ${w}` : w;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width <= maxWidth) {
      cur = tentative;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtTotalHours(min: number | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h/semana`;
  return `${h}h${String(m).padStart(2, "0")}/semana`;
}

/**
 * Devolve um Uint8Array com o PDF da rotina pronto pra upload.
 */
export async function renderRoutinePdf(doc: RoutineDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setAuthor("Lumio");
  pdf.setSubject(`Rotina de estudo — ${doc.subjectName}`);
  pdf.setProducer("Lumio");
  pdf.setCreator("Lumio");

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN_TOP;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < MARGIN_BOT) {
      drawFooter(page, helv);
      page = pdf.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN_TOP;
    }
  };

  function drawFooter(p: typeof page, font: PDFFont) {
    const txt = "Lumio · revise sempre o que o Lumi gerou.";
    const size = 9;
    const w = font.widthOfTextAtSize(txt, size);
    p.drawText(txt, {
      x: (PAGE_W - w) / 2,
      y: 28,
      size,
      font,
      color: COLOR_MUTED,
    });
  }

  // ------ Header (faixa com cor primária) ------
  const headerH = 76;
  page.drawRectangle({
    x: 0,
    y: PAGE_H - headerH,
    width: PAGE_W,
    height: headerH,
    color: COLOR_PRIMARY,
  });
  page.drawText("Lumio", {
    x: MARGIN_X,
    y: PAGE_H - 30,
    size: 14,
    font: helvBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Rotina de estudo", {
    x: MARGIN_X,
    y: PAGE_H - 56,
    size: 22,
    font: helvBold,
    color: rgb(1, 1, 1),
  });
  const dateStr = fmtDate(doc.generatedAt);
  const dateW = helv.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN_X - dateW,
    y: PAGE_H - 30,
    size: 10,
    font: helv,
    color: rgb(1, 1, 1),
  });

  cursorY = PAGE_H - headerH - 22;

  // ------ Subject + summary ------
  const subjLine = sanitize(`Matéria: ${doc.subjectName}`);
  page.drawText(subjLine, {
    x: MARGIN_X,
    y: cursorY,
    size: 13,
    font: helvBold,
    color: COLOR_INK,
  });
  cursorY -= 18;

  const totalHrs = fmtTotalHours(doc.totalMinutesPerWeek);
  if (totalHrs) {
    page.drawText(`Carga semanal sugerida: ${totalHrs}`, {
      x: MARGIN_X,
      y: cursorY,
      size: 10,
      font: helv,
      color: COLOR_MUTED,
    });
    cursorY -= 16;
  }

  if (doc.summary && doc.summary.trim()) {
    const summaryLines = wrapLines(
      doc.summary.trim(),
      helv,
      10.5,
      PAGE_W - 2 * MARGIN_X,
    );
    cursorY -= 4;
    for (const line of summaryLines) {
      ensureSpace(14);
      page.drawText(line, {
        x: MARGIN_X,
        y: cursorY,
        size: 10.5,
        font: helv,
        color: COLOR_INK,
      });
      cursorY -= 14;
    }
  }

  // Divisor
  cursorY -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y: cursorY },
    end: { x: PAGE_W - MARGIN_X, y: cursorY },
    thickness: 1,
    color: COLOR_RULE,
  });
  cursorY -= 16;

  // ------ Days ------
  const blockTextW = PAGE_W - 2 * MARGIN_X - 90; // espaço pra hora à esquerda

  for (const day of doc.weeklyPlan) {
    // título do dia
    ensureSpace(34);
    page.drawText(sanitize(day.dayLabel), {
      x: MARGIN_X,
      y: cursorY,
      size: 13,
      font: helvBold,
      color: COLOR_PRIMARY,
    });
    cursorY -= 16;

    if (day.blocks.length === 0) {
      page.drawText("livre — sem bloco recomendado", {
        x: MARGIN_X + 12,
        y: cursorY,
        size: 10,
        font: helv,
        color: COLOR_MUTED,
      });
      cursorY -= 18;
      continue;
    }

    for (const b of day.blocks) {
      // card row
      const topicLines = wrapLines(
        sanitize(b.topic || "Estudo livre"),
        helv,
        10.5,
        blockTextW,
      );
      const noteLines = b.note
        ? wrapLines(sanitize(b.note), helv, 9.5, blockTextW)
        : [];
      const rowHeight =
        12 + topicLines.length * 13 + noteLines.length * 12 + 8;
      ensureSpace(rowHeight + 4);

      // fundo card
      page.drawRectangle({
        x: MARGIN_X,
        y: cursorY - rowHeight + 4,
        width: PAGE_W - 2 * MARGIN_X,
        height: rowHeight,
        color: COLOR_CARD,
      });

      const timeStr = `${b.startTime} — ${b.endTime}`;
      page.drawText(timeStr, {
        x: MARGIN_X + 10,
        y: cursorY - 6,
        size: 10.5,
        font: helvBold,
        color: COLOR_PRIMARY,
      });

      // tópico (linha 1+) — começa abaixo da hora se houver mais de uma linha
      const topicX = MARGIN_X + 90;
      let lineY = cursorY - 6;
      for (let i = 0; i < topicLines.length; i++) {
        page.drawText(topicLines[i], {
          x: topicX,
          y: lineY,
          size: 10.5,
          font: helvBold,
          color: COLOR_INK,
        });
        lineY -= 13;
      }
      for (let i = 0; i < noteLines.length; i++) {
        page.drawText(noteLines[i], {
          x: topicX,
          y: lineY - 2,
          size: 9.5,
          font: helv,
          color: COLOR_MUTED,
        });
        lineY -= 12;
      }

      cursorY -= rowHeight + 6;
    }

    cursorY -= 4;
  }

  drawFooter(page, helv);

  return await pdf.save();
}
