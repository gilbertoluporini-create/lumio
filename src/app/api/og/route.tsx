/* eslint-disable @next/next/no-img-element */
/**
 * Dynamic OG image generator — /api/og
 *
 * Gera PNG 1200x630 a partir de query params, com identidade Lumio:
 *   lavender bg, dot grid, palavra-chave em violet, sparkles, mascote Lumi,
 *   footer LUMIOAPP.NET.
 *
 * Query params:
 *   - title    string  Headline principal (obrigatório; fallback se ausente)
 *   - subtitle string  Sub-line opcional
 *   - persona  string  medicina | direito | administracao | engenharia | psicologia
 *                      (futuro: muda mascote; hoje usa default)
 *   - type     string  blog | landing | persona  (muda eyebrow + layout)
 *
 * Cache: immutable, s-maxage=31536000 (fingerprint via querystring).
 *
 * Usado por openGraph.images e twitter.images em generateMetadata().
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

// Lavender + violet (combina com --primary do design system)
const COLORS = {
  bg: "#F5F1FF", // lavender bg
  bgEnd: "#EDE5FF",
  fg: "#1A1024",
  muted: "#6B5B8A",
  accent: "#6D3FE3", // violet primário
  accentSoft: "#A78BFA",
  border: "#D9CCFA",
};

type LayoutType = "default" | "blog" | "landing" | "persona";

function clampText(value: string | null, max: number): string {
  if (!value) return "";
  const v = value.trim();
  if (v.length <= max) return v;
  return v.slice(0, max - 1).trimEnd() + "…";
}

function resolveLayout(input: string | null): LayoutType {
  switch (input) {
    case "blog":
    case "landing":
    case "persona":
      return input;
    default:
      return "default";
  }
}

function eyebrowFor(type: LayoutType, persona: string | null): string {
  if (type === "blog") return "BLOG · LUMIO";
  if (type === "persona" && persona) {
    return `LUMIO PRA ${persona.replace(/[-_]/g, " ").toUpperCase()}`;
  }
  if (type === "persona") return "LUMIO PRA SEU CURSO";
  if (type === "landing") return "LUMIO · ESTUDE COM IA";
  return "LUMIO";
}

/**
 * Carrega Outfit (bold + regular) direto do Google Fonts em formato TTF.
 * Cacheado pela edge/fetch da Vercel — não recomputa toda request.
 */
async function loadOutfit(weight: number): Promise<ArrayBuffer> {
  // Google Fonts URL stable: family Outfit, weight ${weight}, subset latin
  // Usa o CSS API pra resolver o URL TTF
  const cssUrl = `https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    headers: {
      // Forçar TTF (Google entrega WOFF2 pra user-agents modernos)
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:60.0) Gecko/20100101 Firefox/60.0",
    },
  });
  const css = await cssRes.text();
  const fontUrlMatch = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/);
  if (!fontUrlMatch) {
    throw new Error("Outfit font URL not found in Google Fonts CSS");
  }
  const fontRes = await fetch(fontUrlMatch[1]);
  if (!fontRes.ok) throw new Error("Outfit font fetch failed");
  return await fontRes.arrayBuffer();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rawTitle = searchParams.get("title");
    const rawSubtitle = searchParams.get("subtitle");
    const persona = searchParams.get("persona");
    const type = resolveLayout(searchParams.get("type"));

    const title = clampText(
      rawTitle || "Estude menos. Entenda mais.",
      90,
    );
    const subtitle = clampText(
      rawSubtitle || "Transcrição de aula + IA com contexto. Em pt-BR.",
      140,
    );
    const eyebrow = eyebrowFor(type, persona);

    // Highlight (palavra-chave em violet): pega a última palavra significativa
    // do título. É heurística — funciona pra padrão "X com Y" / "como fazer X".
    const titleWords = title.split(/\s+/);
    const highlightStart = titleWords.length > 3 ? titleWords.length - 2 : titleWords.length - 1;
    const highlight = titleWords.slice(highlightStart).join(" ");
    const titleRest = titleWords.slice(0, highlightStart).join(" ");

    // Carrega Outfit em 2 pesos. Falha silenciosa cai pro fallback sans.
    type FontSpec = {
      name: string;
      data: ArrayBuffer;
      weight: 400 | 800;
      style: "normal";
    };
    let fonts: FontSpec[] = [];
    try {
      const [bold, regular] = await Promise.all([
        loadOutfit(800),
        loadOutfit(500),
      ]);
      fonts = [
        { name: "Outfit", data: bold, weight: 800, style: "normal" },
        { name: "Outfit", data: regular, weight: 400, style: "normal" },
      ];
    } catch {
      fonts = [];
    }

    const dotGrid = `radial-gradient(circle at 1px 1px, ${COLORS.border}55 1px, transparent 0)`;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "72px 80px",
            backgroundColor: COLORS.bg,
            backgroundImage: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.bgEnd} 100%), ${dotGrid}`,
            backgroundSize: "100% 100%, 28px 28px",
            fontFamily: "Outfit, system-ui, sans-serif",
            color: COLORS.fg,
            position: "relative",
          }}
        >
          {/* TOP: eyebrow + sparkle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 22,
              letterSpacing: 4,
              color: COLORS.accent,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 999,
                background: COLORS.accent,
                color: "white",
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              ✦
            </span>
            <span>{eyebrow}</span>
          </div>

          {/* MIDDLE: title + subtitle, mascote à direita */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 40,
              flex: 1,
              marginTop: 32,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: 760,
              }}
            >
              <div
                style={{
                  fontSize: title.length > 60 ? 60 : 76,
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: -1.5,
                  color: COLORS.fg,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0 16px",
                }}
              >
                {titleRest ? <span>{titleRest}</span> : null}
                <span style={{ color: COLORS.accent }}>{highlight}</span>
              </div>

              {subtitle ? (
                <div
                  style={{
                    marginTop: 28,
                    fontSize: 28,
                    lineHeight: 1.35,
                    color: COLORS.muted,
                    fontWeight: 400,
                    maxWidth: 700,
                  }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>

            {/* Mascote — usa URL absoluta pública (next/og aceita <img src=...>) */}
            <img
              src="https://lumioapp.net/illustrations/lumi-default.png"
              alt=""
              width={260}
              height={260}
              style={{
                width: 260,
                height: 260,
                objectFit: "contain",
                marginLeft: "auto",
              }}
            />
          </div>

          {/* BOTTOM: footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 22,
              color: COLORS.muted,
              fontWeight: 500,
              letterSpacing: 2,
              borderTop: `1px solid ${COLORS.border}`,
              paddingTop: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: COLORS.fg,
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: 0,
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: COLORS.accent,
                  color: "white",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                L
              </span>
              <span>Lumio</span>
            </div>
            <div style={{ letterSpacing: 4 }}>LUMIOAPP.NET</div>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: fonts.length > 0 ? fonts : undefined,
        headers: {
          "Cache-Control":
            "public, immutable, no-transform, max-age=31536000, s-maxage=31536000",
          "Content-Type": "image/png",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return new Response(`OG image error: ${message}`, { status: 500 });
  }
}
