/**
 * POST /api/admin/marketing/content/generate-image-prompt
 *
 * Gera um PROMPT TEXTUAL completo pronto pra colar em ChatGPT/Gemini/Claude
 * e gerar a imagem manualmente lá. NÃO chama OpenAI Image API.
 *
 * Estratégia: founder prefere usar sua assinatura ChatGPT Plus / Claude Max
 * (que já tem imagem) em vez de pagar gpt-image-1 por chamada. Resultado:
 *  - Custo $0 por geração (vs $0.20 em gpt-image-1)
 *  - Fidelidade do Lumi 100% (founder controla o modelo)
 *  - 1 prompt = 3 imagens (1:1, 16:9, 9:16) — founder gera as 3 separadas
 *
 * Body: { draft_id, scene_description }
 * Resp: { prompts: { ratio_1x1, ratio_landscape, ratio_portrait } }
 *
 * O prompt embute:
 *  - Brand anchor (identidade Lumi)
 *  - Cena específica do post
 *  - Aspect ratio sugerido
 *  - Negative prompt no fim
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND_MASTER = `
========== LUMIO BRAND IDENTITY ==========

Premium 3D editorial render for an education tech brand called Lumio. Style: clean, technological, educational, welcoming. Mix of landing page + edtech app + 3D mascot branding + editorial minimalism. Sophisticated design with plenty of breathing space.

LUMI MASCOT (exact appearance):
- Small cute friendly 3D desk lamp character
- Rounded dome/bell-shaped lamp head in warm cream color (#fff8e7)
- Soft purple/lilac glow inside the bulb
- Two big, rounded, symmetric purple eyes — well-aligned, friendly, with small white highlights
- Tiny discreet smile
- Articulated metallic neck (brown/copper/gray with rounded circular joints)
- Rounded cream base with small purple button on top
- NO logo or text on the lamp base
- Chibi proportions but PREMIUM and CLEAN
- NO exaggerated/feminine eyelashes
- NO human arms (only the articulated lamp arm)

VISUAL STYLE:
- Premium 3D render, soft premium plastic/paper material texture
- NOT clay/plasticine ("massinha") texture
- Soft studio lighting, gentle shadows
- Modern, welcoming, trustworthy
- LOTS of breathing room — never crowded

OFFICIAL PALETTE:
- Deep purple: #21113f / #25114a
- Lumio purple: #7c3aed
- Fuchsia/magenta: #c026d3
- Light lavender bg: #f3ecff / #efe7ff
- Cream: #fff8e7 / #f7edd8
- White card: #ffffff
- Yellow accent: #f5c542
- Discrete success green: #22c55e
- Red ONLY for "recording/live" tiny dots

3D PROPS (when relevant):
Purple/magenta/cream books, open notebook with cream pages, purple/cream microphone, summary cards with rounded corners, flashcards with lamp/brain/star icons, weekly calendar, purple coins with star symbol, purple/gold treasure chest, audio/transcript/quiz/PDF icons, 4-point stars (few, well-distributed), soft arrows, white rounded cards with light shadow.

COMPOSITION:
- Safe margin: 64px equivalent
- Lumi position: right, lower-right, or center-bottom
- ONE Lumi per image (never duplicate)
- Plenty of empty negative space for text overlay later

TEXT POLICY:
Generate the image WITH NO TEXT — leave empty space for text overlay later (Figma/Canva). This avoids misspelling in pt-BR.

STRICT FORBIDS:
bad typography, misspelled text, gibberish, fake words, distorted letters, unreadable text, extra logos, watermark, random brand names, duplicated mascot, extra eyes, crossed eyes, asymmetric eyes, feminine eyelashes, overly girly style, childish baby-toy style, claymation, rough plasticine, messy composition, crowded layout, low resolution, blurry, dark muddy colors, harsh shadows, uncanny face, human body, human arms, extra limbs, scary expression, generic robot, unrelated character, random UI, wrong website, fake app screenshots, text on mascot base.
`.trim();

const RATIO_HINTS: Record<string, string> = {
  ratio_1x1:
    "ASPECT RATIO: square 1:1 (Instagram feed, Facebook Page, LinkedIn).",
  ratio_landscape:
    "ASPECT RATIO: landscape 16:9 (X/Twitter timeline, LinkedIn banner-like, blog header).",
  ratio_portrait:
    "ASPECT RATIO: portrait 9:16 (Instagram Stories, TikTok thumbnail, Reels cover).",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.scene_description) {
    return NextResponse.json(
      { error: "scene_description obrigatório" },
      { status: 400 },
    );
  }

  const scene = String(body.scene_description).slice(0, 4000);

  const prompts: Record<string, string> = {};
  for (const [ratio, hint] of Object.entries(RATIO_HINTS)) {
    prompts[ratio] = [
      `SCENE TO GENERATE: ${scene}`,
      "",
      hint,
      "",
      BRAND_MASTER,
      "",
      "Generate ONE high-quality image following all the brand rules above.",
    ].join("\n");
  }

  return NextResponse.json({ prompts });
}
