import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminSidebar } from "./_components/admin-sidebar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login?error=admin_unavailable");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  // Whitelist por email (config em src/lib/admin.ts) + fallback de env (defense in depth)
  const envAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed =
    isAdminEmail(user.email) ||
    (!!user.email && envAdmins.includes(user.email.toLowerCase()));

  if (!allowed) {
    redirect("/dashboard");
  }

  return (
    <div className="dark min-h-screen bg-neutral-950 text-neutral-100">
      <div className="flex min-h-screen">
        <AdminSidebar adminEmail={user.email ?? ""} />

        <div className="flex-1 flex flex-col min-w-0 lg:ml-[240px]">
          <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur px-4 lg:px-6">
            <Link
              href="/dashboard"
              className="text-xs text-neutral-400 hover:text-neutral-100 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sair do admin
            </Link>
            <span className="text-neutral-700">·</span>
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 truncate">
              {user.email}
            </span>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
