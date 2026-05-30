import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

// CSP — recurso whitelisted explicitamente.
// pdf.js worker é hospedado local (/pdf.worker.min.mjs) — não precisa de CDN.
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' é necessário pro Next dev + framer-motion inline styles
  // 'unsafe-eval' só em dev (Turbopack / source maps); remover em prod-only build
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://us-assets.i.posthog.com https://us.i.posthog.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // media-src precisa whitelistar o bucket Supabase (tts-audio) pra que o
  // <audio> do voice mode toque. Sem isso, browser bloqueia com MEDIA_ERR_SRC_NOT_SUPPORTED.
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://www.facebook.com https://connect.facebook.net https://us.i.posthog.com https://us-assets.i.posthog.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  // upgrade-insecure-requests só em prod: em dev (http) ele força sub-recursos
  // pra https e quebra o carregamento (CSS/JS), inclusive no WKWebView do app iOS.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  // @ffmpeg-installer/ffmpeg distribui um binário nativo via optional deps
  // por arch (linux-x64 no Vercel). Em Next 16 + Vercel, precisa ficar fora
  // do bundle e o binário precisa ser incluído no output tracing.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    "/api/lectures/[id]/transcribe": [
      "./node_modules/@ffmpeg-installer/**",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=(self)",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
  async redirects() {
    // Atalhos bonitos pras bios (ex: lumioapp.net/ig → /links?c=instagram).
    // Mantêm o tracking de canal da página de links.
    return [
      { source: "/ig", destination: "/links?c=instagram", permanent: false },
      { source: "/tt", destination: "/links?c=tiktok", permanent: false },
      { source: "/in", destination: "/links?c=linkedin", permanent: false },
      { source: "/x", destination: "/links?c=twitter", permanent: false },
    ];
  },
};

export default nextConfig;
