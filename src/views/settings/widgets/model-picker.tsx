import { useCallback, useEffect, useState } from "react";
import {
  CaretDown,
  CheckCircle,
  CircleNotch,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { usePrefs, useShallow, toast } from "../../../lib/store";
import {
  activeModelFor,
  fetchModelsWithMeta,
  ROUTER_PRESETS,
} from "../../../lib/ai";
import {
  PROVIDERS,
  PROVIDER_LIST,
  hasKey,
  type ProviderId,
} from "../../../lib/providers";
import type { AiModelInfo, BotId } from "../../../lib/types";
import { cx, timeAgo } from "../../../lib/utils";
import { Badge, Button } from "../../../components/ui";

/* ---------------- AI: companion router (provider pin + model) ---------------- */

export function ModelPicker({ bot }: { bot: BotId }) {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );
  // The provider this companion actually routes through: its pin when one
  // is set, else the global active provider. The catalog, the current model
  // and the presets below all reflect THIS provider, so the picker can never
  // describe a provider the companion doesn't use.
  const pinned = prefs.aiProviderByBot[bot] ?? null;
  const provider = pinned ?? prefs.provider;
  const meta = PROVIDERS[provider];

  const [models, setModels] = useState<AiModelInfo[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [staleCatalog, setStaleCatalog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetchModelsWithMeta(force, provider);
        setModels(res.models);
        setFetchedAt(res.fetchedAt);
        setStaleCatalog(res.stale);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn’t load the catalog.");
      } finally {
        setLoading(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    // Auto-load at most once per (open, provider): `!err` in the guard
    // stops the effect re-firing after a failed load (models stays null on
    // failure, which would otherwise re-trigger load in an infinite loop —
    // the Retry button re-enters deliberately).
    if (open && !models && !loading && !err) void load();
  }, [open, models, loading, err, load]);

  // A provider switch (pin changed, or the global active provider moved)
  // resets the catalog state so the picker refetches for the new provider
  // instead of showing the old provider's list under a new label.
  useEffect(() => {
    setModels(null);
    setFetchedAt(null);
    setStaleCatalog(false);
    setErr(null);
  }, [provider]);

  const current = prefs.aiModelsByProvider[provider]?.[bot] ?? null;
  const setBotModel = (id: string | undefined) => {
    setPrefs({
      aiModelsByProvider: {
        ...prefs.aiModelsByProvider,
        [provider]: {
          ...prefs.aiModelsByProvider[provider],
          [bot]: id,
        },
      },
    });
  };

  const setPin = (id: string) => {
    const next = { ...prefs.aiProviderByBot };
    if (id) next[bot] = id as ProviderId;
    else delete next[bot];
    setPrefs({ aiProviderByBot: next });
    toast(
      "success",
      id
        ? `${botMeta[bot].label} pinned to ${PROVIDERS[id as ProviderId].label} — it routes there first.`
        : `${botMeta[bot].label} follows the active provider again.`,
    );
  };

  const filtered = (models ?? [])
    .filter((m) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        m.id.toLowerCase().includes(needle) ||
        m.name.toLowerCase().includes(needle)
      );
    })
    .slice(0, 40);

  const botMeta: Record<BotId, { label: string; hint: string; tone: string }> =
    {
      luma: {
        label: "Luma · conversation",
        hint: "fast responses, medium answers",
        tone: "text-gold-400",
      },
      ouro: {
        label: "Ouro · study",
        hint: "structured academic output",
        tone: "text-ouro-400",
      },
      ankaa: {
        label: "Ankaa · long-form",
        hint: "large context + long completions help",
        tone: "text-ankaa-400",
      },
    };
  const accentTone = botMeta[bot].tone;

  return (
    <div className="hairline rounded-xl bg-ink-875 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-800/60 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block text-[11px] font-body font-medium",
              accentTone,
            )}
          >
            {botMeta[bot].label}
          </span>
          <span
            className={cx(
              "block text-sm mt-1 truncate font-mono",
              current ? "text-gold-300" : "text-mist-400",
            )}
          >
            {pinned && hasKey(pinned) && (
              <span className="text-ouro-400">{meta.label} · </span>
            )}
            {current
              ? ROUTER_PRESETS.find((p) => p.id === current)
                ? `${ROUTER_PRESETS.find((p) => p.id === current)!.label} · ${current}`
                : current
              : `${activeModelFor(bot)} (default)`}
            {pinned && !hasKey(pinned) && (
              <span className="text-mist-600">{` (pin awaiting a ${meta.label} key)`}</span>
            )}
          </span>
        </span>
        <CaretDown
          className={cx(
            "w-4 h-4 text-mist-500 transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-ink-700 pt-3">
          {/* ─── provider pin ─── */}
          <div className="mb-3">
            <span className="block text-xs font-body font-medium text-mist-500 mb-2">
              Route via
            </span>
            <div className="flex gap-2">
              <select
                value={pinned ?? ""}
                onChange={(e) => setPin(e.target.value)}
                aria-label={`Provider preference for ${bot}`}
                className="flex-1 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-mist-100 focus:border-gold-600 focus:shadow-[0_0_0_3px_var(--acc-soft)] outline-none transition-all"
              >
                <option value="">
                  Active provider · {PROVIDERS[prefs.provider].label}
                </option>
                {PROVIDER_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {hasKey(p.id) ? "" : " · no key this session"}
                  </option>
                ))}
              </select>
              {pinned && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setPin("")}
                  className="shrink-0"
                >
                  Unpin
                </Button>
              )}
            </div>
            <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
              Pinned companions route through their provider first. With
              failover on, Meridian still tries your other keyed providers
              when the pinned one errors.
            </p>
          </div>

          <div className="relative mb-2.5">
            <MagnifyingGlass className="w-3.5 h-3.5 text-mist-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${models?.length.toLocaleString() ?? ""} models…`}
              aria-label={`Search models for ${bot}`}
              className="w-full rounded-lg border border-ink-600 bg-ink-850 pl-9 pr-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-600 focus:shadow-[0_0_0_3px_var(--acc-soft)] outline-none transition-all"
            />
          </div>
          {loading && (
            <p className="text-xs text-mist-500 flex items-center gap-2 py-3">
              <CircleNotch className="w-3.5 h-3.5 animate-spin text-gold-400" />
              Fetching the {meta.label} catalog…
            </p>
          )}
          {err && (
            <div className="py-2">
              <p className="text-xs text-danger-400">{err}</p>
              <Button
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => void load(true)}
              >
                Retry
              </Button>
            </div>
          )}
          {!loading && !err && (
            <>
              <ul
                className="max-h-56 overflow-y-auto space-y-1 pr-1"
                role="listbox"
                aria-label={`Models for ${bot}`}
                style={{ scrollbarWidth: "thin" }}
              >
                {current && (
                  <li>
                    <button
                      onClick={() => {
                        setBotModel(undefined);
                        setOpen(false);
                        toast(
                          "success",
                          `${botMeta[bot].label} back on its default model.`,
                        );
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-mist-400 hover:bg-ink-750 hover:text-gold-300 transition-colors"
                    >
                      ↩ Use default ({activeModelFor(bot)})
                    </button>
                  </li>
                )}
                {provider === "openrouter" &&
                  ROUTER_PRESETS.map((p) => {
                    const selected = current === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setBotModel(p.id);
                            setOpen(false);
                            toast(
                              "success",
                              `${botMeta[bot].label} now uses the ${p.label.toLowerCase()}, resolved live from the free catalog.`,
                            );
                          }}
                          className={cx(
                            "w-full text-left px-3 py-2 rounded-lg transition-all",
                            selected
                              ? "bg-gold-500/10 border border-gold-700/50"
                              : "hover:bg-ink-750 border border-transparent",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-[13px] text-mist-200">
                              {p.label}
                            </span>
                            <Badge tone="gold">router</Badge>
                            {selected && (
                              <CheckCircle className="w-3.5 h-3.5 text-gold-400 ml-auto shrink-0" />
                            )}
                          </span>
                          <span className="block text-[10px] text-mist-600 mt-1 leading-relaxed">
                            {p.hint} · {p.id}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                {filtered.map((m) => {
                  const selected = current === m.id;
                  // Evidence-based pricing tier. Legacy cached catalogs (pre
                  // tier field) fall back to the free flag / pricing numbers.
                  const tier =
                    m.tier ??
                    (m.free
                      ? "tier"
                      : m.inPerM || m.outPerM
                        ? "paid"
                        : "unknown") as
                    | "free"
                    | "tier"
                    | "paid"
                    | "unknown";
                  return (
                    <li key={m.id}>
                      <button
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setBotModel(m.id);
                          setOpen(false);
                          toast(
                            "success",
                            `${botMeta[bot].label} now uses ${m.id}.`,
                          );
                        }}
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg transition-all",
                          selected
                            ? "bg-gold-500/10 border border-gold-700/50"
                            : "hover:bg-ink-750 border border-transparent",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] text-mist-200 truncate">
                            {m.name}
                          </span>
                          {tier === "free" && <Badge tone="ok">free</Badge>}
                          {tier === "tier" && (
                            <Badge tone="ok">free tier</Badge>
                          )}
                          {selected && (
                            <CheckCircle className="w-3.5 h-3.5 text-gold-400 ml-auto shrink-0" />
                          )}
                        </span>
                        <span className="block text-[10px] text-mist-600 font-mono truncate mt-1">
                          {m.id} · {(m.context / 1000).toFixed(0)}k ctx ·{" "}
                          {tier === "free"
                            ? "free"
                            : tier === "tier"
                              ? "curated free tier"
                              : tier === "paid"
                                ? `$${m.inPerM.toFixed(2)}/$${m.outPerM.toFixed(2)} per M`
                                : "pricing unknown"}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-3 py-3 text-xs text-mist-500">
                    No models match “{q}”.
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <p className="text-[10px] text-mist-600">
                  {fetchedAt ? (
                    <>
                      Catalog updated {timeAgo(fetchedAt)}
                      {staleCatalog ? " · may be stale" : ""}
                    </>
                  ) : (
                    botMeta[bot].hint + " · fallback chain stays active"
                  )}
                </p>
                <button
                  onClick={() => void load(true)}
                  className="text-[11px] font-body font-medium text-gold-400 hover:text-gold-300 transition-colors"
                >
                  Refresh catalog
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
