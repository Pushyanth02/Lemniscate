"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import {
  UploadSimple,
  Books,
  ArrowRight,
  BookOpen,
  ChatCircleDots,
  ChartBar,
  PenNib,
  Clock,
  CaretRight,
  Key,
  X,
  Sparkle,
  ArrowUpRight,
  Highlighter,
  Info,
  Shuffle,
  Link,
  LockSimple,
  Gift,
} from "@phosphor-icons/react";
import { useNav, usePrefs, useShallow } from "../lib/store";
import { useDocuments, useActivity, useQuery, useDocContent } from "../lib/data";
import { idbLatestByComposite, getUserId } from "../lib/db";
import { CARD_QUOTES, useSessionPicks } from "../lib/quotes";
import { aiConfigured } from "../lib/ai";
import { fmtWords, pct, timeAgo } from "../lib/utils";
import {
  Button,
  IconBtn,
  ProgressRing,
  Skeleton,
  Badge,
  Reveal,
} from "../components/ui";
import { CoverArt, ActivityLine, LazyNumberFlow } from "../components/bits";
import type { AnnotationRow, DocumentRow } from "../lib/types";

const today = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

function chapterOf(doc: DocumentRow, chunkCounts: number[]): number {
  let acc = 0;
  for (let i = 0; i < chunkCounts.length; i++) {
    acc += chunkCounts[i] ?? 0;
    if (doc.lastChunkIndex < acc) return i;
  }
  return Math.max(0, chunkCounts.length - 1);
}

function minutesLeft(doc: DocumentRow): number {
  return Math.max(
    1,
    Math.round(((100 - doc.readingProgress) / 100) * (doc.wordCount / 230)),
  );
}

/** Local calendar key for grouping activity by day. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Heatmap cell colors, dim to bright as the day gets busier. */
function heatClass(count: number): string {
  if (count <= 0) return "bg-ink-750";
  if (count === 1) return "bg-gold-600";
  if (count === 2) return "bg-gold-500";
  return "bg-gold-400";
}

/* ────────────────────────────────────────────────────────────
   CompanionWhisper — a warm, dismissible invitation to connect
   an OpenRouter key. Shown on the Dashboard when no key is set
   and the user hasn't dismissed it. Persists dismissal in
   localStorage so it doesn't nag users who already know.
   ──────────────────────────────────────────────────────────── */
const WHISPER_DISMISSED_KEY = "lemniscate:whisper-dismissed";

function CompanionWhisper() {
  const go = useNav((s) => s.go);
  const [dismissed, setDismissed] = useState(true);
  const [connected, setConnected] = useState(false);

  /* Read the live key status + dismissal flag after mount — avoids
     SSR/hydration mismatches since both depend on browser storage. */
  useEffect(() => {
    setDismissed(localStorage.getItem(WHISPER_DISMISSED_KEY) === "1");
    setConnected(aiConfigured());
  }, []);

  /* Re-check the key when the Dashboard regains focus (e.g. the user
     set a key in Settings, navigated back, and the component remounts). */
  useEffect(() => {
    const onFocus = () => setConnected(aiConfigured());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (connected || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(WHISPER_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <Reveal delay={0.04}>
      <div className="relative mt-6 sm:mt-8 overflow-hidden rounded-[1.5rem] border border-gold-700/40 hover:border-gold-600/60 transition-colors shadow-glow-gold">
        {/* ambient gradient backdrop — warm, inviting, never clinical */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{
            background:
              "linear-gradient(120deg, rgba(211,166,81,0.10) 0%, rgba(86,147,131,0.07) 50%, rgba(213,133,79,0.08) 100%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row gap-5 sm:gap-6 p-5 sm:p-6">
          {/* companion avatars — Luma, Ouro, Ankaa whispering together */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 shrink-0">
            <div className="flex -space-x-2">
              {[
                { c: "#d3a651", n: "L" },
                { c: "#569383", n: "O" },
                { c: "#d5854f", n: "A" },
              ].map((b, i) => (
                <span
                  key={b.n}
                  className="w-9 h-9 rounded-full border-2 border-ink-900 flex items-center justify-center font-display text-xs text-ink-950 font-semibold shadow-md"
                  style={{ background: b.c, zIndex: 3 - i }}
                  aria-hidden
                >
                  {b.n}
                </span>
              ))}
            </div>
            <span className="text-[11px] font-body text-mist-600 sm:mt-1">
              A whisper from the margins
            </span>
          </div>

          {/* message body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2.5 mb-2">
              <Sparkle className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <h2 className="font-display font-semibold text-lg sm:text-xl text-mist-100 leading-snug">
                The companions are here, but they&apos;re whispering.
              </h2>
            </div>
            <p className="text-sm text-mist-400 leading-relaxed max-w-2xl">
              Luma, Ouro and Ankaa are answering you right now with the
              grounded <span className="text-mist-300">Anchor engine</span>:
              extractive, on-device, always private. Connect a free provider
              (OpenRouter, Gemini, Grok, Groq) and they&apos;ll{" "}
              <span className="text-gold-300">speak with live voices</span>:
              streaming answers, seminar-grade study sets, and long-form
              drafts. It takes a minute, costs nothing to try, and the key
              stays only in this tab.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="gold"
                size="sm"
                onClick={() => go("settings", { sub: "ai" })}
              >
                <Key className="w-3.5 h-3.5" />
                Connect a key
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
              <button
                onClick={dismiss}
                className="text-xs font-body text-mist-500 hover:text-mist-300 transition-colors min-h-9 px-2"
              >
                I know, hide this
              </button>
            </div>
          </div>

          {/* dismiss X */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-mist-600 hover:text-mist-200 hover:bg-ink-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────
   Section header — serif title + "See all" text link.
   ──────────────────────────────────────────────────────────── */
function SectionHead({
  title,
  onSeeAll,
  seeAllLabel = "See all",
}: {
  title: string;
  onSeeAll: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <h2 className="font-display font-semibold text-[1.4rem] sm:text-2xl text-mist-100">
        {title}
      </h2>
      <button
        onClick={onSeeAll}
        className="text-xs font-body font-medium text-gold-400 hover:text-gold-300 inline-flex items-center gap-1.5 transition-colors min-h-10 shrink-0"
      >
        {seeAllLabel}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Hero banner — the dusk-window photo, the greeting, the
   floating cream quote card (a borrowed line, different every
   visitor and every sitting).
   ──────────────────────────────────────────────────────────── */
function HeroBanner({
  name,
  connected,
  onUpload,
  onLibrary,
}: {
  name: string;
  connected: boolean;
  onUpload: () => void;
  onLibrary: () => void;
}) {
  const eyebrow = name
    ? `Welcome back, ${name}`
    : "Welcome to your reading room";
  const picks = useSessionPicks(CARD_QUOTES, 1, 1);
  const quote = picks?.[0];
  return (
    <section aria-label="Welcome banner" className="relative">
      <div className="relative hairline rounded-2xl overflow-hidden min-h-[24rem] sm:min-h-[23rem] lg:min-h-[24rem] shadow-float">
        <Image
          src="/hero-window.webp"
          alt="A stack of books resting on a wooden desk beside a window at dusk"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* left-to-right darkening so the type stays legible over the photo */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-950/70 to-transparent"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink-950/50 via-transparent to-ink-950/25"
          aria-hidden
        />
        <div className="relative h-full flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <div className="max-w-2xl">
            <p className="text-[11px] font-body font-medium uppercase tracking-[0.18em] text-mist-300">
              {eyebrow}
              <span className="text-mist-500"> · {today()}</span>
            </p>
            <h1 className="mt-4 font-display font-semibold text-[2.6rem] sm:text-5xl lg:text-[3.4rem] leading-[1.05] text-mist-100 tracking-tight">
              Your reading space, <span className="italic">rebuilt.</span>
            </h1>
            <p className="mt-4 text-sm sm:text-[15px] text-mist-300 leading-relaxed max-w-xl">
              Import your documents, ask the AI in the margins, and keep what
              matters. Every file stays on this device.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="gold" size="lg" onClick={onUpload}>
                <UploadSimple className="w-4 h-4" />
                Add a document
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={onLibrary}
                className="bg-ink-950/50 backdrop-blur-sm"
              >
                <Books className="w-4 h-4" />
                Open library
              </Button>
              <Badge
                tone={connected ? "ok" : "muted"}
                className="hidden sm:inline-flex"
              >
                <ChatCircleDots className="w-3 h-3" />
                {connected ? "companions online" : "companions offline"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
      {/* floating cream quote card — rides the banner's right edge, over
          the dusk-window photo (desktop only). A borrowed line, varied per
          visitor and session. */}
      <aside className="hidden lg:flex flex-col justify-center absolute right-6 top-1/2 -translate-y-1/2 w-60 xl:w-72 xl:right-10 paper rounded-xl p-5 xl:p-6 min-h-[8.5rem]">
        {quote ? (
          <>
            <p className="font-display italic text-[15px] xl:text-base leading-relaxed text-paper-ink">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="mt-3 text-[10px] font-body font-medium uppercase tracking-[0.2em] text-paper-ink-soft">
              {quote.source}
            </p>
          </>
        ) : (
          <span className="block" aria-hidden />
        )}
      </aside>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Glance tile — one compact real-number stat.
   ──────────────────────────────────────────────────────────── */
function GlanceTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  /* Plain numeric values animate (same contract as StatTile); formatted
     strings like "18.2k" stay static text. */
  const numeric = Number(value);
  const isCount = value.trim() !== "" && Number.isFinite(numeric);
  return (
    <div className="bg-ink-850 hairline rounded-xl p-4 sm:p-5 min-w-0">
      <p className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500">
        {label}
      </p>
      <p className="font-display font-semibold text-2xl sm:text-[1.7rem] leading-none text-mist-100 tabular-nums mt-2.5 truncate">
        {isCount ? <LazyNumberFlow value={numeric} /> : value}
      </p>
      {sub && <p className="text-[11px] text-mist-500 mt-1.5">{sub}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Continue-reading card — one open book, mid-sentence.
   ──────────────────────────────────────────────────────────── */
function ContinueCard({
  doc,
  onOpen,
  onLibrary,
}: {
  doc: DocumentRow;
  onOpen: (id: string) => void;
  onLibrary: () => void;
}) {
  // Content is fetched per continue-reading card (small list) since the
  // v5 metadata/content split — the library list itself stays lightweight.
  const content = useDocContent(doc.id);
  const chunkCounts =
    content.data?.chapters.map((c) => c.chunks.length) ??
    Array.from({ length: doc.chapterCount }, () => 0);
  const chapterTitle =
    content.data?.chapters[chapterOf(doc, chunkCounts)]?.title?.trim() ?? "";
  return (
    <article className="bg-ink-850 hairline rounded-xl p-4 sm:p-5 hover-lift">
      <div className="flex gap-4 sm:gap-5">
        <button
          onClick={() => onOpen(doc.id)}
          className="shrink-0 focus-visible:outline-none group/cover"
          aria-label={`Continue reading ${doc.title}`}
        >
          <CoverArt
            doc={doc}
            className="w-16 sm:w-20 h-24 sm:h-30 rounded-lg shadow-lift transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/cover:-translate-y-1"
          />
        </button>
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="font-body font-medium text-[15px] text-mist-100 truncate">
            {doc.title}
          </h3>
          <p className="text-xs text-mist-500 mt-0.5 truncate">
            {doc.author || doc.sourceType.toUpperCase()}
          </p>
          <p className="mt-2 text-xs text-mist-400 flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 shrink-0 text-gold-400" aria-hidden />
            <span className="truncate">
              Chapter {chapterOf(doc, chunkCounts) + 1} of {doc.chapterCount}
              {chapterTitle ? ` · ${chapterTitle}` : ""} · {minutesLeft(doc)}{" "}
              min left
            </span>
          </p>
          <div className="mt-auto pt-3">
            <div className="flex items-center gap-2.5">
              <div
                className="h-0.5 flex-1 rounded-full bg-ink-700 overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(doc.readingProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${doc.title} progress`}
              >
                <div
                  className="h-full rounded-full bg-gold-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, doc.readingProgress)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-mist-500 tabular-nums shrink-0">
                {Math.round(doc.readingProgress)}%
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="gold" size="sm" onClick={() => onOpen(doc.id)}>
                <BookOpen className="w-3.5 h-3.5" />
                Continue reading
              </Button>
              <IconBtn label="Open in library" onClick={onLibrary}>
                <Info className="w-4 h-4" />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────
   Feature tile — the static "why" row.
   ──────────────────────────────────────────────────────────── */
function FeatureTile({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-ink-850 hairline rounded-xl p-5">
      <span className="w-10 h-10 rounded-full bg-gold-500/10 border border-gold-700/40 flex items-center justify-center text-gold-400">
        <Icon className="w-5 h-5" />
      </span>
      <h3 className="mt-4 text-sm font-body font-medium text-mist-100">
        {title}
      </h3>
      <p className="mt-1.5 text-xs sm:text-[13px] text-mist-400 leading-relaxed">
        {body}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Quick-action row.
   ──────────────────────────────────────────────────────────── */
function ActionRow({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-ink-750/60 transition-colors group disabled:opacity-40 disabled:pointer-events-none"
    >
      <span className="w-8 h-8 rounded-lg border border-ink-600/70 bg-ink-800 flex items-center justify-center text-gold-400 shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 text-[13px] text-mist-300 group-hover:text-mist-100 transition-colors min-w-0 truncate">
        {label}
      </span>
      <CaretRight className="w-3.5 h-3.5 text-mist-600 shrink-0" aria-hidden />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
   Dashboard
   ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { go, openDoc } = useNav(
    useShallow((s) => ({ go: s.go, openDoc: s.openDoc })),
  );
  const docsQ = useDocuments();
  const actQ = useActivity(500);
  // OpenRouter key status — synchronous peek at the in-memory key set via
  // `setSessionKey()` (typically from Settings). When no key is set, the
  // companions fall back to the grounded Anchor engine.
  const connected = aiConfigured();
  const name = usePrefs((s) => s.prefs.profile.name.trim());

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const ready = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);
  const current = useMemo(
    () =>
      ready
        .filter((d) => d.readingProgress > 0 && d.readingProgress < 99.5)
        .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)),
    [ready],
  );
  const upNext = useMemo(
    () =>
      ready
        .filter((d) => d.readingProgress === 0)
        .sort((a, b) => b.createdAt - a.createdAt),
    [ready],
  );
  const finished = useMemo(
    () => ready.filter((d) => d.readingProgress >= 99.5),
    [ready],
  );
  const totalWords = useMemo(
    () => ready.reduce((a, d) => a + d.wordCount, 0),
    [ready],
  );
  const totalChapters = useMemo(
    () => ready.reduce((a, d) => a + d.chapterCount, 0),
    [ready],
  );

  /* Latest marginalia — the three most recent annotations across the
     whole library, straight from the annotations store (DB v6: a
     descending composite-index cursor — three rows, not the store). */
  const notesQ = useQuery(
    () =>
      idbLatestByComposite<AnnotationRow>(
        "annotations",
        "by_user_ts",
        getUserId(),
        3,
      ),
    [],
    ["annotations"],
  );
  const notes = notesQ.data ?? [];

  /* a borrowed line for the empty drawer — offset 2 so the hero page
     and this drawer never repeat a line in one sitting */
  const borrowedPicks = useSessionPicks(CARD_QUOTES, 1, 2);
  const borrowedQuote = borrowedPicks?.[0];

  /* Reading-days ledger from real activity rows: per-day counts, the
     current streak, and days logged this calendar year. */
  const activity = useMemo(() => actQ.data ?? [], [actQ.data]);
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activity) {
      const k = dayKey(a.createdAt);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [activity]);
  const streak = useMemo(() => {
    const has = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offsetDays);
      return (dayCounts.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? 0) > 0;
    };
    if (!has(0) && !has(1)) return 0;
    let n = has(0) ? 0 : 1;
    while (has(n)) n++;
    return n;
  }, [dayCounts]);
  const daysThisYear = useMemo(() => {
    // Distinct calendar days, not activity events: five actions on one day
    // are ONE day read. Same keying as the heatmap above.
    const year = new Date().getFullYear();
    const days = new Set<string>();
    for (const a of activity) {
      if (new Date(a.createdAt).getFullYear() === year)
        days.add(dayKey(a.createdAt));
    }
    return days.size;
  }, [activity]);
  /* 13 x 8 heatmap cells over the last 104 days, oldest first. */
  const heatCells = useMemo(() => {
    const cells: number[] = [];
    for (let i = 103; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      cells.push(
        dayCounts.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? 0,
      );
    }
    return cells;
  }, [dayCounts]);

  const goalPct = pct(finished.length, ready.length);
  const shelf = useMemo(
    () => [...current, ...upNext, ...finished].slice(0, 6),
    [current, upNext, finished],
  );
  const randomDoc = () => ready[Math.floor(Math.random() * ready.length)];

  if (docsQ.loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <Skeleton className="h-72 sm:h-80 rounded-2xl mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* ------- hero banner: the dusk window ------- */}
      <Reveal>
        <HeroBanner
          name={name}
          connected={connected}
          onUpload={() => go("upload")}
          onLibrary={() => go("library")}
        />
      </Reveal>

      {/* warm invitation to connect an OpenRouter key — dismissible */}
      <div className="relative z-10">
        <CompanionWhisper />
      </div>

      {/* ------- glance: the shelf in four numbers ------- */}
      <Reveal delay={0.05} className="mt-8 sm:mt-10 lg:mt-12">
        <dl
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
          aria-label="Library at a glance"
        >
          <GlanceTile
            label="Documents"
            value={String(ready.length)}
            sub={`${finished.length} finished`}
          />
          <GlanceTile
            label="Words shelved"
            value={fmtWords(totalWords).replace(" words", "")}
            sub="on this device"
          />
          <GlanceTile
            label="Chapters"
            value={String(totalChapters)}
            sub="across the shelf"
          />
          <GlanceTile
            label="Reading streak"
            value={String(streak)}
            sub={streak === 1 ? "day in a row" : "days in a row"}
          />
        </dl>
      </Reveal>

      {/* ------- continue reading: the open books ------- */}
      <Reveal delay={0.05} className="mt-12 sm:mt-14">
        <section aria-label="Continue reading">
          <SectionHead title="Continue reading" onSeeAll={() => go("library")} />
          {current.length > 0 ? (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {current.slice(0, 3).map((d) => (
                <ContinueCard
                  key={d.id}
                  doc={d}
                  onOpen={openDoc}
                  onLibrary={() => go("library")}
                />
              ))}
            </div>
          ) : (
            <div className="bg-ink-850 hairline rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
              <div className="min-w-0 flex-1">
                <p className="font-display italic text-xl sm:text-2xl text-mist-100">
                  {ready.length > 0
                    ? "Everything on the shelf is finished."
                    : "Nothing open yet"}
                </p>
                <p className="text-sm text-mist-500 mt-2 leading-relaxed">
                  {ready.length > 0
                    ? "Pick something from your library below and settle in."
                    : "Add a document and it will wait for you here, mid-sentence."}
                </p>
              </div>
              {ready.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => go("library")}
                  className="shrink-0"
                >
                  <Books className="w-4 h-4" />
                  Browse library
                </Button>
              ) : (
                <Button
                  variant="gold"
                  onClick={() => go("upload")}
                  className="shrink-0"
                >
                  <UploadSimple className="w-4 h-4" />
                  Add a document
                </Button>
              )}
            </div>
          )}
        </section>
      </Reveal>

      {/* ------- your library: the shelf at a glance ------- */}
      <Reveal delay={0.05} className="mt-12 sm:mt-14">
        <section aria-label="Your library">
          <SectionHead title="Your library" onSeeAll={() => go("library")} />
          {shelf.length === 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <p className="font-display italic text-lg sm:text-xl text-mist-300 text-center sm:text-left flex-1 leading-relaxed">
                The first book is the quietest guest. Add a PDF, an EPUB or a
                link, and the shelf builds itself from there.
              </p>
              <button
                onClick={() => go("upload")}
                className="shrink-0 w-36 aspect-[2/3] rounded-lg border border-dashed border-ink-600 hover:border-gold-700 transition-colors flex flex-col items-center justify-center gap-2.5 text-mist-500 hover:text-gold-300 group"
                aria-label="Add a document"
              >
                <UploadSimple className="w-5 h-5" aria-hidden />
                <span className="text-[11px] font-body text-center px-3 leading-snug">
                  Add PDF, EPUB or link
                </span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
              {shelf.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDoc(d.id)}
                  className="group text-left focus-visible:outline-none"
                  aria-label={`Open ${d.title}`}
                >
                  <div className="relative transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-1.5 group-focus-visible:-translate-y-1.5">
                    <CoverArt
                      doc={d}
                      className="w-full aspect-[2/3] rounded-lg shadow-lift"
                    />
                    <div className="absolute inset-x-2 bottom-2">
                      <div className="h-0.5 rounded-full bg-ink-950/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gold-400"
                          style={{ width: `${d.readingProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs font-medium text-mist-300 leading-snug line-clamp-1 group-hover:text-gold-300 transition-colors">
                    {d.title}
                  </p>
                  <p className="text-[10px] text-mist-600 mt-0.5 line-clamp-1">
                    {d.author || d.sourceType.toUpperCase()}
                  </p>
                </button>
              ))}
              <button
                onClick={() => go("upload")}
                className="group rounded-lg border border-dashed border-ink-600 hover:border-gold-700 transition-colors aspect-[2/3] flex flex-col items-center justify-center gap-2.5 text-mist-500 hover:text-gold-300"
                aria-label="Add a document"
              >
                <UploadSimple className="w-5 h-5" aria-hidden />
                <span className="text-[11px] font-body text-center px-3 leading-snug">
                  Add PDF, EPUB or link
                </span>
              </button>
            </div>
          )}
        </section>
      </Reveal>

      {/* ------- why lemniscate: the quiet promises ------- */}
      <Reveal delay={0.05} className="mt-12 sm:mt-14">
        <section aria-label="Why Lemniscate">
          <SectionHead title="Why Lemniscate" onSeeAll={() => go("landing")} seeAllLabel="About" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureTile
              icon={BookOpen}
              title="Read without friction"
              body="A calm, chapter-aware reader built for long attention, with typography you can tune and nothing blinking at the margins."
            />
            <FeatureTile
              icon={Link}
              title="Your ideas, connected"
              body="Highlights, notes and AI study sets link back to the exact passage, so your thinking compounds instead of scattering."
            />
            <FeatureTile
              icon={LockSimple}
              title="Private by default"
              body="Local-first by design. Your library lives on this device, and provider keys live only in this tab — AI requests send just the excerpts you ask about."
            />
            <FeatureTile
              icon={Gift}
              title="Free models welcome"
              body={
                connected
                  ? "A key is connected, so the companions answer with live models, metered daily."
                  : "Bring a key from OpenRouter, Gemini, Grok or Groq. Free tiers are welcome here."
              }
            />
          </div>
        </section>
      </Reveal>

      {/* ------- widgets: activity, goals, quick actions ------- */}
      <Reveal delay={0.05} className="mt-12 sm:mt-14">
        <section aria-label="Activity, goals and quick actions">
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
            {/* reading activity heatmap */}
            <div className="bg-ink-850 hairline rounded-xl p-5">
              <h3 className="font-display font-semibold text-lg text-mist-100">
                Reading activity
              </h3>
              {activity.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10">
                  <div className="w-12 h-12 rounded-2xl border border-ink-600 bg-ink-800 flex items-center justify-center text-mist-500 mb-3">
                    <ChartBar className="w-5 h-5" />
                  </div>
                  <p className="text-sm text-mist-400">No activity yet.</p>
                  <p className="text-xs text-mist-600 mt-1">
                    Your reading days will gather here.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="mt-4 flex gap-1"
                    role="img"
                    aria-label={`Reading activity over the last ${heatCells.length} days, ${daysThisYear} active days this year`}
                  >
                    {Array.from({ length: 13 }, (_, col) => (
                      <div key={col} className="flex flex-col gap-1">
                        {heatCells
                          .slice(col * 8, col * 8 + 8)
                          .map((count, row) => (
                            <span
                              key={row}
                              className={`w-3 h-3 rounded-[3px] ${heatClass(count)}`}
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-mist-500">
                    {daysThisYear > 0
                      ? `${daysThisYear} ${daysThisYear === 1 ? "day" : "days"} read this year`
                      : "Your reading days will gather here."}
                  </p>
                  <div className="mt-4 pt-4 border-t border-ink-700">
                    <div className="space-y-0.5">
                      {activity.slice(0, 3).map((a) => (
                        <ActivityLine
                          key={a.id}
                          row={a}
                          onOpen={openDoc}
                          dense
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* reading goals donut */}
            <div className="bg-ink-850 hairline rounded-xl p-5 flex flex-col">
              <h3 className="font-display font-semibold text-lg text-mist-100">
                Reading goals
              </h3>
              <div className="flex-1 flex items-center justify-center py-6">
                <ProgressRing
                  value={goalPct}
                  size={140}
                  stroke={10}
                  tone="gold"
                  label={
                    <span className="font-display font-semibold text-[1.8rem] text-mist-100 tabular-nums">
                      {goalPct}%
                    </span>
                  }
                />
              </div>
              <p className="text-center text-xs text-mist-400">
                {ready.length > 0
                  ? `${finished.length} of ${ready.length} finished`
                  : "Nothing on the shelf yet"}
              </p>
              <p className="text-center text-xs text-mist-500 mt-1">
                {current.length > 0
                  ? `${current.length} ${current.length === 1 ? "book is" : "books are"} mid-read`
                  : "Add a book to begin"}
              </p>
            </div>

            {/* quick actions */}
            <div className="bg-ink-850 hairline rounded-xl p-5">
              <h3 className="font-display font-semibold text-lg text-mist-100">
                Quick actions
              </h3>
              <div className="mt-3 -mx-2">
                <ActionRow
                  icon={UploadSimple}
                  label="Add a document"
                  onClick={() => go("upload")}
                />
                <ActionRow
                  icon={Shuffle}
                  label={
                    ready.length > 0 ? "Open a random book" : "No books yet"
                  }
                  disabled={ready.length === 0}
                  onClick={() => {
                    const pick = randomDoc();
                    if (pick) openDoc(pick.id);
                  }}
                />
                <ActionRow
                  icon={ChartBar}
                  label="View insights"
                  onClick={() => go("analytics")}
                />
                <ActionRow
                  icon={PenNib}
                  label="Open the writing desk"
                  onClick={() => go("create")}
                />
              </div>
              <div className="mt-4 pt-4 border-t border-ink-700 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full border border-ink-600 bg-ink-800 flex items-center justify-center text-gold-400 shrink-0">
                  <ChatCircleDots className="w-4 h-4" />
                </span>
                <p className="text-xs text-mist-500 leading-relaxed flex-1 min-w-0">
                  {connected
                    ? "AI key set: companions answer with live models, metered daily."
                    : "Companions run grounded Anchor engines. Add a free provider key for live voices."}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => go("settings", { sub: "ai" })}
                  className="shrink-0"
                >
                  {connected ? "Manage" : "Set up"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ------- notes & marginalia: what you underlined ------- */}
      <Reveal delay={0.05} className="mt-12 sm:mt-14">
        <section aria-label="Notes and marginalia">
          <SectionHead
            title="Notes & marginalia"
            onSeeAll={() => go("history")}
          />
          {notesQ.loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            /* an empty drawer borrows a line from the greats while it
               waits for the first real mark */
            <div className="bg-ink-850 hairline rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
              <figure className="min-w-0 flex-1">
                {borrowedQuote ? (
                  <>
                    <span
                      className="font-display text-4xl text-gold-500/40 leading-none select-none"
                      aria-hidden
                    >
                      &ldquo;
                    </span>
                    <blockquote className="mt-1 font-display italic text-lg sm:text-xl leading-snug text-mist-100">
                      {borrowedQuote.text}
                    </blockquote>
                    <figcaption className="mt-3 text-[10px] font-body tracking-[0.18em] uppercase text-mist-500">
                      Borrowed from {borrowedQuote.source}
                    </figcaption>
                  </>
                ) : (
                  <span className="block h-14" aria-hidden />
                )}
              </figure>
              <div className="shrink-0 lg:w-64 lg:border-l lg:border-ink-700 lg:pl-8">
                <p className="font-display italic text-lg text-mist-100">
                  Your marginalia will live here
                </p>
                <p className="text-sm text-mist-500 mt-2 leading-relaxed">
                  Highlight a passage in the reader, leave a note beside it,
                  and it will surface in this drawer.
                </p>
                <Button
                  variant="ghost"
                  onClick={() => go("library")}
                  className="mt-4"
                >
                  <Books className="w-4 h-4" />
                  Open library
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {notes.map((n, i) => {
                const docTitle =
                  docs.find((d) => d.id === n.documentId)?.title ?? "A document";
                const text = (n.note || n.text).trim();
                return (
                  <button
                    key={n.id}
                    onClick={() => n.documentId && openDoc(n.documentId)}
                    className="bg-ink-850 hairline rounded-xl p-5 text-left hover-lift focus-visible:outline-none"
                    aria-label={`Open note: ${text.slice(0, 60)}`}
                  >
                    <Highlighter
                      className="w-4 h-4 text-gold-500"
                      aria-hidden
                    />
                    <p
                      className={`mt-3 font-display italic text-[15px] leading-relaxed line-clamp-4 ${
                        i === 0
                          ? "bg-highlight text-highlight-ink rounded px-2 py-1 -mx-2"
                          : "text-mist-200"
                      }`}
                    >
                      {text}
                    </p>
                    <p className="mt-4 text-[11px] text-mist-500 flex items-baseline gap-2 min-w-0">
                      <span className="truncate">{docTitle}</span>
                      <span className="text-mist-500 shrink-0">
                        {timeAgo(n.createdAt)}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}
