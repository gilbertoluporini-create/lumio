import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          // Garantir crawl explícito do OG generator (preview de share)
          "/api/og",
        ],
        disallow: [
          "/api/",
          "/admin",
          "/admin/",
          "/dashboard",
          "/dashboard/",
          "/account",
          "/account/",
          "/checkout",
          "/lumi",
          "/lumi/",
          "/onboarding",
          "/onboarding/",
          "/links",
          "/links/",
          "/signup",
          "/login",
          "/auth/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
