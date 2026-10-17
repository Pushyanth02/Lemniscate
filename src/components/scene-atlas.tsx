"use client";

/**
 * Scene Atlas — presentation layer.
 *
 * The visual contract of the atlas, plate by plate:
 *   ScenePlate     procedural artwork derived from the scene's own content
 *                  (palette family + deterministic seed; no stock gradients)
 *   AtlasCard      the full plate: artwork → title → interpretation →
 *                  evidence → metadata → note, in one strict hierarchy
 *   EvidenceBlock  "From the text" — verified quotations with passage
 *                  references, clearly separated from AI interpretation
 *   SourceCompare  passage-in-context vs. the enlargement, side by side
 *   MotifStrip     the chapter's recurring images, explorable
 *   ThreadLink     the narrative thread between plates, when the text
 *                  genuinely continues
 *
 * Everything here is presentational; state lives in ReaderPanels' ScenesView.
 */
import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Quotes,
  Eye,
  BookOpen,
  ChatCircleDots,
  NotePencil,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import type { Chunk, SceneAnchor, SceneArt, SceneDraft } from "../lib/types";
import { artFor, toRoman } from "../lib/scenes";
import { cx } from "../lib/utils";

/* ═══════════════════════════════════════════════════
   The plate — procedural artwork, one composition per scene
   ═══════════════════════════════════════════════════ */

interface PlatePalette {
  bg: string;
  far: string;
  mid: string;
  near: string;
  accent: string;
  detail: string;
}

/** Ink-and-brass palette families. Every color sits inside the app's
 *  Vellum & Ember identity: deep warm ink surfaces, one restrained accent. */
const PLATE_PALETTES: Record<SceneArt["palette"], PlatePalette> = {
  dawn: {
    bg: "#161009", far: "#221a10", mid: "#312513", near: "#40301a",
    accent: "#d3a651", detail: "#e8cc85",
  },
  night: {
    bg: "#0a0d13", far: "#12161f", mid: "#1a2029", near: "#232b37",
    accent: "#9aa8c4", detail: "#cdd6e8",
  },
  storm: {
    bg: "#0e1114", far: "#181d22", mid: "#212830", near: "#2b333c",
    accent: "#7e8b96", detail: "#aeb9c2",
  },
  ember: {
    bg: "#140a07", far: "#22110c", mid: "#331812", near: "#43201a",
    accent: "#c26b4a", detail: "#d5854f",
  },
  forest: {
    bg: "#0b110d", far: "#131d17", mid: "#1b2a20", near: "#24382b",
    accent: "#569383", detail: "#8fbfae",
  },
  sea: {
    bg: "#0a1317", far: "#101d23", mid: "#162b33", near: "#1d3841",
    accent: "#4d8794", detail: "#8fb8c2",
  },
  interior: {
    bg: "#140e07", far: "#211810", mid: "#2f2413", near: "#3d2f1a",
    accent: "#c9a050", detail: "#e0c084",
  },
  atlas: {
    bg: "#0d0b11", far: "#171420", mid: "#221e2b", near: "#2e2836",
    accent: "#d9ad52", detail: "#e9cf8d",
  },
};

/** mulberry32 — small, fast, deterministic. Same seed → same plate, on every
 *  device and every render. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 420;
const H = 178;

/** One layered landform: a smooth ridge from left to right, closed down to
 *  the bottom edge. Control points jittered deterministically. */
function ridgePath(
  rnd: () => number,
  yBase: number,
  amplitude: number,
): string {
  const pts = 5;
  let d = `M 0 ${H} L 0 ${yBase}`;
  for (let i = 0; i < pts; i++) {
    const x = ((i + 1) / pts) * W;
    const y = yBase + (rnd() - 0.5) * amplitude;
    const cx = x - W / pts / 2;
    const cy = yBase + (rnd() - 0.5) * amplitude * 1.4;
    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${W} ${H} Z`;
  return d;
}

/** The scene's plate: layered landforms, one palette-specific element, and
 *  fine engraved hairlines — a composition, not a gradient. Deterministic
 *  from (palette, seed). */
export function ScenePlate({
  art,
  className,
}: {
  art: SceneArt;
  className?: string;
}) {
  const p = PLATE_PALETTES[art.palette];
  const rnd = prng(art.seed || 1);
  const horizon = H * (0.56 + rnd() * 0.08);
  const ridges = [
    { d: ridgePath(rnd, horizon - 26 - rnd() * 10, 22), fill: p.far, op: 0.9 },
    { d: ridgePath(rnd, horizon - 10 - rnd() * 8, 26), fill: p.mid, op: 0.95 },
    { d: ridgePath(rnd, horizon + 4, 24), fill: p.near },
  ];
  const accentY = horizon + 4;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx("block h-full w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width={W} height={H} fill={p.bg} />
      {ridges.map((r, i) => (
        <path key={i} d={r.d} fill={r.fill} opacity={r.op ?? 1} />
      ))}

      {/* the palette's signature element — content-derived, never stock */}
      {art.palette === "night" && (
        <>
          <circle
            cx={W * (0.62 + rnd() * 0.2)}
            cy={H * 0.24}
            r={11}
            fill={p.detail}
            opacity={0.85}
          />
          <circle
            cx={W * (0.62 + rnd() * 0.2) + 5}
            cy={H * 0.22}
            r={9}
            fill={p.bg}
            opacity={0.9}
          />
        </>
      )}
      {art.palette === "dawn" && (
        <>
          <circle
            cx={W * (0.3 + rnd() * 0.4)}
            cy={accentY - 14}
            r={13}
            fill="none"
            stroke={p.accent}
            strokeWidth={1.4}
            opacity={0.9}
          />
          <line
            x1={0}
            y1={accentY - 14}
            x2={W}
            y2={accentY - 14}
            stroke={p.accent}
            strokeWidth={1}
            opacity={0.55}
          />
        </>
      )}
      {art.palette === "storm" &&
        Array.from({ length: 7 }, (_, i) => {
          const x = W * (0.08 + rnd() * 0.84);
          const y = H * (0.1 + rnd() * 0.3);
          return (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x - 7}
              y2={y + 16}
              stroke={p.detail}
              strokeWidth={1}
              opacity={0.35 + rnd() * 0.3}
            />
          );
        })}
      {art.palette === "ember" && (
        <>
          <path
            d={`M ${W * 0.72} ${accentY - 2} q 10 -18 -4 -30`}
            fill="none"
            stroke={p.accent}
            strokeWidth={1.6}
            opacity={0.9}
          />
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1={W * (0.6 + i * 0.055)}
              y1={accentY - 8 - i * 9}
              x2={W * (0.6 + i * 0.055) + 1.5}
              y2={accentY - 16 - i * 9}
              stroke={p.detail}
              strokeWidth={1}
              opacity={0.7 - i * 0.18}
            />
          ))}
        </>
      )}
      {art.palette === "forest" &&
        Array.from({ length: 5 }, (_, i) => {
          const x = W * (0.12 + i * 0.17 + (rnd() - 0.5) * 0.06);
          const top = accentY - 20 - rnd() * 22;
          return (
            <line
              key={i}
              x1={x}
              y1={accentY}
              x2={x + (rnd() - 0.5) * 4}
              y2={top}
              stroke={p.detail}
              strokeWidth={1.2}
              opacity={0.5}
            />
          );
        })}
      {art.palette === "sea" &&
        [0, 1, 2].map((i) => {
          const y = accentY + 12 + i * 13;
          const x0 = W * (0.06 + rnd() * 0.1);
          const x1 = W * (0.55 + rnd() * 0.3);
          return (
            <path
              key={i}
              d={`M ${x0} ${y} q ${(x1 - x0) / 4} -5 ${(x1 - x0) / 2} 0 t ${(x1 - x0) / 2} 0`}
              fill="none"
              stroke={p.detail}
              strokeWidth={1}
              opacity={0.45 - i * 0.1}
            />
          );
        })}
      {art.palette === "interior" && (
        <>
          <circle
            cx={W * (0.28 + rnd() * 0.1)}
            cy={accentY - 26}
            r={5}
            fill={p.detail}
            opacity={0.95}
          />
          <circle
            cx={W * (0.28 + rnd() * 0.1)}
            cy={accentY - 26}
            r={10}
            fill="none"
            stroke={p.accent}
            strokeWidth={1}
            opacity={0.5}
          />
          <path
            d={`M ${W * (0.28 + rnd() * 0.1) - 10} ${accentY - 20} L ${W * (0.28 + rnd() * 0.1) - 26} ${accentY} L ${W * (0.28 + rnd() * 0.1) + 26} ${accentY} L ${W * (0.28 + rnd() * 0.1) + 10} ${accentY - 20}`}
            fill={p.accent}
            opacity={0.14}
          />
        </>
      )}
      {art.palette === "atlas" && (
        <>
          <circle
            cx={W * (0.55 + rnd() * 0.2)}
            cy={H * 0.3}
            r={17}
            fill="none"
            stroke={p.accent}
            strokeWidth={1}
            opacity={0.6}
          />
          <line
            x1={W * (0.55 + rnd() * 0.2) - 24}
            y1={H * 0.3}
            x2={W * (0.55 + rnd() * 0.2) + 24}
            y2={H * 0.3}
            stroke={p.accent}
            strokeWidth={0.8}
            opacity={0.4}
          />
        </>
      )}

      {/* the brass horizon rule and engraved hairlines */}
      <line
        x1={0}
        y1={accentY}
        x2={W}
        y2={accentY}
        stroke={p.accent}
        strokeWidth={1.1}
        opacity={0.8}
      />
      {[0, 1].map((i) => (
        <line
          key={i}
          x1={W * 0.06}
          y1={H - 14 - i * 7}
          x2={W * (0.6 + rnd() * 0.3)}
          y2={H - 14 - i * 7}
          stroke={p.detail}
          strokeWidth={0.6}
          opacity={0.22}
        />
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   Evidence — original quotations, clearly marked
   ═══════════════════════════════════════════════════ */

/** Highlight occurrences of the explored motif inside a quotation —
 *  case-insensitive, word-boundary-safe enough for short chips. */
function HighlightMotif({
  text,
  motif,
}: {
  text: string;
  motif: string | null;
}) {
  if (!motif || motif.length < 3) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(motif.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-gold-300 not-italic">
        {text.slice(idx, idx + motif.length)}
      </span>
      {text.slice(idx + motif.length)}
    </>
  );
}

function EvidenceQuote({
  anchor,
  motif,
  onCompare,
  onOpenChunk,
  chunkCount,
}: {
  anchor: SceneAnchor;
  motif: string | null;
  onCompare: () => void;
  onOpenChunk: () => void;
  chunkCount: number;
}) {
  return (
    <figure className="border-l border-gold-700/50 pl-3.5 py-0.5">
      <blockquote className="font-literata text-[13.5px] leading-relaxed text-mist-300 italic">
        <HighlightMotif text={anchor.quote} motif={motif} />
      </blockquote>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.1em] text-gold-500/90">
          <Quotes className="w-3 h-3" weight="fill" />
          ¶ {anchor.chunkIndex + 1}
          <span className="text-mist-600">of {chunkCount}</span>
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-ok-500/90 inline-flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          verified
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCompare}
          className="inline-flex items-center gap-1 text-[11px] font-body text-mist-400 hover:text-gold-300 transition-colors"
          title="Compare the passage with this enlargement"
        >
          <Eye className="w-3.5 h-3.5" />
          Compare
        </button>
        <button
          type="button"
          onClick={onOpenChunk}
          className="inline-flex items-center gap-1 text-[11px] font-body text-mist-400 hover:text-gold-300 transition-colors"
          title="Open the reader at this passage"
        >
          <BookOpen className="w-3.5 h-3.5" />
          In reader
        </button>
      </figcaption>
    </figure>
  );
}

/** "From the text" — the scene's evidence, visually and semantically
 *  separated from the interpretation above it. */
function EvidenceBlock({
  scene,
  chunks,
  estimatedChunk,
  activeMotif,
  onCompare,
  onOpenChunk,
}: {
  scene: SceneDraft;
  chunks: readonly Chunk[];
  /** legacy scenes only: keyword-estimated passage, labelled honestly */
  estimatedChunk?: number | null;
  activeMotif: string | null;
  onCompare: (anchorIdx: number) => void;
  onOpenChunk: (chunkIndex: number) => void;
}) {
  const anchors = scene.anchors ?? [];
  if (anchors.length > 0) {
    return (
      <section
        aria-label="Passages this scene is grounded in"
        className="mt-5 pt-4 border-t border-ink-700/60"
      >
        <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500 mb-3">
          From the text
        </h4>
        <div className="space-y-4">
          {anchors.map((a, i) => (
            <EvidenceQuote
              key={`${a.chunkIndex}-${i}`}
              anchor={a}
              motif={activeMotif}
              chunkCount={chunks.length}
              onCompare={() => onCompare(i)}
              onOpenChunk={() => onOpenChunk(a.chunkIndex)}
            />
          ))}
        </div>
      </section>
    );
  }
  // Legacy scene (pre-atlas cache or row): no verified anchors exist. Show
  // the estimated passage honestly, and say what regeneration would add.
  if (estimatedChunk != null && estimatedChunk >= 0) {
    const text = chunks[estimatedChunk]?.text ?? "";
    const excerpt =
      text.length > 220 ? text.slice(0, 219) + "…" : text;
    return (
      <section
        aria-label="Estimated source passage"
        className="mt-5 pt-4 border-t border-ink-700/60"
      >
        <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500 mb-3">
          Near this passage{" "}
          <span className="text-mist-600 normal-case tracking-normal">
            (estimated — this scene predates verified anchors)
          </span>
        </h4>
        <blockquote className="border-l border-ink-600 pl-3.5 font-literata text-[13.5px] leading-relaxed text-mist-400 italic">
          {excerpt}
          <span className="block mt-1.5 not-italic text-[10px] font-mono uppercase tracking-[0.1em] text-mist-600">
            ¶ {estimatedChunk + 1} of {chunks.length}
          </span>
        </blockquote>
        <p className="mt-3 text-[11px] text-mist-600 leading-relaxed">
          Regenerate the chapter to attach verified, quotable passages.
        </p>
      </section>
    );
  }
  return null;
}

/* ═══════════════════════════════════════════════════
   Source comparison — passage in context vs. enlargement
   ═══════════════════════════════════════════════════ */

/** Escape a quote into a regex that tolerates whitespace runs, case
 *  differences, and curly/straight apostrophes + quotation marks. */
function quoteRegex(quote: string, loose: boolean): RegExp | null {
  const src = loose ? quote.split(/\s+/).slice(0, 8).join(" ") : quote;
  if (src.trim().length < 8) return null;
  const pattern = src
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/["“”]/g, "[“”\"]")
    .replace(/['‘’]/g, "[‘’']")
    .replace(/\s+/g, "\\s+");
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/** Locate a quotation inside a passage, tolerating whitespace and case
 *  drift. Returns [start, end] on the raw text, or null. */
export function findQuoteSpan(
  text: string,
  quote: string,
): [number, number] | null {
  const direct = quoteRegex(quote, false);
  if (direct) {
    const m = direct.exec(text);
    if (m) return [m.index, m.index + m[0].length];
  }
  const loose = quoteRegex(quote, true);
  if (loose) {
    const m = loose.exec(text);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}

/** One passage paragraph, with the anchored quotation highlighted in brass. */
function PassageWithHighlight({
  text,
  quote,
  label,
}: {
  text: string;
  quote: string;
  label: string;
}) {
  const span = findQuoteSpan(text, quote);
  return (
    <p className="font-literata text-[14px] leading-relaxed text-mist-300 whitespace-pre-wrap">
      <span className="mr-2 text-[10px] font-mono uppercase tracking-[0.1em] text-mist-600 align-middle">
        {label}
      </span>
      {span ? (
        <>
          {text.slice(0, span[0])}
          <mark className="bg-gold-500/15 text-gold-200 rounded-sm px-0.5">
            {text.slice(span[0], span[1])}
          </mark>
          {text.slice(span[1])}
        </>
      ) : (
        <>
          {text}
          <span className="mt-2 block border-l border-gold-700/50 pl-3 font-literata text-[13px] italic text-mist-400">
            “{quote}”
          </span>
        </>
      )}
    </p>
  );
}

/** The body of the source-comparison dialog: original passage in context on
 *  one side, the atlas enlargement on the other. */
export function SourceCompare({
  scene,
  anchor,
  chunks,
  onOpenInReader,
}: {
  scene: SceneDraft;
  anchor: SceneAnchor;
  chunks: readonly Chunk[];
  onOpenInReader: (chunkIndex: number) => void;
}) {
  const at = Math.max(0, Math.min(chunks.length - 1, anchor.chunkIndex));
  const prev = chunks[at - 1];
  const cur = chunks[at];
  const next = chunks[at + 1];
  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section aria-label="Original passage in context">
          <h4 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500 mb-3">
            <BookOpen className="w-3.5 h-3.5 text-gold-500" />
            The text — ¶ {at + 1} of {chunks.length}
          </h4>
          <div className="max-h-[46vh] overflow-y-auto scrollbar-thin pr-1 space-y-3">
            {prev && (
              <p className="font-literata text-[13px] leading-relaxed text-mist-500 whitespace-pre-wrap opacity-80">
                <span className="mr-2 text-[10px] font-mono uppercase tracking-[0.1em] text-mist-600 align-middle">
                  ¶ {at}
                </span>
                {prev.text.length > 260
                  ? prev.text.slice(0, 259) + "…"
                  : prev.text}
              </p>
            )}
            {cur && (
              <div className="border border-ink-700 rounded-lg bg-ink-900/60 p-3.5">
                <PassageWithHighlight
                  text={cur.text}
                  quote={anchor.quote}
                  label={`¶ ${at + 1}`}
                />
              </div>
            )}
            {next && (
              <p className="font-literata text-[13px] leading-relaxed text-mist-500 whitespace-pre-wrap opacity-80">
                <span className="mr-2 text-[10px] font-mono uppercase tracking-[0.1em] text-mist-600 align-middle">
                  ¶ {at + 2}
                </span>
                {next.text.length > 260
                  ? next.text.slice(0, 259) + "…"
                  : next.text}
              </p>
            )}
          </div>
        </section>
        <section aria-label="Ankaa's enlargement">
          <h4 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500 mb-3">
            <Eye className="w-3.5 h-3.5 text-ankaa-400" />
            The enlargement — interpretation
          </h4>
          <p className="font-display italic text-lg text-mist-100 leading-snug mb-3">
            “{scene.title}”
          </p>
          <div className="max-h-[46vh] overflow-y-auto scrollbar-thin pr-1 space-y-3">
            {scene.body.split(/\n{2,}/).map((p, i) => (
              <p
                key={i}
                className="font-literata text-[14px] leading-relaxed text-mist-300"
              >
                {p}
              </p>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-5 pt-4 border-t border-ink-700 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-mist-600 leading-relaxed max-w-sm">
          The highlighted words are the chapter's own; everything in the
          enlargement is Ankaa's interpretation of them.
        </p>
        <button
          type="button"
          onClick={() => onOpenInReader(at)}
          className="inline-flex items-center gap-1.5 text-[12px] font-body text-gold-300 hover:text-gold-200 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Open the reader at ¶ {at + 1}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Motifs, thread, notes
   ═══════════════════════════════════════════════════ */

/** The chapter's motif index — every recurring image the scenes share,
 *  explorable with one click. */
export function MotifStrip({
  motifs,
  active,
  onToggle,
}: {
  motifs: { motif: string; count: number }[];
  active: string | null;
  onToggle: (motif: string) => void;
}) {
  if (motifs.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 mb-6"
      aria-label="Motifs across this chapter"
    >
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-mist-600 mr-1">
        Motifs
      </span>
      {motifs.map(({ motif, count }) => {
        const on = active === motif;
        return (
          <button
            key={motif}
            type="button"
            onClick={() => onToggle(motif)}
            aria-pressed={on}
            className={cx(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-body transition-colors",
              on
                ? "border-gold-600 bg-gold-500/15 text-gold-200"
                : "border-ink-600 bg-ink-800/70 text-mist-300 hover:border-gold-700/60 hover:text-gold-200",
            )}
            title={
              on
                ? "Show every scene again"
                : `Focus the ${count} scene${count === 1 ? "" : "s"} carrying “${motif}”`
            }
          >
            {motif}
            <span
              className={cx(
                "text-[9px] font-mono tabular-nums",
                on ? "text-gold-400" : "text-mist-600",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={() => onToggle(active)}
          className="text-[11px] font-body text-mist-500 hover:text-mist-300 underline underline-offset-2 decoration-ink-600 transition-colors"
        >
          clear
        </button>
      )}
    </div>
  );
}

/** The narrative thread between two plates — rendered only when the text
 *  genuinely continues. */
export function ThreadLink({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-3 pl-1 -my-1"
      aria-label="Narrative thread to the next scene"
    >
      <svg
        width="26"
        height="16"
        viewBox="0 0 26 16"
        aria-hidden="true"
        className="shrink-0 mt-0.5"
      >
        <path
          d="M13 8 C13 3 6 3 6 8 C6 13 13 13 13 8 C13 3 20 3 20 8 C20 13 13 13 13 8"
          fill="none"
          stroke="var(--color-gold-500, #d9ad52)"
          strokeWidth="1.1"
          opacity="0.75"
        />
      </svg>
      <p className="text-[12.5px] italic font-literata leading-relaxed text-mist-500">
        <span className="not-italic font-mono text-[9px] uppercase tracking-[0.18em] text-gold-600 mr-2">
          Thread
        </span>
        {text}
      </p>
    </div>
  );
}

/** The reader's own note on one scene — debounced autosave, unobtrusive. */
export function SceneNoteField({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (note: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const lastSaved = useRef(initial);

  // Flush a pending debounced save on unmount — leaving mid-edit must not
  // lose the reader's words.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      if (value.trim() !== lastSaved.current) onSave(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onChange = (v: string): void => {
    setValue(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (v.trim() !== lastSaved.current.trim()) {
        lastSaved.current = v;
        onSave(v);
        setSaved(true);
        if (savedTimer.current) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 1800);
      }
    }, 700);
  };

  return (
    <div className="mt-5 pt-4 border-t border-ink-700/60">
      <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-mist-500 mb-2">
        <NotePencil className="w-3.5 h-3.5 text-gold-600" />
        Your note
        {saved && (
          <span className="inline-flex items-center gap-1 text-ok-500 normal-case tracking-normal text-[10px]">
            <CheckCircle className="w-3 h-3" />
            saved
          </span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="What this plate means to you…"
        className="w-full bg-ink-900/60 border border-ink-700 rounded-lg px-3 py-2 text-[13px] font-literata leading-relaxed text-mist-200 placeholder:text-mist-600 focus:outline-none focus:border-gold-700/70 transition-colors resize-y"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   The card — one plate of the atlas
   ═══════════════════════════════════════════════════ */

export interface AtlasCardProps {
  scene: SceneDraft;
  ordinal: number;
  total: number;
  chunks: readonly Chunk[];
  note: string;
  activeMotif: string | null;
  dimmed: boolean;
  regenBusy: boolean;
  /* Ordinal-first callbacks: ScenesView passes ONE stable handler for all
     plates (per-card closures would defeat React.memo); the card supplies
     its own ordinal when invoking them. */
  onCompare: (ordinal: number, anchorIdx: number) => void;
  onOpenChunk: (chunkIndex: number) => void;
  onMotif: (motif: string) => void;
  onRegenerate: (ordinal: number) => void;
  onAskLuma: (question: string) => void;
  onNoteSave: (ordinal: number, note: string) => void;
  estimatedChunk: number | null;
}

function AtlasCardInner({
  scene,
  ordinal,
  total,
  chunks,
  note,
  activeMotif,
  dimmed,
  regenBusy,
  onCompare,
  onOpenChunk,
  onMotif,
  onRegenerate,
  onAskLuma,
  onNoteSave,
  estimatedChunk,
}: AtlasCardProps) {
  const art = scene.art ?? artFor(scene);
  const anchorEngine = scene.engine === "anchor";
  return (
    <article
      className={cx(
        "panel overflow-hidden hover-lift hover:border-gold-700/60 flex flex-col transition-[opacity,filter] duration-300",
        dimmed && "opacity-40 saturate-[0.6]",
        regenBusy && "opacity-70",
      )}
    >
      {/* plate artwork with the scene's roman numeral */}
      <div className="relative aspect-21/9 w-full overflow-hidden border-b border-ink-800">
        <ScenePlate art={art} />
        <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-300 bg-ink-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/10">
          {toRoman(ordinal + 1)}
          <span className="text-mist-600 normal-case">
            of {toRoman(total)}
          </span>
        </span>
        <span
          className={cx(
            "absolute top-3 left-3 text-[9px] font-mono uppercase tracking-[0.16em] px-2 py-1 rounded border",
            anchorEngine
              ? "text-mist-400 border-ink-600 bg-ink-950/60"
              : "text-ankaa-300/90 border-ankaa-700/40 bg-ink-950/60",
          )}
        >
          {anchorEngine ? "Anchor sketch" : "Ankaa"}
        </span>
      </div>

      <div className="p-5 sm:p-6 flex-1 flex flex-col">
        {/* title + mood */}
        <h3 className="font-display italic font-medium text-[22px] sm:text-2xl text-mist-100 leading-tight">
          “{scene.title}”
        </h3>
        <p className="text-[11px] text-mist-500 font-body tracking-wide mt-1.5">
          {scene.mood}
        </p>

        {/* interpretation — labelled as such, never masquerading as text */}
        <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.18em] text-mist-600">
          {anchorEngine ? "Anchor sketch · extractive" : "The enlargement · interpretation"}
        </p>
        <div className="mt-2 space-y-3 flex-1">
          {scene.body.split(/\n{2,}/).map((p, i) => (
            <p
              key={i}
              className="text-[14.5px] leading-relaxed text-mist-300 font-literata"
            >
              {p}
            </p>
          ))}
        </div>

        {/* metadata: setting, cast, sensory, movement */}
        {scene.setting && (
          <p className="mt-4 text-[12.5px] font-literata text-mist-400 italic leading-relaxed">
            <span className="not-italic font-mono text-[9px] uppercase tracking-[0.18em] text-mist-600 mr-2">
              Setting
            </span>
            {scene.setting}
          </p>
        )}
        {scene.characters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scene.characters.map((c) => (
              <span
                key={c}
                className="text-[11px] font-body px-2 py-0.5 rounded-full border border-ink-600 bg-ink-800 text-mist-200"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {(scene.sensory?.length ?? 0) > 0 && (
          <p className="mt-3 text-[12px] font-body text-mist-400">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-mist-600 mr-2">
              Senses
            </span>
            {scene.sensory!.join(" · ")}
          </p>
        )}
        {scene.movement && (
          <p className="mt-3 text-[12.5px] font-literata text-mist-400 leading-relaxed">
            <span className="not-italic font-mono text-[9px] uppercase tracking-[0.18em] text-mist-600 mr-2">
              The turn
            </span>
            {scene.movement}
          </p>
        )}

        {/* motifs — explorable */}
        {(scene.motifs?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {scene.motifs!.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMotif(m)}
                aria-pressed={activeMotif === m}
                className={cx(
                  "text-[11px] font-body px-2 py-0.5 rounded-full border transition-colors",
                  activeMotif === m
                    ? "border-gold-600 bg-gold-500/15 text-gold-200"
                    : "border-ink-600 bg-ink-800/60 text-mist-300 hover:border-gold-700/60 hover:text-gold-200",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* evidence + notes */}
        <EvidenceBlock
          scene={scene}
          chunks={chunks}
          estimatedChunk={estimatedChunk}
          activeMotif={activeMotif}
          onCompare={(anchorIdx) => onCompare(ordinal, anchorIdx)}
          onOpenChunk={onOpenChunk}
        />
        <SceneNoteField
          initial={note}
          onSave={(note) => onNoteSave(ordinal, note)}
        />

        {/* actions */}
        <div className="mt-5 pt-4 border-t border-ink-700/60 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onRegenerate(ordinal)}
            disabled={regenBusy}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-body text-mist-400 hover:text-gold-300 transition-colors disabled:opacity-50"
            title="Re-run this scene with a new variation seed"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className={regenBusy ? "animate-spin" : ""}>
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path d="M13.8 1.8v3h-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {regenBusy ? "Rewriting…" : "Regenerate scene"}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              const motifBit = scene.motifs?.length
                ? ` — especially its use of ${scene.motifs.slice(0, 2).join(" and ")}.`
                : ".";
              onAskLuma(
                `Discuss the scene “${scene.title}” (${scene.mood})${motifBit}`,
              );
            }}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-body text-mist-400 hover:text-gold-300 transition-colors"
            title="Ask Luma about this scene, with its evidence in context"
          >
            <ChatCircleDots className="w-3.5 h-3.5" />
            Ask Luma
          </button>
        </div>
      </div>
    </article>
  );
}

export const AtlasCard = memo(AtlasCardInner);

/* ═══════════════════════════════════════════════════
   Skeleton — the atlas assembling itself
   ═══════════════════════════════════════════════════ */

export function SceneSkeleton(): ReactNode {
  return (
    <div className="panel overflow-hidden" aria-hidden>
      <div className="aspect-21/9 w-full bg-ink-900/70 border-b border-ink-800 flex items-end justify-center pb-6">
        <svg width="72" height="14" viewBox="0 0 72 14" aria-hidden="true">
          <path
            d="M36 7 C36 2 22 2 22 7 C22 12 36 12 36 7 C36 2 50 2 50 7 C50 12 36 12 36 7"
            fill="none"
            stroke="var(--color-ink-600, #3a3347)"
            strokeWidth="1.2"
          />
        </svg>
      </div>
      <div className="p-5 sm:p-6 space-y-3">
        <div className="h-2 w-20 rounded bg-ink-800 animate-pulse-soft" />
        <div className="h-6 w-3/4 rounded bg-ink-800 animate-pulse-soft" />
        <div className="h-3 w-1/3 rounded bg-ink-800 animate-pulse-soft" />
        <div className="h-20 w-full rounded bg-ink-800/70 animate-pulse-soft mt-2" />
        <div className="h-3 w-2/5 rounded bg-ink-800 animate-pulse-soft" />
      </div>
    </div>
  );
}
