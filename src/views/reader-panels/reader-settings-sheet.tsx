import {
  ArrowCounterClockwise,
  Coffee,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import {
  Button,
  Segmented,
  Select,
  Sheet,
  Slider,
  Toggle,
} from "../../components/ui";
import { usePrefs, useShallow } from "../../lib/store";
import type { ReaderFontId } from "../../lib/types";
import { ACCENTS } from "../../lib/accents";
import { cx } from "../../lib/utils";

/* ================= Reader settings ================= */

const FONT_OPTIONS: { value: ReaderFontId; label: string }[] = [
  { value: "literata", label: "Literata" },
  { value: "garamond", label: "EB Garamond" },
  { value: "spectral", label: "Spectral" },
  { value: "sourceserif", label: "Source Serif" },
  { value: "georgia", label: "Georgia" },
  { value: "bookerly", label: "Bookerly / Charter" },
  { value: "baskerville", label: "Baskerville" },
  { value: "palatino", label: "Palatino" },
];

export function ReaderSettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { prefs, setReader } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setReader: s.setReader })),
  );
  const rs = prefs.reader;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reader settings"
      side="right"
      width="max-w-sm"
    >
      <div className="p-4 sm:p-5 space-y-6">
        <section>
          <h3 className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-3">
            Theme
          </h3>
          <Segmented
            ariaLabel="Reader theme"
            value={rs.theme}
            onChange={(v) => setReader({ theme: v })}
            options={[
              {
                value: "light",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5" />
                    Paper
                  </span>
                ),
              },
              {
                value: "dark",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5" />
                    Dark
                  </span>
                ),
              },
              {
                value: "sepia",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5" />
                    Sepia
                  </span>
                ),
              },
            ]}
          />
          <p className="text-[11px] text-mist-600 mt-2.5 leading-relaxed">
            Reader themes are independent of the app theme.
          </p>
        </section>

        <section>
          <h3 className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-3">
            Typography
          </h3>
          <Select
            label="Typeface"
            value={rs.fontFamily}
            onChange={(e) =>
              setReader({ fontFamily: e.target.value as ReaderFontId })
            }
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          <div className="mt-3 space-y-1">
            <Slider
              label="Font size"
              value={rs.fontSize}
              min={14}
              max={26}
              step={1}
              unit="px"
              onChange={(v) => setReader({ fontSize: v })}
            />
            <Slider
              label="Line height"
              value={rs.lineHeight}
              min={1.3}
              max={2.2}
              step={0.05}
              onChange={(v) => setReader({ lineHeight: v })}
            />
            <Slider
              label="Letter spacing"
              value={rs.letterSpacing}
              min={0}
              max={25}
              step={1}
              unit={rs.letterSpacing ? ` ${rs.letterSpacing / 100}em` : ""}
              onChange={(v) => setReader({ letterSpacing: v })}
            />
            <Slider
              label="Reading width"
              value={rs.width}
              min={48}
              max={92}
              step={1}
              unit="ch"
              onChange={(v) => setReader({ width: v })}
            />
          </div>
          <div
            className="hairline rounded-xl p-4 mt-3 relative overflow-hidden"
            style={{
              fontFamily: `var(--font-${rs.fontFamily})`,
              fontSize: `${rs.fontSize * 0.82}px`,
              lineHeight: rs.lineHeight,
            }}
          >
            <span className="absolute top-2 right-2 text-[9px] font-body font-medium uppercase tracking-[0.14em] text-mist-600">
              preview
            </span>
            The lamp kept its post, and the threshold became what thresholds are
            secretly for.
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-3">
            Accent
          </h3>
          <div
            className="flex gap-3"
            role="radiogroup"
            aria-label="Accent color"
          >
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={rs.accent === a.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => setReader({ accent: a.id })}
                className={cx(
                  "w-9 h-9 rounded-full border-2 transition-transform press",
                  rs.accent === a.id
                    ? "border-mist-100 scale-110 shadow-[0_0_12px_var(--acc-glow)]"
                    : "border-transparent hover:scale-105",
                )}
                style={{ background: a.color }}
              />
            ))}
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-3">
            Experience
          </h3>
          <Toggle
            label="Focus mode"
            hint="Dim surrounding paragraphs; nothing is hidden."
            checked={rs.focusMode}
            onChange={(v) => setReader({ focusMode: v })}
          />
          <div className="py-2">
            <span className="block text-sm text-mist-200 mb-2">Contrast</span>
            <Segmented
              ariaLabel="Contrast"
              value={rs.contrast}
              onChange={(v) => setReader({ contrast: v })}
              options={[
                { value: "normal", label: "Normal" },
                { value: "high", label: "High" },
              ]}
            />
          </div>
          <Toggle
            label="Motion"
            hint="Disable decorative animation across the app."
            checked={rs.motion}
            onChange={(v) => setReader({ motion: v })}
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
            label="Keyboard hints"
            hint="Show shortcut affordances in the reader."
            checked={rs.kbdHints}
            onChange={(v) => setReader({ kbdHints: v })}
          />
        </section>

        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            setReader({
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
            })
          }
        >
          <ArrowCounterClockwise className="w-4 h-4" />
          Reset to defaults
        </Button>
      </div>
    </Sheet>
  );
}
