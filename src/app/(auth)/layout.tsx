import Link from "next/link";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[900px] opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.45), transparent 70%)",
        }}
      />
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-8">
        {children}
      </main>
    </div>
  );
}
