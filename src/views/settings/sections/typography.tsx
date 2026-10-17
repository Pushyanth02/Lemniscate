import { usePrefs, useShallow } from "../../../lib/store";
import type { ReaderFontId } from "../../../lib/types";
import { Panel, Select, Slider } from "../../../components/ui";
import { FONT_OPTIONS } from "../constants";
import { SegmentedTheme } from "../widgets/segmented-theme";

/* Typography: reader defaults with a live preview. */
export function TypographySection() {
  const { prefs, setReader } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setReader: s.setReader })),
  );
  const rs = prefs.reader;

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
        Reader defaults
      </h2>
      <p className="text-xs text-mist-500 mb-5 leading-relaxed">
        Applied the moment you open any document; adjustable per-session
        inside the reader.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
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
        <div className="sm:pt-6">
          <SegmentedTheme />
        </div>
      </div>
      <div className="mt-5 space-y-1">
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
          unit={
            rs.letterSpacing
              ? ` ${(rs.letterSpacing / 100).toFixed(2)}em`
              : ""
          }
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
      {/* live preview */}
      <div
        className="hairline rounded-xl p-5 mt-5 relative"
        style={{
          fontFamily: `var(--font-${rs.fontFamily})`,
          fontSize: `${rs.fontSize * 0.82}px`,
          lineHeight: rs.lineHeight,
          letterSpacing: `${rs.letterSpacing / 100}em`,
        }}
      >
        <span className="absolute top-2.5 right-3 text-[10px] font-body text-mist-600">
          Live preview
        </span>
        <p className="text-mist-300 mb-2.5">
          The lamp kept its post, and the threshold became what
          thresholds are secretly for.
        </p>
        <p className="text-mist-400 opacity-80">
          Set the room to your hand: choose a face, widen the line, slow
          the eye.
        </p>
      </div>
    </Panel>
  );
}
