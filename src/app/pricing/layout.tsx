import type { Metadata } from "next";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";

const TITLE = "Planos do Lumio · A partir de R$ 39/mês";
const DESCRIPTION =
  "Compare os planos do Lumio: Starter, Pro e Power. Coins pra transcrever aula, gerar resumo e flashcards. Anual com 2 meses grátis.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/pricing",
  ogImageType: "landing",
});

const PRICING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Lumio — assinatura mensal",
  description:
    "Plataforma de transcrição de aula com IA e geração de resumo, flashcards e quiz.",
  brand: { "@type": "Brand", name: "Lumio" },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: "0",
    highPrice: "119",
    offerCount: 4,
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/pricing`,
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSON_LD) }}
      />
      {children}
    </>
  );
}
