import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard: server-side. Defense in depth — também checa role no DB.
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

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role, email, name")
    .eq("id", user.id)
    .single();

  const profile = profileData as
    | { role: "user" | "admin"; email: string; name: string | null }
    | null;

  // Fallback: lista de emails autorizados via env (segurança em camadas)
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isEnvAdmin =
    !!user.email && adminEmails.includes(user.email.toLowerCase());

  if (profile?.role !== "admin" && !isEnvAdmin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
