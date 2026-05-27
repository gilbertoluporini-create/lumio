#!/usr/bin/env node
/**
 * UTM Builder — gera URLs com UTM pra colar em bios/posts/DM/anúncios.
 *
 * Uso:
 *   node scripts/utm-builder.mjs --canal instagram --campaign launch --content bio
 *   node scripts/utm-builder.mjs --canal tiktok --campaign sprint2 --medium social --export
 *
 * Saída: lista de URLs prontas pros principais pontos de entrada do Lumio
 * (home, /signup, /guia-revisao lead magnet, /pricing, /links bio).
 *
 * Flags:
 *   --canal       (obrigatório) one of: instagram tiktok linkedin twitter youtube email outbound dm referral
 *   --campaign    (obrigatório) tag livre, ex: "launch", "sprint2_carrossel"
 *   --content     (opcional)    variação criativa, ex: "stories_swipe", "bio_main"
 *   --term        (opcional)    keyword (raramente usado em orgânico)
 *   --medium      (opcional)    default depende do canal (bio, social, dm, paid)
 *   --base        (opcional)    base URL, default https://lumioapp.net
 *   --export      (opcional)    imprime CSV separado por vírgula pra planilha
 *   --help        mostra esse help
 *
 * Convenções de medium (baseado em best practices Google Analytics):
 *   - bio          → link nas bios das redes (linktree, IG bio)
 *   - social       → posts orgânicos (carrossel, story, feed)
 *   - dm           → outbound em mensagem direta
 *   - email        → newsletter / outreach 1:1
 *   - cpc          → ads pagos (Google, Bing)
 *   - paid_social  → ads pagos (Meta, TikTok)
 *   - referral     → embaixadores (mas embaixadores usam /?ref=, não UTM)
 */

const CANAL_DEFAULT_MEDIUM = {
  instagram: "bio",
  tiktok: "bio",
  linkedin: "bio",
  twitter: "bio",
  youtube: "bio",
  email: "email",
  outbound: "dm",
  dm: "dm",
  referral: "referral",
};

const ENTRY_POINTS = [
  { label: "Home (landing)", path: "/" },
  { label: "Signup direto", path: "/signup" },
  { label: "Lead Magnet (guia revisão)", path: "/guia-revisao" },
  { label: "Pricing", path: "/pricing" },
  { label: "Blog", path: "/blog" },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key === "export" || key === "help") {
      args[key] = true;
      continue;
    }
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = val;
    i++;
  }
  return args;
}

function printHelp() {
  const help = `
UTM Builder — gera URLs com UTM pra Lumio

Uso:
  node scripts/utm-builder.mjs --canal <canal> --campaign <nome> [opcionais]

Obrigatórios:
  --canal       instagram | tiktok | linkedin | twitter | youtube | email | dm | outbound | referral
  --campaign    nome curto da campanha (ex: launch, sprint2_carrossel)

Opcionais:
  --content     variação criativa (ex: stories_swipe, bio_main)
  --term        keyword (raramente usado em orgânico)
  --medium      sobrescreve o default do canal (bio/social/dm/email/cpc/paid_social)
  --base        base URL (default https://lumioapp.net)
  --export      imprime CSV (label,url) pra planilha
  --help        mostra esse help

Exemplos:
  node scripts/utm-builder.mjs --canal instagram --campaign launch --content bio
  node scripts/utm-builder.mjs --canal tiktok --campaign sprint2 --medium social --content reel_01
  node scripts/utm-builder.mjs --canal email --campaign newsletter_jun --export
`;
  console.log(help);
}

function build() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const canal = (args.canal || "").toLowerCase();
  if (!canal) {
    console.error("Erro: --canal é obrigatório. Use --help pra ver opções.");
    process.exit(1);
  }
  if (!Object.keys(CANAL_DEFAULT_MEDIUM).includes(canal)) {
    console.error(
      `Erro: canal "${canal}" não suportado. Use um destes: ${Object.keys(
        CANAL_DEFAULT_MEDIUM,
      ).join(", ")}`,
    );
    process.exit(1);
  }
  if (!args.campaign) {
    console.error("Erro: --campaign é obrigatório (nome curto da campanha).");
    process.exit(1);
  }

  const base = (args.base || "https://lumioapp.net").replace(/\/$/, "");
  const source = canal;
  const medium = args.medium || CANAL_DEFAULT_MEDIUM[canal];
  const campaign = args.campaign;
  const content = args.content || null;
  const term = args.term || null;

  function withUtm(path) {
    const params = new URLSearchParams();
    params.set("utm_source", source);
    params.set("utm_medium", medium);
    params.set("utm_campaign", campaign);
    if (content) params.set("utm_content", content);
    if (term) params.set("utm_term", term);
    return `${base}${path}?${params.toString()}`;
  }

  // /links já tem auto-UTM próprio via ?c=<canal>. Mostramos a versão simplificada
  // pra colocar na bio (o page resolve o restante do UTM internamente).
  const linksUrl =
    canal in CANAL_DEFAULT_MEDIUM && ["instagram", "tiktok", "linkedin", "twitter", "youtube", "email"].includes(canal)
      ? `${base}/links?c=${canal}`
      : `${base}/links`;

  const urls = [
    ...ENTRY_POINTS.map((e) => ({ label: e.label, url: withUtm(e.path) })),
    { label: "/links (bio auto-UTM)", url: linksUrl },
  ];

  if (args.export) {
    console.log("label,url");
    for (const u of urls) {
      // Escapa vírgulas no label (raríssimo, mas seguro)
      const safeLabel = `"${u.label.replace(/"/g, '""')}"`;
      console.log(`${safeLabel},${u.url}`);
    }
    return;
  }

  console.log("");
  console.log(`UTM Builder — canal=${canal} campaign=${campaign} medium=${medium}${content ? ` content=${content}` : ""}`);
  console.log("=".repeat(80));
  for (const u of urls) {
    console.log(`\n  ${u.label}`);
    console.log(`  ${u.url}`);
  }
  console.log("");
  console.log("Dicas:");
  console.log("  - Pra ads pagos use --medium cpc (Google) ou paid_social (Meta/TikTok)");
  console.log("  - Pra carrossel multi-slide use --content para diferenciar (ex: --content slide_3)");
  console.log("  - O /links já carrega o UTM automaticamente — só passe ?c=<canal>");
  console.log("");
}

build();
