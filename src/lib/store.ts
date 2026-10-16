import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Prefs, ReaderSettings, View, BotId } from "./types";
import type { ProviderId } from "./providers";
import { isAccentId } from "./accents";
import { uid } from "./utils";

const PREFS_KEY = "lemniscate:prefs";

/* Literal mirror of the ProviderId union (./providers). Kept inline so this
   module never takes a runtime import on ./providers — that module imports
   this one for the active-provider read, and a runtime cycle at store init
   would hit a TDZ. Type-only imports are unaffected. */
const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  "openrouter",
  "gemini",
  "xai",
  "groq",
  "mistral",
  "cerebras",
]);

const emptyModelsByProvider = (): Record<
  ProviderId,
  Partial<Record<BotId, string>>
> => ({
  openrouter: {},
  gemini: {},
  xai: {},
  groq: {},
  mistral: {},
  cerebras: {},
});

export { emptyModelsByProvider };

export const defaultReader: ReaderSettings = {
  fontFamily: "literata",
  fontSize: 18,
  lineHeight: 1.7,
  letterSpacing: 0,
  width: 68,
  theme: "dark",
  focusMode: false,
  accent: "gold",
  contrast: "normal",
  motion: true,
  animSpeed: 1,
  kbdHints: true,
};

export const defaultPrefs: Prefs = {
  reader: defaultReader,
  accent: "gold",
  maxUploadMB: 25,
  provider: "openrouter",
  aiModelsByProvider: emptyModelsByProvider(),
  aiProviderByBot: {},
  aiFailover: true,
  dailyQuota: 120,
  ring: "normal",
  uiScale: 1,
  touchTargets: "default",
  underlineLinks: false,
  seeded: false,
  aiRefine: true,
  aiRefineConsent: "ask",
  profile: { name: "", color: "gold" },
};

const VALID_READER_FONTS = new Set<string>([
  "literata", "garamond", "spectral", "sourceserif", "georgia", "bookerly", "baskerville", "palatino",
]);

/** Known paid model slugs that users may have saved from an earlier version
 *  of the app. Each maps to its free-tier equivalent. This migration runs
 *  on every prefs load so stored paid models are transparently converted. */
const PAID_TO_FREE: Record<string, string> = {
  "qwen/qwen-2.5-7b-instruct": "qwen/qwen-2.5-7b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct": "meta-llama/llama-3.1-8b-instruct:free",
  "mistralai/mistral-7b-instruct": "mistralai/mistral-7b-instruct:free",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini:free",
  "anthropic/claude-3-haiku": "meta-llama/llama-3.3-70b-instruct:free", // deprecated → free fallback
};

function migrateToFree(aiModels: Partial<Record<BotId, string>>): Partial<Record<BotId, string>> {
  const out: Partial<Record<BotId, string>> = {};
  for (const [bot, id] of Object.entries(aiModels)) {
    if (!id || typeof id !== "string") continue;
    // Router presets (meridian/*, openrouter/auto) pass through unchanged.
    if (id.startsWith("meridian/") || id === "openrouter/auto") { out[bot as BotId] = id; continue; }
    // Already free — pass through.
    if (id.endsWith(":free")) { out[bot as BotId] = id; continue; }
    // Known paid slug → free variant.
    if (PAID_TO_FREE[id]) { out[bot as BotId] = PAID_TO_FREE[id]; continue; }
    // Unknown paid model → append :free (OpenRouter convention).
    out[bot as BotId] = id.includes(":") ? id.replace(/:.*$/, ":free") : `${id}:free`;
  }
  return out;
}

/** Keep only sane string entries from a possibly-corrupt blob. */
function sanitizeBotModels(raw: unknown): Partial<Record<BotId, string>> {
  const out: Partial<Record<BotId, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [bot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || !id) continue;
    out[bot as BotId] = id;
  }
  return out;
}

/** Migrate the per-provider model map. The legacy flat `aiModels` shape
 *  (pre multi-provider) is absorbed into the OpenRouter slot — it can only
 *  ever have held OpenRouter ids — and runs through migrateToFree as before.
 *  Explicit `aiModelsByProvider.openrouter` entries win over the legacy blob
 *  so this migration is idempotent: after one persist, `aiModels` is gone. */
function migrateModelsByProvider(
  raw: unknown,
): Record<ProviderId, Partial<Record<BotId, string>>> {
  const out = emptyModelsByProvider();
  const byProvider =
    (raw as { aiModelsByProvider?: Record<string, unknown> } | null)
      ?.aiModelsByProvider;
  if (byProvider && typeof byProvider === "object") {
    for (const [prov, bots] of Object.entries(byProvider)) {
      if (!VALID_PROVIDERS.has(prov)) continue;
      out[prov as ProviderId] = sanitizeBotModels(bots);
    }
  }
  const legacy = (raw as { aiModels?: Record<string, unknown> } | null)?.aiModels;
  if (legacy && typeof legacy === "object") {
    out.openrouter = {
      ...migrateToFree(sanitizeBotModels(legacy)),
      ...out.openrouter,
    };
  }
  // migrateToFree keeps running for the OpenRouter slot on every load —
  // the `:free` suffix is an OpenRouter-only convention, so direct-provider
  // entries pass through untouched.
  out.openrouter = migrateToFree(out.openrouter);
  return out;
}

const VALID_BOTS: ReadonlySet<string> = new Set(["luma", "ouro", "ankaa"]);

/** Sanctioned interface-scale steps (Settings → Accessibility). The zoom
 * control renders exactly these; a stored value outside the set (hand-edited
 * or from a future schema) coerces back to 1. */
export const UI_SCALES: readonly number[] = [0.9, 1, 1.1, 1.25, 1.5];

/** Keep only sane (bot → valid provider) entries from a possibly-corrupt
 *  blob. Per-companion provider pins survive only when both sides are real. */
function sanitizeProviderByBot(raw: unknown): Partial<Record<BotId, ProviderId>> {
  const out: Partial<Record<BotId, ProviderId>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [bot, prov] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_BOTS.has(bot)) continue;
    if (typeof prov !== "string" || !VALID_PROVIDERS.has(prov)) continue;
    out[bot as BotId] = prov as ProviderId;
  }
  return out;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return sanitizePrefs(JSON.parse(raw));
  } catch { /* corrupted prefs fall back to defaults */ }
  return defaultPrefs;
}

/** Turn any blob (localStorage read, restored backup, hand-edited JSON)
 *  into a fully-valid Prefs: defaults fill the gaps, every known-tricky
 *  field is coerced back into its sanctioned range, and legacy shapes are
 *  migrated. Shared by loadPrefs and the backup-restore path so a restored
 *  room can never inject an unsanitized preference. */
export function sanitizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object") return defaultPrefs;
  const p = raw as Partial<Prefs>;
  const merged: Prefs = {
    ...defaultPrefs,
    ...p,
    reader: { ...defaultReader, ...(p.reader ?? {}) },
    profile: { ...defaultPrefs.profile, ...(p.profile ?? {}) },
    aiModelsByProvider: migrateModelsByProvider(p),
  };
  // migrate readers whose saved face was retired (Verdana / Open Sans)
  if (!VALID_READER_FONTS.has(merged.reader.fontFamily)) {
    merged.reader.fontFamily = "literata";
  }
  // harden the provider field against hand-edited storage
  if (!VALID_PROVIDERS.has(merged.provider)) merged.provider = "openrouter";
  // accent ids: only catalog members survive a hand edit
  if (!isAccentId(merged.accent)) merged.accent = "gold";
  if (!isAccentId(merged.reader.accent)) merged.reader.accent = "gold";
  // per-companion provider pins: valid bots and providers only
  merged.aiProviderByBot = sanitizeProviderByBot(merged.aiProviderByBot);
  // failover flag: coerce anything that isn't false to the safe default
  merged.aiFailover = merged.aiFailover !== false;
  // refine-consent: only the three known states survive a hand edit
  if (merged.aiRefineConsent !== "granted" && merged.aiRefineConsent !== "declined") {
    merged.aiRefineConsent = "ask";
  }
  // re-clamp the import ceiling: a hand-edited value must not override
  // the 5–100 MB range the Settings slider enforces
  merged.maxUploadMB = Math.min(
    100,
    Math.max(5, Math.round(Number(merged.maxUploadMB) || 25)),
  );
  // interface scale: only the five sanctioned steps survive a hand edit
  if (!UI_SCALES.includes(Number(merged.uiScale))) merged.uiScale = 1;
  // touch-target mode: coerce anything that isn't "large" to default
  if (merged.touchTargets !== "large") merged.touchTargets = "default";
  // link underlining is a pure boolean
  merged.underlineLinks = merged.underlineLinks === true;
  // the legacy flat shape is fully absorbed — never re-persist it
  delete (merged as { aiModels?: unknown }).aiModels;
  return merged;
}

function persist(prefs: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage full — non-fatal */ }
}

interface PrefsState {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  setReader: (patch: Partial<ReaderSettings>) => void;
  resetPrefs: () => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  prefs: loadPrefs(),
  setPrefs: (patch) =>
    set((s) => {
      const prefs = { ...s.prefs, ...patch };
      persist(prefs);
      return { prefs };
    }),
  setReader: (patch) =>
    set((s) => {
      const prefs = { ...s.prefs, reader: { ...s.prefs.reader, ...patch } };
      persist(prefs);
      return { prefs };
    }),
  resetPrefs: () =>
    set(() => {
      persist(defaultPrefs);
      return { prefs: defaultPrefs };
    }),
}));

/** Selective accessor: subscribe to the entire prefs object.
 *  Use `usePrefs(s => s.prefs.X)` for single-field subscriptions to avoid
 *  re-rendering on unrelated prefs changes. */
export function getPrefs(): Prefs {
  return usePrefs.getState().prefs;
}

/* ---------------- navigation ---------------- */

/* URL-backed navigation (static-export friendly hash routing).
 *
 * Stable app state lives in the URL so reloads, deep links and the
 * browser's Back/Forward behave predictably:
 *     #/                 landing
 *     #/dashboard  #/library  #/upload  #/create  #/analytics  #/history
 *     #/settings            (Settings, last section)
 *     #/settings/storage    (Settings, specific section)
 *     #/legal  #/legal/privacy
 *     #/reader/{docId}     (the reader, one document)
 *
 * Transient UI state (drawers, dialogs, focus mode, a file staged for
 * upload, selection) stays OUT of the URL — it never pollutes history.
 * Credentials and document content are never URL-encoded; the reader is
 * addressed by its short opaque id only.
 *
 * `go` pushes one history entry per navigation; `back` uses the browser's
 * own history (popstate applies the previous state) and falls back to the
 * dashboard when there is no app state behind us. Unknown views and
 * malformed hashes fall back to the landing view; a reader hash without a
 * document id falls back to the library. A reader hash whose document no
 * longer exists is handled by the reader's honest "not in your library"
 * state (with a way back to the library). */

interface NavEntry { view: View; docId: string | null }

interface NavState {
  view: View;
  docId: string | null;
  sub: string | null;
  stack: NavEntry[];
  /** A file selected on the Landing page, handed off to the Upload view
   *  for immediate processing. Cleared once the Upload view consumes it. */
  pendingFile: File | null;
  go: (view: View, opts?: { docId?: string | null; sub?: string | null }) => void;
  openDoc: (id: string) => void;
  back: () => void;
  setPendingFile: (file: File | null) => void;
}

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  "landing",
  "dashboard",
  "library",
  "upload",
  "reader",
  "settings",
  "account",
  "analytics",
  "history",
  "create",
  "legal",
]);

/** Sections of Settings (sub values) that are addressable in the URL. */
const SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  "profile",
  "appearance",
  "typography",
  "access",
  "ai",
  "storage",
  "about",
]);

export interface UrlNav {
  view: View;
  docId: string | null;
  sub: string | null;
}

/** Parse a location hash into a validated navigation state. Pure — used by
 *  the store, the popstate listener, and tests. */
export function parseNavHash(hash: string): UrlNav {
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean
    .split("/")
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    })
    .filter((p) => p.length > 0);
  const rawView = parts[0] ?? "";
  const rawArg = parts[1] ?? "";
  const rest = parts.slice(2);

  if (!rawView || !KNOWN_VIEWS.has(rawView)) {
    return { view: "landing", docId: null, sub: null };
  }
  let view = rawView as View;
  let sub: string | null = null;
  let docId: string | null = null;

  if (view === "reader") {
    if (!rawArg) return { view: "library", docId: null, sub: null };
    docId = rawArg;
  } else if (view === "settings" || view === "account") {
    // "account" is a legacy alias of Settings → Profile section.
    if (view === "account") view = "settings";
    if (rawArg && SETTINGS_SECTIONS.has(rawArg)) sub = rawArg;
  } else if (view === "legal") {
    if (rawArg === "privacy" || rawArg === "terms") sub = rawArg;
  } else if (rawArg) {
    // Arguments on views that take none (e.g. #/dashboard/x) — drop them.
  }
  void rest;
  return { view, docId, sub };
}

/** Serialize a navigation state to its canonical hash. */
export function navHashFor(nav: UrlNav): string {
  if (nav.view === "reader" && nav.docId) {
    return `#/reader/${encodeURIComponent(nav.docId)}`;
  }
  if ((nav.view === "settings" || nav.view === "legal") && nav.sub) {
    return `#/${nav.view}/${encodeURIComponent(nav.sub)}`;
  }
  return `#/${nav.view}`;
}

function hashForState(view: View, docId: string | null, sub: string | null): string {
  return navHashFor({ view, docId, sub });
}

/** Initial state: the URL wins when it carries a valid app address, so a
 *  refresh or shared deep link restores the same place. */
function initialNav(): UrlNav {
  if (typeof window === "undefined" || typeof location === "undefined") {
    return { view: "landing", docId: null, sub: null };
  }
  return parseNavHash(location.hash);
}

const initial = initialNav();

export const useNav = create<NavState>((set, get) => ({
  view: initial.view,
  docId: initial.docId,
  sub: initial.sub,
  stack: [],
  pendingFile: null,
  go: (view, opts) => {
    const s = get();
    const next = {
      view,
      docId:
        opts?.docId !== undefined ? opts.docId : view === "reader" ? s.docId : null,
      sub: opts?.sub ?? null,
    };
    set({
      stack: [...s.stack.slice(-24), { view: s.view, docId: s.docId }],
      ...next,
    });
    // One history entry per navigation — but never a duplicate of the
    // address we are already on (repeat clicks must not pile entries).
    if (typeof history !== "undefined") {
      const target = hashForState(next.view, next.docId, next.sub);
      if (location.hash !== target && `#${location.hash.slice(1)}` !== target) {
        try {
          history.pushState({ lem: true }, "", target);
        } catch {
          /* file:// or exotic origins — the store still navigates */
        }
      }
    }
  },
  openDoc: (id) => get().go("reader", { docId: id }),
  back: () => {
    const s = get();
    const prev = s.stack[s.stack.length - 1];
    if (typeof history !== "undefined") {
      // Prefer the browser's own history: popstate will apply the previous
      // app address (every go() pushed one entry).
      if (prev) {
        history.back();
        return;
      }
      // No in-app history (e.g. a deep link landed straight in the reader):
      // fall back to the dashboard, matching the classic behaviour.
      set({ stack: [], view: "dashboard", docId: null, sub: null });
      try {
        history.pushState({ lem: true }, "", "#/dashboard");
      } catch {
        /* ignore */
      }
      return;
    }
    set(
      prev
        ? { stack: s.stack.slice(0, -1), view: prev.view, docId: prev.docId, sub: null }
        : { stack: [], view: "dashboard", docId: null, sub: null },
    );
  },
  setPendingFile: (file) => set({ pendingFile: file }),
}));

/* Browser Back/Forward drive the store: apply whatever the URL now says,
   without pushing new history. Guarded for non-browser environments. */
if (typeof window !== "undefined" && typeof addEventListener === "function") {
  addEventListener("popstate", () => {
    const nav = parseNavHash(location.hash);
    useNav.setState({
      view: nav.view,
      docId: nav.docId,
      sub: nav.sub,
      pendingFile: null,
    });
  });
}

/* ---------------- toasts ---------------- */

export interface ToastItem {
  id: string;
  kind: "success" | "error" | "info";
  msg: string;
}

interface ToastState {
  list: ToastItem[];
  push: (kind: ToastItem["kind"], msg: string) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  list: [],
  push: (kind, msg) => {
    const id = uid("toast");
    set((s) => ({ list: [...s.list.slice(-3), { id, kind, msg }] }));
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));

export const toast = (kind: ToastItem["kind"], msg: string): void => useToasts.getState().push(kind, msg);

// Re-export useShallow for components that need multi-field subscriptions
// without re-rendering on every store change.
export { useShallow };
