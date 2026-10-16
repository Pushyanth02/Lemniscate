import { usePrefs, useShallow, UI_SCALES } from "../../../lib/store";
import { cx } from "../../../lib/utils";
import { Panel, Slider, Toggle } from "../../../components/ui";

/* The sanctioned interface-scale steps, labelled for the control. Kept in
   step with UI_SCALES in the store — the sanitizer coerces anything else. */
const SCALE_LABELS: Record<number, string> = {
  0.9: "90%",
  1: "100%",
  1.1: "110%",
  1.25: "125%",
  1.5: "150%",
};

/* Accessibility in two panels: the room's interface itself (scale, target
   size, link visibility — the things that make the app usable at any size
   or input), then the reading experience (contrast, motion, focus, keys). */
export function AccessSection() {
  const { prefs, setPrefs, setReader } = usePrefs(
    useShallow((s) => ({
      prefs: s.prefs,
      setPrefs: s.setPrefs,
      setReader: s.setReader,
    })),
  );
  const rs = prefs.reader;

  return (
    <>
      <Panel className="p-5 sm:p-6 space-y-1.5">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1">
          Interface &amp; size
        </h2>
        <p className="text-xs text-mist-500 mb-4 leading-relaxed">
          Scales the whole room — text, spacing, art — like browser zoom,
          on top of the reader&rsquo;s own typography settings.
        </p>
        <div className="py-2">
          <span className="block text-sm text-mist-200 mb-2" id="uiscale-label">
            Interface scale
          </span>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby="uiscale-label"
          >
            {UI_SCALES.map((s) => (
              <button
                key={s}
                onClick={() => setPrefs({ uiScale: s })}
                aria-pressed={prefs.uiScale === s}
                className={cx(
                  "px-3.5 py-2 rounded-lg border text-xs font-body font-medium transition-all press",
                  prefs.uiScale === s
                    ? "border-gold-600 text-gold-300 bg-gold-500/10"
                    : "border-ink-600 text-mist-400 hover:border-ink-500",
                )}
              >
                {SCALE_LABELS[s] ?? `${Math.round(s * 100)}%`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mist-600 leading-relaxed">
            Reader text size itself is set under Typography.
          </p>
        </div>
        <Toggle
          label="Larger touch targets"
          hint="Guarantees 44px controls on every device, not just touchscreens."
          checked={prefs.touchTargets === "large"}
          onChange={(v) => setPrefs({ touchTargets: v ? "large" : "default" })}
        />
        <Toggle
          label="Underline links"
          hint="Every link carries a visible underline, never colour alone."
          checked={prefs.underlineLinks}
          onChange={(v) => setPrefs({ underlineLinks: v })}
        />
      </Panel>

      <Panel className="p-5 sm:p-6 space-y-1.5">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-4">
          Reading &amp; motion
        </h2>
        <div className="py-2">
          <span className="block text-sm text-mist-200 mb-2">
            Reader contrast
          </span>
          <div className="flex gap-2">
            {(["normal", "high"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setReader({ contrast: c })}
                aria-pressed={rs.contrast === c}
                className={cx(
                  "px-3.5 py-2 rounded-lg border text-xs font-body font-medium transition-all press",
                  rs.contrast === c
                    ? "border-gold-600 text-gold-300 bg-gold-500/10"
                    : "border-ink-600 text-mist-400 hover:border-ink-500",
                )}
              >
                {c === "normal" ? "Normal" : "High"}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Reduced motion"
          hint="Disables decorative animation app-wide; functional changes stay visible."
          checked={!rs.motion}
          onChange={(v) => setReader({ motion: !v })}
        />
        {rs.motion && (
          <Slider
            label="Animation speed"
            value={rs.animSpeed}
            min={0.5}
            max={1.5}
            step={0.1}
            unit="×"
            onChange={(v) => setReader({ animSpeed: v })}
          />
        )}
        <Toggle
          label="Strong focus rings"
          hint="Thicker outlines for keyboard navigation."
          checked={prefs.ring === "strong"}
          onChange={(v) => setPrefs({ ring: v ? "strong" : "normal" })}
        />
        <Toggle
          label="Keyboard hints"
          hint="Shortcut affordances inside the reader."
          checked={rs.kbdHints}
          onChange={(v) => setReader({ kbdHints: v })}
        />
      </Panel>
    </>
  );
}
