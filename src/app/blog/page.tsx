import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { formatPublishedDate, getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog Lumio — Estudo, IA e faculdade",
  description:
    "Guias e artigos sobre como estudar com IA na faculdade brasileira: transcrição de aula, flashcards SRS, active recall, organização de matéria.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Blog Lumio — Estudo, IA e faculdade",
    description:
      "Guias práticos sobre estudar com IA, transcrição de aula em pt-BR, flashcards SRS e técnicas com respaldo de cognitive science.",
    type: "website",
    url: "/blog",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog Lumio — Estudo, IA e faculdade",
    description:
      "Guias práticos sobre estudar com IA, transcrição de aula em pt-BR e técnicas de estudo.",
  },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <div className="relative min-h-screen overflow-x-clip">
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

      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24">
        {/* Hero */}
        <section className="mb-14">
          <p className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
            Blog Lumio
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-display mb-5">
            Estudo, IA e faculdade.{" "}
            <span className="gradient-text">Sem firula.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Guias práticos sobre como estudar com IA na faculdade brasileira:
            transcrição de aula, flashcards SRS, active recall, organização de
            matéria. Tudo testado, sem hype.
          </p>
        </section>

        {/* Lista de posts */}
        <section className="space-y-6">
          {posts.length === 0 && (
            <p className="text-muted-foreground">
              Em breve, os primeiros posts.
            </p>
          )}

          {posts.map((post) => (
            <article
              key={post.slug}
              className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lumio"
            >
              <Link href={`/blog/${post.slug}`} className="block">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
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
                        {post.tags.slice(0, 3).map((tag) => (
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
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-display mb-2 group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {post.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Ler post
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </article>
          ))}
        </section>

        {/* CTA final */}
        <section className="mt-20 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            Pronto pra transformar sua aula em estudo ativo?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            O Lumio transcreve sua aula em pt-BR, organiza por matéria e
            responde dúvidas sobre o que o professor falou.
          </p>
          <Button asChild variant="gradient" size="lg">
            <Link href="/signup">
              Experimente grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
