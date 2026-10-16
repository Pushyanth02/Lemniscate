import { usePrefs, useShallow } from "../../../lib/store";
import { cx } from "../../../lib/utils";

/* Reader themes keep their persisted keys (light / dark / sepia); only the
   human-facing names and preview swatches change — the swatches show the
   actual reader-scope backgrounds (presentation only). */
const READER_THEMES: Record<"light" | "dark" | "sepia", { label: string; swatch: string }> = {
  light: { label: "Vellum", swatch: "#f6f3ea" },
  dark: { label: "Cloth", swatch: "#101015" },
  sepia: { label: "Parchment", swatch: "#efe5cd" },
};

export function SegmentedTheme() {
  const { prefs, setReader } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setReader: s.setReader })),
  );
  return (
    <div>
      <span className="block text-xs font-body font-medium text-mist-500 mb-2">
        Default reader theme
      </span>
      <div className="inline-flex rounded-lg border border-ink-600 bg-ink-875 p-0.5 gap-0.5">
        {(["light", "dark", "sepia"] as const).map((t) => {
          const meta = READER_THEMES[t];
          return (
            <button
              key={t}
              onClick={() => setReader({ theme: t })}
              aria-pressed={prefs.reader.theme === t}
              className={cx(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-body font-medium transition-all",
                prefs.reader.theme === t
                  ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
                  : "text-mist-400 hover:text-mist-200 border border-transparent",
              )}
            >
              <span
                aria-hidden
                className="w-3.5 h-3.5 rounded-[4px] border border-ink-600 shrink-0"
                style={{ background: meta.swatch }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
