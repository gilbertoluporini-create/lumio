import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  formatPublishedDate,
  getAllSlugs,
  getPost,
} from "@/lib/blog";
import { buildPageMetadata, ogImage, SITE_URL } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) {
    return buildPageMetadata({
      title: "Post não encontrado · Lumio",
      description: "Esse post não existe (ou foi movido). Volta pro blog.",
      path: `/blog/${slug}`,
      noindex: true,
    });
  }

  const ogImageUrl = ogImage({
    title: post.title,
    subtitle: post.description,
    type: "blog",
  });

  return buildPageMetadata({
    title: `${post.title} · Lumio`,
    description: post.description,
    path: `/blog/${post.slug}`,
    ogTitle: post.title,
    ogDescription: post.description,
    ogType: "article",
    publishedTime: post.publishedAt,
    tags: post.tags,
    ogImageUrl,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const ogImageUrl = ogImage({
    title: post.title,
    subtitle: post.description,
    type: "blog",
  });

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    image: [ogImageUrl],
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      "@type": "Organization",
      name: "Equipe Lumio",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Lumio",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/og-image.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    inLanguage: "pt-BR",
    keywords: post.tags.join(", "),
  };

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* JSON-LD Article */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="gradient" size="sm">
              <Link href="/signup">Comece grátis</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-24">
        {/* Voltar */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para o blog
        </Link>

        {/* Header do post */}
        <header className="mb-10">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
            <time dateTime={post.publishedAt}>
              {formatPublishedDate(post.publishedAt)}
            </time>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readingMinutes} min de leitura
            </span>
            {post.tags.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            Por <span className="font-medium text-foreground">Equipe Lumio</span>
          </p>
        </header>

        {/* Conteúdo */}
        <article className="prose prose-neutral dark:prose-invert prose-headings:tracking-tight prose-headings:font-semibold prose-h1:text-4xl prose-h1:sm:text-5xl prose-h1:mb-6 prose-h2:mt-12 prose-h2:mb-4 prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-table:my-6 prose-th:bg-secondary prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-blockquote:border-l-primary max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </article>

        {/* CTA final */}
        <aside className="mt-16 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            Curtiu o post? Vai gostar do Lumio.
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Transcreve sua aula em pt-BR, organiza por matéria, responde dúvidas
            sobre o que o professor falou. Primeira semana sem cartão.
          </p>
          <Button asChild variant="gradient" size="lg">
            <Link href="/signup">
              Experimente grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </aside>

        {/* Voltar */}
        <div className="mt-12 pt-8 border-t border-border/40">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Ver todos os posts
          </Link>
        </div>
      </main>
    </div>
  );
}
