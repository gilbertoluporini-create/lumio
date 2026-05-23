export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check público. Não vaza informação sensível —
 * apenas confirma que o app está vivo + quais integrações estão configuradas.
 */
export async function GET() {
  return Response.json({
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    integrations: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      supabase: !!(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      stripe_webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      resend: !!process.env.RESEND_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
