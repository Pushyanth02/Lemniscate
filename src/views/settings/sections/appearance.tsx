import { usePrefs, useShallow, toast } from "../../../lib/store";
import { cx } from "../../../lib/utils";
import { Panel } from "../../../components/ui";
import { APP_ACCENTS } from "../constants";

/* Appearance: app accent picker + the theme note. */
export function AppearanceSection() {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
          App accent
        </h2>
        <p className="text-xs text-mist-500 mb-5 leading-relaxed">
          One pigment retints the whole room — buttons, badges, progress and
          focus rings across the dashboard, library and reader. Gilt is the
          house color; every other chair in the register stays just as
          quiet.
        </p>
        <div
          className="flex flex-wrap gap-3"
          role="radiogroup"
          aria-label="App accent color"
        >
          {APP_ACCENTS.map((a) => {
            const active = prefs.accent === a.id;
            return (
              <button
                key={a.id}
                role="radio"
                aria-checked={active}
                title={a.label}
                aria-label={a.label}
                onClick={() => {
                  setPrefs({ accent: a.id });
                  toast(
                    "success",
                    `Accent set to ${a.label.toLowerCase()}.`,
                  );
                }}
                className={cx(
                  "group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all press",
                  active
                    ? "border-mist-100 bg-ink-800 shadow-[0_0_0_3px_var(--acc-soft)]"
                    : "border-ink-700 hover:border-ink-600 hover:bg-ink-800/60",
                )}
              >
                <span
                  className={cx(
                    "w-9 h-9 rounded-full border-2 transition-transform",
                    active
                      ? "scale-110 shadow-[0_0_12px_var(--acc-glow)]"
                      : "group-hover:scale-105",
                  )}
                  style={{
                    background: a.color,
                    borderColor: active
                      ? "var(--color-mist-100)"
                      : "transparent",
                  }}
                />
                <span
                  className={cx(
                    "text-[11px] font-body font-medium",
                    active ? "text-mist-100" : "text-mist-400",
                  )}
                >
                  {a.label}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">Theme</h2>
        <p className="text-sm text-mist-500 leading-relaxed">
          Utility views keep the Cloth &amp; Gilt treatment. The reader
          carries its own independent themes, Cloth, Vellum and
          Parchment, set inside the reader or under Typography
          defaults.
        </p>
      </Panel>
    </>
  );
}
