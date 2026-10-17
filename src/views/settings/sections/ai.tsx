import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  Cpu,
  Eye,
  EyeSlash,
  Key,
  MagicWand,
  Shield,
  Shuffle,
  SignOut,
} from "@phosphor-icons/react";
import { usePrefs, useShallow, toast } from "../../../lib/store";
import {
  aiConfigured,
  autoAssignFreeModels,
  testConnection,
} from "../../../lib/ai";
import {
  PROVIDERS,
  PROVIDER_LIST,
  setSessionKey,
  clearSessionKey,
  hasKey,
  getKeyMasked,
  validateKey,
  type ProviderId,
} from "../../../lib/providers";
import type { BotId } from "../../../lib/types";
import { cx } from "../../../lib/utils";
import { Badge, Button, Panel, Slider, Toggle } from "../../../components/ui";
import { ModelPicker } from "../widgets/model-picker";
import { RateMeter } from "../widgets/rate-meter";

/* AI companions: provider picker, session key entry, Meridian failover,
   the per-companion Models panel, and pacing & quota. Every key/session
   slice of state lives here — no other section reads it. */
export function AiSection() {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );

  const [assigning, setAssigning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  // Refresh `aiConfigured()` reactively — since the key lives in module-level
  // memory (not in the prefs store), we toggle this counter on save / clear
  // so the panel re-reads the live state on the next render.
  const [keyTick, setKeyTick] = useState(0);

  const provider = prefs.provider;
  const meta = PROVIDERS[provider];
  const keyed = PROVIDER_LIST.filter((p) => hasKey(p.id));
  // keyTick is a real dependency here: the key itself lives in module
  // memory outside React's knowledge, so the tick is what makes this
  // re-evaluate after save / clear. The linter cannot see that dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const connected = useMemo(() => aiConfigured(), [keyTick, provider]);

  const switchProvider = (id: ProviderId) => {
    if (id === prefs.provider) return;
    setPrefs({ provider: id });
    toast("success", `Provider set to ${PROVIDERS[id].label}.`);
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testConnection();
      toast(res.ok ? "success" : "error", res.message);
    } finally {
      setTesting(false);
    }
  };

  const commitKey = async () => {
    const k = keyInput.trim();
    if (!k) {
      toast("error", `Paste your ${meta.label} key first.`);
      return;
    }
    setTesting(true);
    try {
      const res = await validateKey(provider, k);
      if (!res.ok) {
        toast("error", res.message);
        return;
      }
      setSessionKey(provider, k);
      setKeyInput("");
      setShowKey(false);
      setKeyTick((n) => n + 1);
      toast("success", `${meta.label} key set for this session.`);
    } finally {
      setTesting(false);
    }
  };

  const forgetKey = () => {
    clearSessionKey(provider);
    setKeyInput("");
    setKeyTick((n) => n + 1);
    toast("info", `${meta.label} key cleared from memory.`);
  };

  const autoAssign = async () => {
    setAssigning(true);
    try {
      const res = await autoAssignFreeModels();
      if (!res) {
        toast(
          "error",
          `No free models were visible on ${meta.label}; set your key, then retry.`,
        );
        return;
      }
      setPrefs({
        aiModelsByProvider: {
          ...prefs.aiModelsByProvider,
          [provider]: { ...prefs.aiModelsByProvider[provider], ...res },
        },
      });
      toast(
        "success",
        `Router assigned · Luma: ${res.luma.split("/").pop()} · Ouro: ${res.ouro.split("/").pop()} · Ankaa: ${res.ankaa.split("/").pop()}`,
      );
    } catch (e) {
      toast(
        "error",
        e instanceof Error ? e.message : "Couldn't reach the model catalog.",
      );
    } finally {
      setAssigning(false);
    }
  };

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <Key className="w-4 h-4 text-gold-400" />
          <h2 className="font-display text-xl font-medium text-mist-100">AI provider</h2>
          <Badge tone={connected ? "ok" : "muted"} className="ml-auto">
            {connected ? `${meta.label} · key set` : `${meta.label} · no key`}
          </Badge>
        </div>
        <p className="text-xs text-mist-500 leading-relaxed mb-4">
          Every provider offers a free tier and speaks the same
          protocol, so companions work unchanged. The browser calls{" "}
          {meta.label} directly; your key lives only in memory for this
          session and is never written to localStorage, IndexedDB or
          prefs. With a key set, Luma, Ouro and Ankaa use live language
          models; without it, every companion still works via grounded
          Anchor engines and every non-AI feature is unchanged.
        </p>

        {/* ─── provider picker ─── */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4"
          role="radiogroup"
          aria-label="AI provider"
        >
          {PROVIDER_LIST.map((p) => {
            const active = provider === p.id;
            const keyed = hasKey(p.id);
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={active}
                onClick={() => switchProvider(p.id)}
                title={p.freeNote}
                className={cx(
                  "group text-left p-3.5 rounded-xl border transition-all press",
                  active
                    ? "border-gold-700/60 bg-gold-500/10 shadow-[0_0_0_3px_var(--acc-soft)]"
                    : "border-ink-700 hover:border-ink-600 hover:bg-ink-800/60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-label={keyed ? "key set" : "no key"}
                    className={cx(
                      "w-2 h-2 rounded-full shrink-0 transition-colors",
                      keyed
                        ? "bg-ok-500 shadow-[0_0_6px_var(--color-ok-500)]"
                        : "bg-mist-600/60",
                    )}
                  />
                  <span
                    className={cx(
                      "text-sm font-display font-medium truncate",
                      active ? "text-mist-100" : "text-mist-300",
                    )}
                  >
                    {p.label}
                  </span>
                  {active && (
                    <Badge tone="gold" className="ml-auto shrink-0">
                      active
                    </Badge>
                  )}
                </span>
                <span className="block text-[11px] text-mist-400 mt-1.5 leading-relaxed">
                  {p.freeNote}
                </span>
              </button>
            );
          })}
        </div>

        {/* ─── live status line ─── */}
        <div className="rounded-lg border border-ink-700 bg-ink-875 px-4 py-3 mb-4 flex items-center gap-3">
          <span
            className={cx(
              "w-2.5 h-2.5 rounded-full shrink-0",
              connected ? "bg-ok-500" : "bg-mist-600",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-mist-200 leading-tight">
              {connected ? (
                <>
                  Session key:{" "}
                  <span className="font-mono text-gold-300">
                    {getKeyMasked(provider) || "••••"}
                  </span>
                </>
              ) : (
                `No ${meta.label} key set; companions run the Anchor engine`
              )}
            </p>
            <p className="text-[11px] text-mist-500 mt-0.5 leading-relaxed">
              {connected
                ? "Companions answer with live models, metered daily. Reload the page to clear the key."
                : `Paste your ${meta.label} key below to enable live companions.`}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={testing}
            onClick={() => void runTest()}
            className="shrink-0"
            disabled={!connected}
          >
            <ArrowsClockwise className="w-3.5 h-3.5" />
            Test
          </Button>
        </div>

        {/* ─── key entry ─── */}
        <div className="rounded-lg border border-ink-700 bg-ink-875 px-4 py-4 mb-4">
          <label className="block text-xs font-body font-medium text-mist-500 mb-2">
            {connected ? "Replace key" : `Paste your ${meta.label} key`}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={meta.keyHint}
                autoComplete="off"
                spellCheck={false}
                aria-label={`${meta.label} API key`}
                className="w-full rounded-lg border border-ink-600 bg-ink-850 pl-3 pr-10 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-600 focus:shadow-[0_0_0_3px_var(--acc-soft)] outline-none transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Hide key" : "Show key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-mist-500 hover:text-gold-300 transition-colors"
              >
                {showKey ? (
                  <EyeSlash className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="gold"
                loading={testing}
                onClick={() => void commitKey()}
                className="shrink-0"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {connected ? "Replace" : "Save & validate"}
              </Button>
              {connected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={forgetKey}
                  className="shrink-0"
                >
                  <SignOut className="w-3.5 h-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-mist-500 mt-2 leading-relaxed">
            Validate probes {meta.label} with a lightweight{" "}
            <code className="text-mist-400 font-mono text-[10px]">
              {provider === "openrouter" ? "GET /key" : "GET /models"}
            </code>
            ; the key is sent only to {meta.label}, never to any other
            server.
          </p>
        </div>

        {/* ─── setup instructions ─── */}
        <details className="mb-2 group">
          <summary className="text-xs font-body font-medium text-gold-400 cursor-pointer hover:text-gold-300 transition-colors list-none flex items-center gap-1.5 select-none">
            <CaretRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
            Where to get a {meta.label} key
          </summary>
          <ol className="mt-3 space-y-2 text-xs text-mist-400 leading-relaxed pl-4">
            <li>
              <span className="text-mist-600 font-mono tabular-nums">
                1.
              </span>{" "}
              Create or sign in to your account at{" "}
              <a
                href={meta.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-400 hover:text-gold-300 underline underline-offset-2 decoration-gold-700/50"
              >
                {new URL(meta.keyUrl).hostname.replace(/^www\./, "")}
              </a>
              .
            </li>
            <li>
              <span className="text-mist-600 font-mono tabular-nums">
                2.
              </span>{" "}
              Open the API keys page and create a new key
              {meta.keyPrefix ? (
                <>
                  {" "}
                  (starts with{" "}
                  <code className="text-mist-300 font-mono text-[11px]">
                    {meta.keyPrefix}…
                  </code>
                  )
                </>
              ) : null}
              .
            </li>
            <li>
              <span className="text-mist-600 font-mono tabular-nums">
                3.
              </span>{" "}
              Paste it above and press{" "}
              <span className="text-mist-300">Save &amp; validate</span>
              .{" "}
              {provider === "openrouter"
                ? "Free models are filtered automatically."
                : "Free-tier models are badged in the catalog below."}
            </li>
          </ol>
          <p className="mt-3 text-[11px] font-mono text-mist-600 leading-relaxed flex items-start gap-1.5">
            <Shield className="w-3 h-3 text-gold-600 shrink-0 mt-0.5" />
            <span>
              The key lives only in memory for this tab; reload the
              page or close the tab to wipe it. Nothing is ever written
              to disk. Keys for other providers stay separate: switch
              providers above and paste that provider's key.
            </span>
          </p>
      </details>

        {/* ─── Meridian routing ─── */}
        <div className="mt-4 pt-4 border-t border-ink-700">
          <Toggle
            label="Cross-provider failover"
            hint={`When ${meta.label} errors, Meridian tries your other keyed providers before the offline Anchor engine takes over.`}
            checked={prefs.aiFailover}
            onChange={(v) => setPrefs({ aiFailover: v })}
          />
          <p className="text-[11px] text-mist-600 mt-2.5 leading-relaxed">
            {keyed.length > 1
              ? `${keyed.length} providers have keys this session (${keyed.map((p) => p.label).join(", ")}). Failover walks them in order and skips any provider that just failed hard — a rejected key is never retried for five minutes.`
              : "Add a key for a second provider to give Meridian somewhere to fail over to. Companions pinned in the Models panel below always route through their pin first."}
          </p>
        </div>
    </Panel>

      <Panel className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <Cpu className="w-4 h-4 text-gold-400" />
          <h2 className="font-display text-xl font-medium text-mist-100">Models</h2>
          <Badge tone="muted" className="ml-auto">
            searchable catalog
          </Badge>
        </div>
        <p className="text-xs text-mist-500 mb-4 leading-relaxed">
          Each companion can use any model on {meta.label}. The catalog
          is fetched live and cached for six hours; every bot also
          keeps an automatic fallback chain. Choices are kept per
          provider, so switching above never leaks a model across.
        </p>
        <div className="hairline rounded-xl bg-linear-to-br from-ink-875 to-ink-850 px-4 py-3.5 mb-4 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gold-500/15 border border-gold-700/40 flex items-center justify-center shrink-0">
            <MagicWand className="w-4 h-4 text-gold-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-display font-medium text-mist-100">
              Universal router
            </p>
            <p className="text-[11px] text-mist-500 leading-relaxed mt-0.5">
              Fetches every free model on {meta.label}, ranks them by
              intelligence and creativity, and assigns the best fit to
              Luma, Ouro and Ankaa in one move.
            </p>
          </div>
          <Button
            size="sm"
            variant="gold"
            loading={assigning}
            onClick={() => void autoAssign()}
            className="shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Auto-assign
          </Button>
        </div>
        <div className="space-y-3">
          {(["luma", "ouro", "ankaa"] as BotId[]).map((bot) => (
            <ModelPicker key={`${provider}:${bot}`} bot={bot} />
          ))}
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-4">
          Pacing & quota
        </h2>
        <RateMeter />
        <div className="mt-5">
          <Slider
            label="Daily quota (online calls)"
            value={prefs.dailyQuota}
            min={20}
            max={400}
            step={10}
            onChange={(v) => setPrefs({ dailyQuota: v })}
          />
          <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
            Requests are rate-limited to 15/minute and queued rather
            than dropped. Usage is metered in Insights → Analytics.
          </p>
        </div>
        <div className="mt-5 pt-4 border-t border-ink-700">
          <Toggle
            label="Refine imports with AI"
            hint="After parsing, an AI pass re-checks chapter numbering (Arabic & Roman), paragraph breaks and dialogue. Deterministic parsing always remains the fallback."
            checked={prefs.aiRefine}
            onChange={(v) => setPrefs({ aiRefine: v })}
          />
        </div>
      </Panel>
    </>
  );
}
