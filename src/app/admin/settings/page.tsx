"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type AppConfig = {
  coin_costs: {
    summary: number;
    flashcards: number;
    quiz: number;
    mindmap: number;
  };
  welcome_bonus: number;
  signups_enabled: boolean;
  banner: {
    enabled: boolean;
    text: string;
  };
};

const DEFAULTS: AppConfig = {
  coin_costs: {
    summary: 10,
    flashcards: 8,
    quiz: 8,
    mindmap: 6,
  },
  welcome_bonus: 100,
  signups_enabled: true,
  banner: { enabled: false, text: "" },
};

const STORAGE_KEY = "lumio.admin.settings";

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setConfig({ ...DEFAULTS, ...(JSON.parse(stored) as Partial<AppConfig>) });
      }
    } catch (err) {
      console.warn("[admin/settings] localStorage parse failed", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function updateCoin(key: keyof AppConfig["coin_costs"], value: number) {
    setConfig((c) => ({
      ...c,
      coin_costs: { ...c.coin_costs, [key]: value },
    }));
  }

  function save() {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      toast.success("Configuração salva localmente.");
    } catch (err) {
      toast.error("Falha ao salvar.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!confirm("Resetar pros valores padrão?")) return;
    setConfig(DEFAULTS);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Resetado.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Tweaks globais da aplicação. Mudanças ficam salvas no browser por
            enquanto — sincronização com DB em breve.
          </p>
        </div>
      </div>

      {!loaded ? (
        <div className="py-20 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-500" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Coin costs */}
          <Section title="Custo das gerações (coins)" subtitle="Custo cobrado por geração de produto AI.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                ["summary", "flashcards", "quiz", "mindmap"] as const
              ).map((k) => (
                <div key={k} className="space-y-1">
                  <label className="text-xs font-mono text-neutral-400 capitalize">
                    {k}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={config.coin_costs[k]}
                    onChange={(e) =>
                      updateCoin(k, Number(e.target.value) || 0)
                    }
                    className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 text-sm font-mono px-3"
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-neutral-500 font-mono inline-flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              <span>
                Pricing oficial vive em <code>src/lib/coins-pricing.ts</code> — esses
                valores aqui são apenas pra preview futuro.
              </span>
            </p>
          </Section>

          {/* Welcome bonus */}
          <Section title="Bônus de boas-vindas" subtitle="Coins entregues a novos cadastros.">
            <input
              type="number"
              min={0}
              max={10000}
              value={config.welcome_bonus}
              onChange={(e) =>
                update("welcome_bonus", Number(e.target.value) || 0)
              }
              className="w-32 h-9 rounded-md bg-neutral-900 border border-neutral-800 text-sm font-mono px-3"
            />
          </Section>

          {/* Signups */}
          <Section title="Cadastros" subtitle="Desabilite em modo manutenção.">
            <label className="inline-flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.signups_enabled}
                onChange={(e) => update("signups_enabled", e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
              <span className="text-sm">
                Permitir novos cadastros (
                <code className="font-mono text-xs">{config.signups_enabled ? "ON" : "OFF"}</code>
                )
              </span>
            </label>
          </Section>

          {/* Banner */}
          <Section
            title="Banner global"
            subtitle="Mostra um aviso no topo do app pra todos os usuários."
          >
            <div className="space-y-3">
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.banner.enabled}
                  onChange={(e) =>
                    update("banner", {
                      ...config.banner,
                      enabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-indigo-500"
                />
                <span className="text-sm">Banner habilitado</span>
              </label>
              <textarea
                value={config.banner.text}
                onChange={(e) =>
                  update("banner", { ...config.banner, text: e.target.value })
                }
                placeholder="Texto do aviso (ex: Manutenção programada amanhã às 22h)"
                rows={3}
                className="w-full rounded-md bg-neutral-900 border border-neutral-800 text-sm p-3 resize-y"
                disabled={!config.banner.enabled}
              />
            </div>
          </Section>

          {/* Save bar */}
          <div className="sticky bottom-4 flex items-center justify-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-3">
            <button
              onClick={reset}
              className="text-xs font-mono text-neutral-400 hover:text-neutral-200 px-3 py-1.5"
            >
              Resetar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-mono px-3 py-1.5"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}
