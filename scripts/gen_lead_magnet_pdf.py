#!/usr/bin/env python3
"""
Gera o PDF do lead magnet: "Guia de Revisão da Semana de Prova".
Output: /Users/gilbertoluporini/lumio/public/guia-revisao-prova.pdf

Design: tipografia limpa, paleta violet/branco/preto, sem stock photos.
Texto NEUTRO pra qualquer curso (admin, direito, engenharia, medicina).
"""

import os
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Paleta Lumio (oklch(0.52 0.22 280) ≈ #7c3aed ish; ajustado pra impressão amigável)
VIOLET = HexColor("#6d28d9")
VIOLET_LIGHT = HexColor("#a78bfa")
VIOLET_DARK = HexColor("#4c1d95")
INK = HexColor("#0f0f17")
MUTED = HexColor("#52525b")
SOFT = HexColor("#f4f4f5")
BORDER = HexColor("#e4e4e7")

PAGE_W, PAGE_H = A4  # 595.27 x 841.89

# Fonts: usa Helvetica builtin (sem fallback fancy pra evitar dependência)
FONT_REG = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_OBL = "Helvetica-Oblique"


def draw_header(c, page_num, total):
    """Top bar com wordmark + pager."""
    c.setFillColor(VIOLET)
    c.setFont(FONT_BOLD, 11)
    c.drawString(20 * mm, PAGE_H - 15 * mm, "Lumio")
    c.setFillColor(MUTED)
    c.setFont(FONT_REG, 8)
    c.drawRightString(
        PAGE_W - 20 * mm,
        PAGE_H - 15 * mm,
        f"Guia de Revisão · {page_num}/{total}",
    )
    # thin rule
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(20 * mm, PAGE_H - 18 * mm, PAGE_W - 20 * mm, PAGE_H - 18 * mm)


def draw_footer(c):
    c.setFillColor(MUTED)
    c.setFont(FONT_REG, 7.5)
    c.drawString(20 * mm, 12 * mm, "lumioapp.net")
    c.drawRightString(PAGE_W - 20 * mm, 12 * mm, "© Lumio · Transcrição de aulas + IA")


def wrap_text(text, font, size, max_width):
    """Quebra texto em linhas que cabem em max_width."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        candidate = (cur + " " + w).strip()
        if stringWidth(candidate, font, size) <= max_width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_paragraph(c, text, x, y, font, size, color, max_width, leading=None):
    """Desenha parágrafo wrapped. Retorna y final (linha baseline da última)."""
    if leading is None:
        leading = size * 1.5
    c.setFont(font, size)
    c.setFillColor(color)
    lines = wrap_text(text, font, size, max_width)
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
    return y - (len(lines) - 1) * leading


# -------------------------- PAGE 1: COVER --------------------------

def page_cover(c):
    # Background gradient simulado com bandas
    c.setFillColor(HexColor("#faf5ff"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # banda violet topo
    c.setFillColor(VIOLET)
    c.rect(0, PAGE_H - 110 * mm, PAGE_W, 110 * mm, fill=1, stroke=0)

    # accent oblíquo (triângulo)
    c.setFillColor(VIOLET_DARK)
    p = c.beginPath()
    p.moveTo(0, PAGE_H - 110 * mm)
    p.lineTo(PAGE_W, PAGE_H - 110 * mm)
    p.lineTo(PAGE_W, PAGE_H - 95 * mm)
    p.lineTo(0, PAGE_H - 130 * mm)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

    # Wordmark
    c.setFillColor(white)
    c.setFont(FONT_BOLD, 14)
    c.drawString(20 * mm, PAGE_H - 22 * mm, "Lumio")
    c.setFont(FONT_REG, 8.5)
    c.setFillColor(HexColor("#e9d5ff"))
    c.drawString(20 * mm, PAGE_H - 28 * mm, "Transcrição de aulas + IA")

    # Eyebrow
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(HexColor("#ddd6fe"))
    c.drawString(20 * mm, PAGE_H - 60 * mm, "GUIA GRATUITO · 4 PÁGINAS")

    # Título
    c.setFillColor(white)
    c.setFont(FONT_BOLD, 30)
    # Multi-linha manual pro display
    c.drawString(20 * mm, PAGE_H - 80 * mm, "Guia de Revisão")
    c.drawString(20 * mm, PAGE_H - 92 * mm, "da Semana de Prova")
    c.setFont(FONT_BOLD, 30)
    c.setFillColor(HexColor("#c4b5fd"))
    c.drawString(20 * mm, PAGE_H - 104 * mm, "— em 3 passos")

    # Subtítulo
    c.setFont(FONT_REG, 12.5)
    c.setFillColor(INK)
    sub_y = PAGE_H - 135 * mm
    sub_lines = wrap_text(
        "Como organizar 4 horas de aula em 40 minutos de estudo focado, "
        "sem reler PDF e sem decorar slide.",
        FONT_REG,
        12.5,
        PAGE_W - 40 * mm,
    )
    for i, ln in enumerate(sub_lines):
        c.drawString(20 * mm, sub_y - i * 17, ln)

    # Card com os 3 passos
    card_x = 20 * mm
    card_y = 70 * mm
    card_w = PAGE_W - 40 * mm
    card_h = 70 * mm
    c.setFillColor(white)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.roundRect(card_x, card_y, card_w, card_h, 6 * mm, fill=1, stroke=1)

    c.setFont(FONT_BOLD, 9)
    c.setFillColor(VIOLET)
    c.drawString(card_x + 10 * mm, card_y + card_h - 12 * mm, "O QUE VOCÊ VAI APRENDER")

    steps = [
        ("01", "Transcreva sem anotar", "atenção plena na aula"),
        ("02", "Resumo + Flashcards", "vence a curva do esquecimento"),
        ("03", "Quiz pré-prova", "ativa a memória de longo prazo"),
    ]
    for i, (n, t, d) in enumerate(steps):
        sy = card_y + card_h - 25 * mm - i * 13 * mm
        c.setFont(FONT_BOLD, 13)
        c.setFillColor(VIOLET)
        c.drawString(card_x + 10 * mm, sy, n)
        c.setFont(FONT_BOLD, 11)
        c.setFillColor(INK)
        c.drawString(card_x + 22 * mm, sy, t)
        c.setFont(FONT_REG, 10)
        c.setFillColor(MUTED)
        c.drawString(card_x + 22 * mm, sy - 5 * mm, d)

    # Footer cover
    c.setFillColor(MUTED)
    c.setFont(FONT_REG, 8)
    c.drawString(20 * mm, 20 * mm, "Versão 2026 · Material gratuito · lumioapp.net")


# -------------------------- INNER PAGES --------------------------

def draw_step_header(c, num, title, subtitle):
    """Header padronizado das páginas internas."""
    # eyebrow
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(VIOLET)
    c.drawString(20 * mm, PAGE_H - 35 * mm, f"PASSO {num} DE 3")

    # title
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 26)
    c.drawString(20 * mm, PAGE_H - 48 * mm, title)

    # subtitle wrapped
    c.setFont(FONT_REG, 12)
    c.setFillColor(MUTED)
    lines = wrap_text(subtitle, FONT_REG, 12, PAGE_W - 40 * mm)
    for i, ln in enumerate(lines):
        c.drawString(20 * mm, PAGE_H - 58 * mm - i * 15, ln)

    return PAGE_H - 58 * mm - len(lines) * 15 - 10 * mm  # y onde começa conteúdo


def draw_bullet(c, x, y, text, body_text=None, max_width=None):
    """Bullet com ponto violet + texto. Retorna y final."""
    c.setFillColor(VIOLET)
    c.circle(x + 1.5 * mm, y + 1.5 * mm, 1.2 * mm, fill=1, stroke=0)

    c.setFont(FONT_BOLD, 11)
    c.setFillColor(INK)
    c.drawString(x + 6 * mm, y, text)
    new_y = y

    if body_text:
        new_y = y - 6 * mm
        new_y = draw_paragraph(
            c,
            body_text,
            x + 6 * mm,
            new_y,
            FONT_REG,
            10.5,
            MUTED,
            (max_width or (PAGE_W - 40 * mm)) - 6 * mm,
            leading=14,
        )
    return new_y


def draw_evidence_box(c, y, label, text):
    """Caixa de 'evidência científica' destacada."""
    x = 20 * mm
    w = PAGE_W - 40 * mm
    # calcula altura por wrapping
    body_lines = wrap_text(text, FONT_REG, 10, w - 12 * mm)
    h = 15 * mm + (len(body_lines) - 1) * 13

    c.setFillColor(HexColor("#f5f3ff"))
    c.setStrokeColor(VIOLET_LIGHT)
    c.setLineWidth(0.5)
    c.roundRect(x, y - h, w, h, 4 * mm, fill=1, stroke=1)

    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(VIOLET_DARK)
    c.drawString(x + 6 * mm, y - 7 * mm, label.upper())

    c.setFont(FONT_REG, 10)
    c.setFillColor(INK)
    for i, ln in enumerate(body_lines):
        c.drawString(x + 6 * mm, y - 13 * mm - i * 13, ln)

    return y - h - 4 * mm


# -------------------------- PAGE 2: STEP 1 --------------------------

def page_step1(c):
    draw_header(c, 2, 4)
    y = draw_step_header(
        c,
        "01",
        "Transcreva sem anotar",
        "Sua mão fica ocupada copiando — sua cabeça fica fora da aula. "
        "Inverta a ordem: grave primeiro, organize depois.",
    )

    # corpo
    y -= 4 * mm
    y = draw_paragraph(
        c,
        "Anotar à mão durante a aula te tira do contexto. Você fica decidindo o que "
        "escrever, perde a próxima frase e, quando volta, o professor já está em outro slide. "
        "Resultado: caderno cheio, cabeça vazia.",
        20 * mm,
        y,
        FONT_REG,
        11.5,
        INK,
        PAGE_W - 40 * mm,
        leading=17,
    )
    y -= 10 * mm

    y = draw_paragraph(
        c,
        "Com a IA, você grava, presta atenção no professor e depois recebe a "
        "transcrição limpa, com pontuação e tópicos. Sua função na aula vira "
        "uma só: entender.",
        20 * mm,
        y,
        FONT_REG,
        11.5,
        INK,
        PAGE_W - 40 * mm,
        leading=17,
    )
    y -= 14 * mm

    # bullets de "como fazer"
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(INK)
    c.drawString(20 * mm, y, "Como aplicar essa semana")
    y -= 8 * mm

    bullets = [
        (
            "Antes da aula",
            "Abra o app, escolha a matéria e aperte gravar. "
            "Deixe rodando — não precisa olhar.",
        ),
        (
            "Durante a aula",
            "Foque no raciocínio do professor. Se o ponto for crítico, "
            "revise depois pelo timestamp.",
        ),
        (
            "Depois da aula",
            "Em 10 minutos você tem a transcrição. "
            "Use como insumo para gerar resumo e flashcards.",
        ),
    ]
    for t, body in bullets:
        y = draw_bullet(c, 20 * mm, y, t, body)
        y -= 8 * mm

    y -= 4 * mm
    y = draw_evidence_box(
        c,
        y,
        "Princípio",
        "Atenção dividida reduz retenção. Manter a mente em modo de "
        "compreensão pura durante a aula preserva o processamento profundo: "
        "você lembra do conceito, não só da frase escrita.",
    )

    draw_footer(c)


# -------------------------- PAGE 3: STEP 2 --------------------------

def page_step2(c):
    draw_header(c, 3, 4)
    y = draw_step_header(
        c,
        "02",
        "Resumo + Flashcards vencem o esquecimento",
        "Em 24h, você esquece boa parte do que ouviu. A IA gera o material "
        "que segura essa curva — você só precisa revisar nos intervalos certos.",
    )

    y -= 6 * mm

    # 2 colunas: resumo / flashcards
    col_w = (PAGE_W - 40 * mm - 6 * mm) / 2

    # col 1
    c1_x = 20 * mm
    # col 2
    c2_x = 20 * mm + col_w + 6 * mm

    for cx, label, points in [
        (
            c1_x,
            "Resumo",
            [
                "Bom para leitura passiva, recap rápido",
                "Use no dia seguinte e na véspera da prova",
                "Sem decoreba — só para ativar memória",
            ],
        ),
        (
            c2_x,
            "Flashcards",
            [
                "Pergunta + resposta, estilo Anki",
                "Algoritmo decide quando você revisa cada um",
                "5 min/dia viram ganho composto até a prova",
            ],
        ),
    ]:
        c.setFillColor(SOFT)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.4)
        c.roundRect(cx, y - 50 * mm, col_w, 50 * mm, 4 * mm, fill=1, stroke=1)
        c.setFont(FONT_BOLD, 11.5)
        c.setFillColor(VIOLET)
        c.drawString(cx + 6 * mm, y - 9 * mm, label.upper())
        c.setFont(FONT_REG, 9.5)
        c.setFillColor(INK)
        for i, p in enumerate(points):
            yy = y - 17 * mm - i * 11 * mm
            # ponto
            c.setFillColor(VIOLET_LIGHT)
            c.circle(cx + 7 * mm, yy + 1.5 * mm, 1 * mm, fill=1, stroke=0)
            c.setFillColor(INK)
            lines = wrap_text(p, FONT_REG, 9.5, col_w - 14 * mm)
            for j, ln in enumerate(lines):
                c.drawString(cx + 11 * mm, yy - j * 11, ln)

    y -= 56 * mm

    y = draw_evidence_box(
        c,
        y,
        "Evidência · Ebbinghaus & spaced repetition",
        "Revisões em 1d, 3d, 7d e 14d mantêm a memória ativa com menos "
        "tempo total de estudo. A curva do esquecimento de Ebbinghaus (1885) "
        "e os estudos de Cepeda et al. (2006) indicam que revisar o mesmo "
        "conteúdo em intervalos crescentes melhora a retenção sem aumentar "
        "o tempo total de estudo.",
    )

    y -= 2 * mm
    y = draw_paragraph(
        c,
        "Não precisa montar planilha. O app organiza os intervalos sozinho — "
        "você só abre e responde os cards que ele mostra no dia.",
        20 * mm,
        y,
        FONT_REG,
        10.5,
        MUTED,
        PAGE_W - 40 * mm,
        leading=15,
    )

    draw_footer(c)


# -------------------------- PAGE 4: STEP 3 + CTA --------------------------

def page_step3(c):
    draw_header(c, 4, 4)
    y = draw_step_header(
        c,
        "03",
        "Quiz pré-prova",
        "O último passo é o mais importante e o mais ignorado: "
        "se forçar a lembrar antes da prova, não só a reler.",
    )

    y -= 4 * mm
    y = draw_paragraph(
        c,
        "Active recall é a prática de tentar lembrar do conteúdo "
        "sem olhar a fonte. Releitura sente bem (familiaridade), mas não fixa. "
        "Quiz dói um pouco — e é essa dificuldade que ativa a consolidação na memória.",
        20 * mm,
        y,
        FONT_REG,
        11.5,
        INK,
        PAGE_W - 40 * mm,
        leading=17,
    )
    y -= 10 * mm

    c.setFont(FONT_BOLD, 12)
    c.setFillColor(INK)
    c.drawString(20 * mm, y, "Como usar nos 3 dias antes da prova")
    y -= 8 * mm

    bullets = [
        ("D-3", "Gere um quiz e responda sem consultar."),
        ("D-2", "Refaça os erros e releia o trecho."),
        ("D-1", "Quiz misto e durma 7h+."),
    ]
    for t, body in bullets:
        y = draw_bullet(c, 20 * mm, y, t, body)
        y -= 6 * mm

    # CTA box
    y -= 6 * mm
    cta_h = 36 * mm
    c.setFillColor(VIOLET_DARK)
    c.roundRect(20 * mm, y - cta_h, PAGE_W - 40 * mm, cta_h, 5 * mm, fill=1, stroke=0)

    c.setFont(FONT_BOLD, 14)
    c.setFillColor(white)
    c.drawString(28 * mm, y - 11 * mm, "Comece grátis em lumioapp.net")

    c.setFont(FONT_REG, 10.5)
    c.setFillColor(HexColor("#e9d5ff"))
    cta_lines = wrap_text(
        "50 coins de boas-vindas + 50 bônus para quem baixou este guia. Sem cartão.",
        FONT_REG,
        10.5,
        PAGE_W - 40 * mm - 16 * mm - 38 * mm,
    )
    for i, ln in enumerate(cta_lines):
        c.drawString(28 * mm, y - 19 * mm - i * 13, ln)

    # tag pill
    pill_w = 32 * mm
    pill_x = PAGE_W - 20 * mm - 8 * mm - pill_w
    pill_y = y - cta_h / 2 - 4 * mm
    c.setFillColor(white)
    c.roundRect(pill_x, pill_y, pill_w, 8 * mm, 4 * mm, fill=1, stroke=0)
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(VIOLET_DARK)
    c.drawCentredString(pill_x + pill_w / 2, pill_y + 2.5 * mm, "100 COINS · BÔNUS")

    draw_footer(c)


# -------------------------- MAIN --------------------------

def main():
    out = "/Users/gilbertoluporini/lumio/public/guia-revisao-prova.pdf"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle("Guia de Revisão da Semana de Prova — Lumio")
    c.setAuthor("Lumio")
    c.setSubject("Guia gratuito · 3 passos pra revisar antes da prova")
    c.setKeywords("estudo, revisão, prova, flashcards, IA, transcrição, universidade")

    page_cover(c)
    c.showPage()
    page_step1(c)
    c.showPage()
    page_step2(c)
    c.showPage()
    page_step3(c)
    c.showPage()

    c.save()
    print(f"OK: {out}")


if __name__ == "__main__":
    main()
