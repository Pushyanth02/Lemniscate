"use client";

/* The margin — a live excerpt of the reader.
 *
 * Everything on this desk works: chapters switch from a real table of
 * contents, any passage can be selected and marked (four colours, optional
 * note, exactly like the reader's annotation popover), type size and focus
 * mode respond, and the marks persist on this device. The text is Marcus
 * Aurelius, Meditations, Books I–V, in George Long's public-domain
 * translation — genuine paragraphs, never invented ones.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CaretLeft,
  CaretRight,
  Crosshair,
  Highlighter,
  PenNib,
  X,
} from "@phosphor-icons/react";
import { toast } from "../lib/store";
import { cx, uid } from "../lib/utils";
import type { AnnotationColor } from "../lib/types";
import { Button, Textarea } from "./ui";

/* ── the excerpt: real Meditations, George Long translation ── */

interface DemoChapter {
  kicker: string;
  title: string;
  paras: string[];
}

const CHAPTERS: DemoChapter[] = [
  {
    kicker: "Book I",
    title: "Debts and lessons",
    paras: [
      "From my grandfather Verus I learned good morals and the government of my temper.",
      "From the reputation and remembrance of my father, modesty and a manly character.",
      "From my mother, piety and beneficence, and abstinence, not only from evil deeds, but even from evil thoughts; and further, simplicity in my way of living, far removed from the habits of the rich.",
    ],
  },
  {
    kicker: "Book II",
    title: "On the river Gran, among the Quadi",
    paras: [
      "Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.",
      "Since it is possible that thou mayest depart from life this very moment, regulate every act and thought accordingly. But to go away from among men, if there are gods, is not a thing to be afraid of.",
      "How much trouble he avoids who does not look to see what his neighbour says or does or thinks, but only to what he does himself, that it may be just and holy!",
    ],
  },
  {
    kicker: "Book III",
    title: "In Carnuntum",
    paras: [
      "Nothing has such power to broaden the mind as the ability to investigate systematically and truly all that comes under thy observation in life.",
    ],
  },
  {
    kicker: "Book IV",
    title: "Book four",
    paras: [
      "Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good.",
    ],
  },
  {
    kicker: "Book V",
    title: "Book five",
    paras: [
      "In the morning when thou risest unwillingly, let this thought be present: I am rising to the work of a human being. Why then am I dissatisfied if I am going to do the things for which I exist and for which I was brought into the world?",
      "Such as are thy habitual thoughts, such also will be the character of thy mind; for the soul is dyed by the thoughts.",
    ],
  },
];

/* ── marks ── */

interface DemoMark {
  id: string;
  chapter: number;
  para: number;
  start: number;
  end: number;
  text: string;
  note: string;
  color: AnnotationColor;
}

const STORE_KEY = "lemniscate:demo-desk";

const SWATCH: Record<AnnotationColor, string> = {
  gold: "#d4a853",
  ouro: "#569383",
  ankaa: "#d5854f",
  ok: "#6cbb81",
};

/* Light tints for the cream page — each colour stays legible on paper. */
const TINT: Record<AnnotationColor, { bg: string; ink: string }> = {
  gold: { bg: "var(--color-highlight)", ink: "var(--color-highlight-ink)" },
  ouro: { bg: "rgb(86 147 131 / 0.24)", ink: "#1e4d41" },
  ankaa: { bg: "rgb(213 133 79 / 0.26)", ink: "#5c3416" },
  ok: { bg: "rgb(108 187 129 / 0.24)", ink: "#1d4a2c" },
};

const SIZES = [14, 16, 18];

/* ── selection plumbing ── */

interface SelInfo {
  chapter: number;
  para: number;
  start: number;
  end: number;
  text: string;
  top: number;
  left: number;
  bottom: number;
}

function paraOf(node: Node): HTMLElement | null {
  const el =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : (node as HTMLElement);
  return el?.closest?.("p[data-demo-c]") ?? null;
}

/** Character offset of (node, offset) within the paragraph's text content. */
function offsetInParagraph(p: HTMLElement, node: Node, off: number): number {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return acc + off;
    acc += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return -1;
}

function readSelection(): SelInfo | null {
  if (typeof window === "undefined") return null;
  const s = window.getSelection();
  if (!s || s.isCollapsed || s.rangeCount === 0) return null;
  const range = s.getRangeAt(0);
  const startP = paraOf(range.startContainer);
  const endP = paraOf(range.endContainer);
  /* only single-paragraph selections inside the excerpt */
  if (!startP || startP !== endP) return null;
  const start = offsetInParagraph(
    startP,
    range.startContainer,
    range.startOffset,
  );
  const end = offsetInParagraph(endP, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || end - start < 2) return null;
  const raw = s.toString();
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - lead - raw.trimEnd().length;
  const text = raw.trim();
  if (!text) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    chapter: Number(startP.dataset.demoC),
    para: Number(startP.dataset.demoP),
    start: start + lead,
    end: end - trail,
    text,
    top: rect.top,
    left: rect.left + rect.width / 2,
    bottom: rect.bottom,
  };
}

/* ── marked text renderer (mirrors the reader's renderAnnotated) ── */

function renderMarked(text: string, marks: DemoMark[]): ReactNode[] {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const m of sorted) {
    if (m.start < pos || m.start >= text.length) continue;
    if (m.start > pos) out.push(text.slice(pos, m.start));
    const tint = TINT[m.color] ?? TINT.gold;
    out.push(
      <mark
        key={m.id}
        className="rounded-sm px-0.5"
        style={{
          background: tint.bg,
          color: tint.ink,
          ...(m.note
            ? { borderBottom: `2px dotted ${SWATCH[m.color] ?? SWATCH.gold}` }
            : {}),
        }}
      >
        {text.slice(m.start, Math.min(m.end, text.length))}
      </mark>,
    );
    pos = Math.min(m.end, text.length);
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/* ── the annotation popover (same contract as the reader's) ── */

const POPOVER_H = 268;

function MarkPopover({
  sel,
  rootRef,
  onSave,
  onClose,
}: {
  sel: SelInfo;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onSave: (note: string, color: AnnotationColor) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [color, setColor] = useState<AnnotationColor>("gold");
  const [top, setTop] = useState<number>(() => sel.bottom + 12);

  /* Anchor below the passage when there is room, above when there is not.
     Both branches floor at 12px so an off-screen selection (scroll-restore
     races) can never park the popover out of reach. */
  useEffect(() => {
    const below = Math.max(12, sel.bottom + 12);
    setTop(
      below + POPOVER_H <= window.innerHeight
        ? below
        : Math.max(12, sel.top - POPOVER_H - 12),
    );
  }, [sel.bottom, sel.top]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="fixed z-60 w-[min(92vw,340px)] panel p-4 rounded-xl shadow-lift animate-[rise_0.3s_cubic-bezier(0.22,1,0.36,1)_both]"
      style={{
        /* Centre on the selection in PIXELS, clamped so the full popover
           width (min(92vw, 340px)) always stays inside the viewport. No
           translateX(-50%): the rise animation's fill-mode transform would
           override it. */
        left: (() => {
          const halfW = Math.min(window.innerWidth * 0.92, 340) / 2;
          const center = Math.min(
            Math.max(sel.left, halfW),
            Math.max(halfW, window.innerWidth - halfW),
          );
          return center - halfW;
        })(),
        top,
      }}
      role="dialog"
      aria-label="Mark the passage"
    >
      <p className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-2.5">
        Keep this passage
      </p>
      <p className="text-xs text-highlight-ink italic font-literata line-clamp-2 bg-highlight rounded-md px-2.5 py-1.5 mb-3 leading-relaxed shadow-[inset_0_0_0_1px_rgb(180_150_70/0.25)]">
        &ldquo;{sel.text}&rdquo;
      </p>
      <Textarea
        rows={2}
        placeholder="A thought to keep with it (optional)…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        autoFocus
      />
      <div className="flex items-center gap-2 mt-3.5">
        <div
          className="flex items-center gap-2"
          role="radiogroup"
          aria-label="Highlight colour"
        >
          {(Object.keys(SWATCH) as AnnotationColor[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`${c} highlight`}
              onClick={() => setColor(c)}
              className={cx(
                "w-7 h-7 rounded-full border-2 transition-transform press",
                color === c
                  ? "border-mist-100 scale-110"
                  : "border-transparent hover:scale-105",
              )}
              style={{ background: SWATCH[c] }}
            />
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="gold"
          onClick={() => onSave(note.trim(), color)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/* ── tools (shared by the desktop rail and the mobile strip) ── */

function DeskTools({
  sizeStep,
  onSize,
  focus,
  onFocus,
}: {
  sizeStep: number;
  onSize: (s: number) => void;
  focus: boolean;
  onFocus: (f: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <p className="text-[9px] font-body tracking-[0.22em] uppercase text-mist-600 mb-1.5">
          Type size
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Type size">
          {SIZES.map((px, i) => (
            <button
              key={px}
              type="button"
              aria-pressed={sizeStep === i}
              aria-label={`Text size ${px} pixels`}
              onClick={() => onSize(i)}
              className={cx(
                "flex h-9 w-9 items-center justify-center rounded-lg border font-display transition-colors",
                sizeStep === i
                  ? "border-gold-700/50 bg-gold-500/15 text-gold-300"
                  : "border-ink-600 text-mist-400 hover:text-mist-200",
              )}
            >
              <span style={{ fontSize: 11 + i * 3 }} className="leading-none">
                A
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-body tracking-[0.22em] uppercase text-mist-600 mb-1.5">
          Focus
        </p>
        <button
          type="button"
          aria-pressed={focus}
          aria-label="Focus mode"
          onClick={() => onFocus(!focus)}
          className={cx(
            "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
            focus
              ? "border-gold-700/50 bg-gold-500/15 text-gold-300"
              : "border-ink-600 text-mist-400 hover:text-mist-200",
          )}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ── the marks ledger (desktop rail + mobile strip) ── */

function MarksLedger({
  marks,
  onDelete,
}: {
  marks: DemoMark[];
  onDelete: (id: string) => void;
}) {
  if (marks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-600/70 bg-ink-800/40 p-4">
        <p className="text-[12px] leading-relaxed text-mist-500">
          Nothing kept yet. Select any passage on the page — highlight it, or
          leave a thought in the margin.
        </p>
      </div>
    );
  }
  return (
    <ul
      className="space-y-2 max-h-72 overflow-y-auto pr-1"
      aria-label="Your marks in this excerpt"
    >
      {marks.map((m) => (
        <li
          key={m.id}
          className="relative rounded-lg border border-ink-700/70 bg-ink-850/80 pl-3.5 pr-8 py-2.5"
        >
          <span
            className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
            style={{ background: SWATCH[m.color] ?? SWATCH.gold }}
            aria-hidden
          />
          <p className="font-literata text-[12.5px] italic leading-snug text-mist-200 line-clamp-2">
            &ldquo;{m.text}&rdquo;
          </p>
          {m.note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-gold-300/90">
              <PenNib className="w-3 h-3 mt-0.5 shrink-0 text-gold-500" />
              {m.note}
            </p>
          )}
          <p className="mt-1.5 font-mono text-[9px] tracking-[0.14em] uppercase text-mist-600">
            {CHAPTERS[m.chapter]?.kicker ?? "Excerpt"} · ¶{m.para + 1}
            {m.note ? " · note" : ""}
          </p>
          <button
            type="button"
            onClick={() => onDelete(m.id)}
            aria-label={`Remove mark: ${m.text.slice(0, 40)}`}
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md text-mist-600 hover:text-danger-400 hover:bg-ink-750 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── the desk ── */

export default function ReaderDesk() {
  const [chapter, setChapter] = useState(0);
  const [sizeStep, setSizeStep] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [focusPara, setFocusPara] = useState(0);
  const [marks, setMarks] = useState<DemoMark[]>([]);
  const [sel, setSel] = useState<SelInfo | null>(null);
  /* `ready` flips to true only after the restored chapter/marks have
     COMMITTED — the persist effect is gated on it, so the first mount
     pass can never write the initial (empty) state over stored data. */
  const [ready, setReady] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  /* restore persisted desk (chapter + marks) once, on mount */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          chapter?: unknown;
          marks?: unknown;
        };
        if (
          typeof saved.chapter === "number" &&
          saved.chapter >= 0 &&
          saved.chapter < CHAPTERS.length
        )
          setChapter(saved.chapter);
        if (Array.isArray(saved.marks))
          setMarks(
            (saved.marks as DemoMark[]).filter(
              (m) =>
                m &&
                typeof m.id === "string" &&
                typeof m.chapter === "number" &&
                typeof m.para === "number" &&
                typeof m.start === "number" &&
                typeof m.end === "number" &&
                typeof m.text === "string" &&
                typeof m.note === "string",
            ),
          );
      }
    } catch {
      /* corrupted demo state — start clean */
    }
    setReady(true);
  }, []);

  /* persist on every change, but only once the restore has committed */
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ chapter, marks }));
    } catch {
      /* storage unavailable — the demo still works in-memory */
    }
  }, [chapter, marks, ready]);

  const refreshSel = useCallback(() => {
    /* while the popover holds focus (typing a note, choosing a colour),
       a collapsed document selection must not tear it down. */
    if (popoverRef.current?.contains(document.activeElement)) return;
    const next = readSelection();
    setSel((prev) => {
      if (!next) return null;
      if (
        prev &&
        prev.chapter === next.chapter &&
        prev.para === next.para &&
        prev.start === next.start &&
        prev.end === next.end &&
        Math.abs(prev.top - next.top) < 1
      )
        return prev;
      return next;
    });
  }, []);

  /* one debounced selectionchange listener drives the popover: mouse,
     touch handles and keyboard selection all arrive here. */
  useEffect(() => {
    let timer: number | null = null;
    const onChange = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refreshSel, 220);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshSel]);

  /* keep the popover anchored while the page scrolls or resizes */
  useEffect(() => {
    if (!sel) return;
    window.addEventListener("scroll", refreshSel, { passive: true });
    window.addEventListener("resize", refreshSel);
    return () => {
      window.removeEventListener("scroll", refreshSel);
      window.removeEventListener("resize", refreshSel);
    };
  }, [sel, refreshSel]);

  /* chapter is clamped to [0, CHAPTERS.length-1] by goto(); the fallback
     only exists to satisfy the compiler's index-access check. */
  const ch = CHAPTERS[chapter] ?? CHAPTERS[0]!;
  const sortedMarks = useMemo(
    () =>
      [...marks].sort(
        (a, b) =>
          a.chapter - b.chapter || a.para - b.para || a.start - b.start,
      ),
    [marks],
  );
  const highlights = marks.filter((m) => !m.note).length;
  const notes = marks.filter((m) => m.note).length;

  const goto = (i: number) => {
    const next = Math.max(0, Math.min(CHAPTERS.length - 1, i));
    setChapter(next);
    setFocusPara(0);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveMark = (note: string, color: AnnotationColor) => {
    if (!sel) return;
    /* a new mark replaces any mark it overlaps — the same rule a
       physical highlighter follows on paper. */
    setMarks((prev) => [
      ...prev.filter(
        (m) =>
          !(
            m.chapter === sel.chapter &&
            m.para === sel.para &&
            m.start < sel.end &&
            sel.start < m.end
          ),
      ),
      {
        id: uid("demoMark"),
        chapter: sel.chapter,
        para: sel.para,
        start: sel.start,
        end: sel.end,
        text: sel.text,
        note,
        color,
      },
    ]);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const deleteMark = (id: string) =>
    setMarks((prev) => prev.filter((m) => m.id !== id));

  const clearMarks = () => {
    setMarks([]);
    toast("info", "Demo marks cleared.");
  };

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col md:flex-row gap-4 md:gap-5 items-stretch">
        {/* ── left: the table of contents — every entry is live ── */}
        <aside className="hidden md:flex md:w-52 lg:w-56 shrink-0 flex-col panel rounded-xl overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-ink-700/50">
            <p className="font-display font-medium text-xl text-mist-100 leading-tight">
              Meditations
            </p>
            <p className="mt-1 text-[11px] text-mist-500">Marcus Aurelius</p>
            <p className="mt-1.5 font-mono text-[9px] tracking-[0.1em] text-mist-600 uppercase">
              George Long translation
            </p>
          </div>
          <nav
            className="flex-1 px-2.5 py-2 space-y-0.5"
            aria-label="Chapters"
          >
            {CHAPTERS.map((c, i) => {
              const isActive = i === chapter;
              return (
                <button
                  key={c.title}
                  type="button"
                  onClick={() => goto(i)}
                  aria-current={isActive ? "true" : undefined}
                  className={cx(
                    "relative w-full flex items-baseline gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    isActive ? "bg-ink-800" : "hover:bg-ink-800/60",
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-gold-500"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cx(
                      "font-mono text-[10px] tabular-nums shrink-0",
                      isActive ? "text-gold-400" : "text-mist-600",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cx(
                      "font-display text-[14px] leading-snug",
                      isActive ? "text-gold-300" : "text-mist-400",
                    )}
                  >
                    {c.title}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="px-5 py-4 border-t border-ink-700/50">
            <p
              className="flex items-center gap-2 text-[9px] font-body tracking-[0.18em] uppercase text-mist-600"
              aria-live="polite"
            >
              <Highlighter className="w-3 h-3 text-gold-500 shrink-0" />
              {highlights} {highlights === 1 ? "highlight" : "highlights"} ·{" "}
              {notes} {notes === 1 ? "note" : "notes"}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[9px] font-mono text-mist-700">
                kept on this device
              </span>
              {marks.length > 0 && (
                <button
                  type="button"
                  onClick={clearMarks}
                  className="text-[9px] font-mono uppercase tracking-[0.14em] text-mist-500 hover:text-danger-400 transition-colors"
                >
                  clear
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ── center: the page — a live excerpt, not a picture of one ── */}
        <div className="paper relative rounded-lg flex-1 min-w-0 p-6 sm:p-8 lg:p-10">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <span className="text-[10px] font-body tracking-[0.24em] uppercase text-paper-ink-soft">
              Meditations · Books I–V
            </span>
            <span className="text-[10px] font-body tracking-[0.24em] uppercase text-paper-ink-soft tabular-nums">
              Chapter {chapter + 1} of {CHAPTERS.length}
            </span>
          </div>

          {/* mobile chapter strip (the TOC rail is md+) */}
          <div className="md:hidden mb-2 flex gap-1.5 overflow-x-auto px-0.5 pb-1">
            {CHAPTERS.map((c, i) => (
              <button
                key={c.title}
                type="button"
                aria-current={i === chapter ? "true" : undefined}
                onClick={() => goto(i)}
                className={cx(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-mono transition-colors",
                  i === chapter
                    ? "border-gold-600/60 bg-gold-500/15 text-paper-ink"
                    : "border-paper-300 text-paper-ink-soft",
                )}
              >
                {String(i + 1).padStart(2, "0")} {c.title}
              </button>
            ))}
          </div>

          <div className="gold-rule mb-6" aria-hidden />
          <p className="text-[10px] font-body font-medium uppercase tracking-[0.22em] text-gold-700 mb-2">
            {ch.kicker}
          </p>
          <h3 className="font-display font-medium text-2xl sm:text-[1.7rem] text-paper-ink leading-snug">
            {ch.title}
          </h3>

          <div
            className="mt-6 font-literata text-paper-ink cursor-text"
            style={{
              fontSize: `${SIZES[sizeStep]}px`,
              lineHeight: 1.85,
              transition: "font-size 0.25s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {ch.paras.map((text, pi) => {
              const paraMarks = marks.filter(
                (m) => m.chapter === chapter && m.para === pi,
              );
              const dim = !focusMode
                ? 1
                : Math.abs(focusPara - pi) === 0
                  ? 1
                  : Math.abs(focusPara - pi) === 1
                    ? 0.45
                    : 0.22;
              return (
                <p
                  key={pi}
                  data-demo-c={chapter}
                  data-demo-p={pi}
                  onMouseEnter={() => focusMode && setFocusPara(pi)}
                  className={cx(
                    "mb-4 transition-opacity duration-500",
                    pi === 0 &&
                      paraMarks.length === 0 &&
                      "first-letter:font-display first-letter:float-left first-letter:text-5xl first-letter:leading-[0.85] first-letter:pr-2.5 first-letter:text-paper-ink",
                  )}
                  style={{ opacity: dim }}
                >
                  {renderMarked(text, paraMarks)}
                </p>
              );
            })}
          </div>

          {/* chapter navigation, like the reader's */}
          <div className="mt-8 pt-5 border-t border-paper-200">
            <div className="h-0.5 rounded-full bg-paper-200 overflow-hidden mb-4">
              <div
                className="h-full rounded-full bg-gold-600 transition-[width] duration-500"
                style={{
                  width: `${((chapter + 1) / CHAPTERS.length) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goto(chapter - 1)}
                disabled={chapter === 0}
                className={cx(
                  "group inline-flex items-center gap-2 rounded-lg px-3 py-2 min-h-11 text-left transition-colors",
                  chapter === 0
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-paper-100",
                )}
              >
                <CaretLeft className="w-4 h-4 text-paper-ink-soft shrink-0" />
                <span>
                  <span className="block text-[9px] font-body tracking-[0.14em] uppercase text-paper-ink-soft">
                    Previous
                  </span>
                  <span className="block font-display text-[14px] text-paper-ink leading-snug max-w-36 truncate">
                    {chapter > 0 ? (CHAPTERS[chapter - 1]?.title ?? "Start") : "Start"}
                  </span>
                </span>
              </button>
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-ink-soft tabular-nums shrink-0">
                {String(chapter + 1).padStart(2, "0")} /{" "}
                {String(CHAPTERS.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => goto(chapter + 1)}
                disabled={chapter === CHAPTERS.length - 1}
                className={cx(
                  "group inline-flex items-center gap-2 rounded-lg px-3 py-2 min-h-11 text-right transition-colors",
                  chapter === CHAPTERS.length - 1
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-paper-100",
                )}
              >
                <span>
                  <span className="block text-[9px] font-body tracking-[0.14em] uppercase text-paper-ink-soft">
                    Next
                  </span>
                  <span className="block font-display text-[14px] text-paper-ink leading-snug max-w-36 truncate">
                    {chapter < CHAPTERS.length - 1
                      ? (CHAPTERS[chapter + 1]?.title ?? "End")
                      : "End"}
                  </span>
                </span>
                <CaretRight className="w-4 h-4 text-paper-ink-soft shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* ── right: the margin rail — tools + your kept passages ── */}
        <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col panel rounded-xl p-4 gap-5">
          <DeskTools
            sizeStep={sizeStep}
            onSize={setSizeStep}
            focus={focusMode}
            onFocus={setFocusMode}
          />
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <p className="text-[9px] font-body tracking-[0.22em] uppercase text-mist-600">
                The margin
              </p>
              {marks.length > 0 && (
                <button
                  type="button"
                  onClick={clearMarks}
                  className="text-[9px] font-mono uppercase tracking-[0.14em] text-mist-500 hover:text-danger-400 transition-colors"
                >
                  clear all
                </button>
              )}
            </div>
            <MarksLedger marks={sortedMarks} onDelete={deleteMark} />
          </div>
        </aside>
      </div>

      {/* mobile + tablet: tools and the margin live under the page */}
      <div className="lg:hidden panel rounded-xl p-4 flex flex-col gap-4">
        <DeskTools
          sizeStep={sizeStep}
          onSize={setSizeStep}
          focus={focusMode}
          onFocus={setFocusMode}
        />
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <p className="text-[9px] font-body tracking-[0.22em] uppercase text-mist-600">
              The margin
            </p>
            {marks.length > 0 && (
              <button
                type="button"
                onClick={clearMarks}
                className="text-[9px] font-mono uppercase tracking-[0.14em] text-mist-500 hover:text-danger-400 transition-colors"
              >
                clear all
              </button>
            )}
          </div>
          <MarksLedger marks={sortedMarks} onDelete={deleteMark} />
        </div>
      </div>

      {/* the annotation popover */}
      {sel && (
        <MarkPopover
          sel={sel}
          rootRef={popoverRef}
          onSave={saveMark}
          onClose={() => {
            setSel(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
