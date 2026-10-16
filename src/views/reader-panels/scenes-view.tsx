import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  ArrowsClockwise,
  BookOpen,
  CaretLeft,
  CaretRight,
  Columns,
  MapTrifold,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Dialog,
  Progress,
  Segmented,
} from "../../components/ui";
import { toast } from "../../lib/store";
import {
  useScenes,
  useSceneNotes,
  putScenes,
  saveSceneNote,
} from "../../lib/data";
import {
  cinematizeChapter,
  regenerateScene,
  CINEMA_STEPS,
  motifIndex,
  AiUnavailable,
  activeModelFor,
  offlineReasonText,
} from "../../lib/ai";
import {
  AtlasCard,
  MotifStrip,
  SceneSkeleton,
  SourceCompare,
  ThreadLink,
} from "../../components/scene-atlas";
import type { DocWithContent, SceneDraft } from "../../lib/types";
import { cx, clamp } from "../../lib/utils";

/* ================= Scene Atlas ================= */

/** Map a persisted scene row onto the render-side SceneDraft shape (the
 *  row carries every v3 field optionally; absence = legacy scene). */
function rowToDraft(s: {
  title: string;
  mood: string;
  characters: string[];
  body: string;
  setting?: string;
  sensory?: string[];
  movement?: string;
  motifs?: string[];
  anchors?: { quote: string; chunkIndex: number }[];
  thread?: string;
  art?: import("../../lib/types").SceneArt;
  grounded?: boolean;
  engine?: "ankaa" | "anchor";
}): SceneDraft {
  return {
    title: s.title,
    mood: s.mood,
    characters: s.characters,
    body: s.body,
    ...(s.setting !== undefined ? { setting: s.setting } : {}),
    ...(s.sensory !== undefined ? { sensory: s.sensory } : {}),
    ...(s.movement !== undefined ? { movement: s.movement } : {}),
    ...(s.motifs !== undefined ? { motifs: s.motifs } : {}),
    ...(s.anchors !== undefined ? { anchors: s.anchors } : {}),
    ...(s.thread !== undefined ? { thread: s.thread } : {}),
    ...(s.art !== undefined ? { art: s.art } : {}),
    ...(s.grounded !== undefined ? { grounded: s.grounded } : {}),
    ...(s.engine !== undefined ? { engine: s.engine } : {}),
  };
}

export function ScenesView({
  doc,
  chapterIndex,
  onExit,
  onPrev,
  onNext,
  onExitToChunk,
  onAskLuma,
}: {
  doc: DocWithContent;
  chapterIndex: number;
  onExit: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Exit scene mode and scroll the reader to a specific chunk in this
   *  chapter. Anchor “In reader” actions call it with the passage's verified
   *  chunk reference; when absent, the comparison dialog stays inline. */
  onExitToChunk?: (localChunkIdx: number) => void;
  /** Open the companions drawer on Luma with a scene-contextual question. */
  onAskLuma: (question: string) => void;
}) {
  const scenesQ = useScenes(doc.id);
  const notesQ = useSceneNotes(doc.id);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genFrac, setGenFrac] = useState(0);
  const [engine, setEngine] = useState<"model" | "loa" | null>(null);
  const [incoming, setIncoming] = useState<SceneDraft[]>([]);
  const [layout, setLayout] = useState<"scenes" | "split">("scenes");
  const [mobileTab, setMobileTab] = useState<"scenes" | "text">("scenes");
  const [regenOrdinal, setRegenOrdinal] = useState<number | null>(null);
  const [activeMotif, setActiveMotif] = useState<string | null>(null);
  const [compare, setCompare] = useState<{
    ordinal: number;
    anchorIdx: number;
  } | null>(null);
  const genToken = useRef(0);
  const regenToken = useRef(0);
  const autoGen = useRef<Set<number>>(new Set());
  const chapter = doc.contentJson.chapters[chapterIndex];
  const chunks = useMemo(() => chapter?.chunks ?? [], [chapter]);
  const chapterScenes = useMemo(
    () => (scenesQ.data ?? []).filter((s) => s.chapterIndex === chapterIndex),
    [scenesQ.data, chapterIndex],
  );
  const notesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notesQ.data ?? [])
      m.set(`${n.chapterIndex}:${n.ordinal}`, n.note);
    return m;
  }, [notesQ.data]);

  /* Generation is token-guarded: clicking Next/Previous mid-run invalidates
     the in-flight job, so stale results can never land on the wrong chapter,
     and each chapter auto-generates at most once per visit cycle. */
  const generate = useCallback(
    async (silent = false, salt = 0) => {
      const token = ++genToken.current;
      const stale = () => genToken.current !== token;
      setGenerating(true);
      setGenStep(0);
      setGenFrac(0);
      setIncoming([]);
      setCompare(null);
      try {
        const res = await cinematizeChapter(
          doc,
          chapterIndex,
          salt,
          (i, f) => {
            if (!stale()) {
              setGenStep(i);
              setGenFrac(f);
            }
          },
          (s) => {
            if (!stale()) setIncoming((p) => [...p, s]);
          },
        );
        if (stale()) return;
        await putScenes(doc.id, chapterIndex, res.scenes);
        setEngine(res.offline ? "loa" : "model");
        setActiveMotif(null);
        if (!silent)
          toast(
            "success",
            `Mapped “${chapter?.title}” into ${res.scenes.length} scene plate${res.scenes.length === 1 ? "" : "s"}${res.offline ? ` (Anchor engine · ${offlineReasonText(res.reason)})` : ""}.`,
          );
      } catch (e) {
        if (stale()) return;
        toast(
          "error",
          e instanceof AiUnavailable
            ? e.message
            : "The atlas stumbled. Try Regenerate; the Anchor engine will step in.",
        );
      } finally {
        // keep `incoming` until persisted scenes arrive — no skeleton flicker
        if (!stale()) setGenerating(false);
      }
    },
    [doc, chapterIndex, chapter?.title],
  );

  /* Per-scene regenerate: re-runs just one scene's AI call with a fresh salt
     and patches it into the persisted set without touching the others. */
  const regenerateOne = useCallback(
    async (ordinal: number) => {
      if (regenOrdinal !== null || generating) return;
      const token = ++regenToken.current;
      const stale = () => regenToken.current !== token;
      setRegenOrdinal(ordinal);
      try {
        const salt = 1 + Math.floor(Math.random() * 976);
        const scene = await regenerateScene(doc, chapterIndex, ordinal, salt);
        if (stale() || !scene) return;
        // Build the next scene set from whatever is currently on screen
        // (persisted chapterScenes, or the in-flight `incoming` drafts if
        // persistence hasn't landed yet), swap the targeted ordinal, and
        // recommit the whole chapter so putScenes can replace cleanly.
        const base: SceneDraft[] = chapterScenes.length
          ? chapterScenes.map(rowToDraft)
          : incoming;
        const next = base.map((s, i) => (i === ordinal ? scene : s));
        await putScenes(doc.id, chapterIndex, next);
        toast("success", `Scene ${ordinal + 1} rewritten.`);
      } catch (e) {
        if (stale()) return;
        toast(
          "error",
          e instanceof AiUnavailable
            ? e.message
            : "Couldn't regenerate that scene. Try again.",
        );
      } finally {
        if (!stale()) setRegenOrdinal(null);
      }
    },
    [doc, chapterIndex, chapterScenes, incoming, generating, regenOrdinal],
  );

  useEffect(() => {
    if (
      !scenesQ.loading &&
      chapterScenes.length === 0 &&
      !autoGen.current.has(chapterIndex) &&
      !generating
    ) {
      autoGen.current.add(chapterIndex);
      void generate(true, 0);
    }
  }, [
    scenesQ.loading,
    chapterScenes.length,
    chapterIndex,
    generate,
    generating,
  ]);

  // persisted scenes win; freshly landed scenes bridge the refetch gap
  const shown: SceneDraft[] = useMemo(
    () =>
      chapterScenes.length
        ? chapterScenes.map((s) => rowToDraft(s))
        : incoming,
    [chapterScenes, incoming],
  );

  // The chapter's motif index — shared recurring images, explorable.
  const motifs = useMemo(() => motifIndex(shown), [shown]);

  /* Legacy scenes only (pre-atlas rows/caches with no anchors): best-matching
     source chunk by keyword overlap — labelled honestly as an estimate in the
     card. v3 scenes never use this; their passages are verified anchors. */
  const sourceChunkFor = useCallback(
    (scene: SceneDraft): number => {
      if (!chunks.length) return 0;
      const probe = (scene.title + " " + scene.body).toLowerCase();
      const words = Array.from(
        new Set(probe.split(/\W+/).filter((w) => w.length > 4)),
      ).slice(0, 24);
      let best = 0;
      let bestScore = -1;
      chunks.forEach((c, i) => {
        const t = c.text.toLowerCase();
        let score = 0;
        for (const w of words) if (t.includes(w)) score++;
        score -= i * 0.01; // FIFO tiebreak — earlier chunks win ties
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      return best;
    },
    [chunks],
  );

  /* Open the reader at a passage — clamped against the chapter's range. */
  const openChunk = useCallback(
    (chunkIndex: number) => {
      onExitToChunk?.(clamp(chunkIndex, 0, Math.max(0, chunks.length - 1)));
    },
    [onExitToChunk, chunks.length],
  );

  /* Stable event handlers for memo(AtlasCard): a generation run fires
     dozens of setGenStep/setGenFrac ticks, and fresh inline arrows in the
     card map would defeat the card's React.memo and re-render every mounted
     plate on each tick. The per-card ordinal arrives as the first argument
     (AtlasCard already holds it as a prop) instead of via a closure over
     the map index. */
  const handleCompare = useCallback(
    (ordinal: number, anchorIdx: number) =>
      setCompare({ ordinal, anchorIdx }),
    [],
  );
  const handleMotif = useCallback(
    (m: string) => setActiveMotif((cur) => (cur === m ? null : m)),
    [],
  );
  const handleRegenerate = useCallback(
    (ordinal: number) => void regenerateOne(ordinal),
    [regenerateOne],
  );
  const handleNoteSave = useCallback(
    (ordinal: number, note: string) =>
      void saveSceneNote(doc.id, chapterIndex, ordinal, note),
    [doc.id, chapterIndex],
  );

  // Rough scene-count estimate (mirrors cinematizeChapter's heuristic) so
  // the progress UX can say "scene 2 of 3 written" while the writer runs.
  const estimatedSceneCount = useMemo(() => {
    const text = chunks.map((c) => c.text).join("\n\n");
    return text.length > 5500 ? 3 : 2;
  }, [chunks]);

  const isSplit = layout === "split";
  const showSkeletons = shown.length === 0 && (generating || scenesQ.loading);
  const totalScenes = shown.length || estimatedSceneCount;
  // Atlas plates read as a sequence — one column, always.
  const sceneGridClassName = "grid grid-cols-1 gap-5";

  /* ── header ── */
  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {engine && !generating && (
        <Badge tone={engine === "model" ? "ok" : "muted"}>
          {engine === "model"
            ? `ankaa · ${activeModelFor("ankaa").startsWith("meridian/") ? "smart router" : activeModelFor("ankaa").split("/").pop()}`
            : "Anchor engine"}
        </Badge>
      )}
      {/* desktop layout toggle */}
      <div className="hidden sm:block">
        <Segmented
          ariaLabel="Scene Atlas layout"
          value={layout}
          onChange={(v) => setLayout(v)}
          options={[
            {
              value: "scenes",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <MapTrifold className="w-3.5 h-3.5" />
                  Atlas
                </span>
              ),
              title: "Plates only",
            },
            {
              value: "split",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Columns className="w-3.5 h-3.5" />
                  Split
                </span>
              ),
              title: "Chapter text alongside the atlas",
            },
          ]}
        />
      </div>
      {/* mobile tab toggle (Atlas / Text) */}
      <div className="sm:hidden">
        <Segmented
          ariaLabel="Mobile Scene Atlas"
          value={mobileTab}
          onChange={(v) => setMobileTab(v)}
          options={[
            {
              value: "scenes",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <MapTrifold className="w-3.5 h-3.5" />
                  Atlas
                </span>
              ),
            },
            {
              value: "text",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Text
                </span>
              ),
            },
          ]}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          void generate(false, 1 + Math.floor(Math.random() * 976))
        }
        loading={generating}
      >
        <ArrowsClockwise className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Regenerate</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onExit}>
        <BookOpen className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Return to reading</span>
      </Button>
    </div>
  );

  /* ── progress panel (CINEMA_STEPS + "scene N of M written") ── */
  const progressPanel = generating && (
    <div className="panel p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <MapTrifold className="w-5 h-5 text-gold-400 shrink-0 motion-safe:animate-pulse" />
        <p className="text-sm font-body font-medium text-mist-200 truncate flex-1">
          {CINEMA_STEPS[genStep]}
          {genStep === 2 && incoming.length > 0 ? (
            <span className="text-gold-300">
              {" "}
              · plate {Math.min(incoming.length, estimatedSceneCount)} of{" "}
              {estimatedSceneCount} drawn…
            </span>
          ) : (
            <span className="text-mist-600">…</span>
          )}
        </p>
        <span className="text-xs font-mono text-mist-500 tabular-nums shrink-0">
          {Math.round(((genStep + genFrac) / CINEMA_STEPS.length) * 100)}%
        </span>
      </div>
      <Progress
        value={((genStep + genFrac) / CINEMA_STEPS.length) * 100}
        className="mb-4"
      />
      <p className="text-[11px] text-mist-600 leading-relaxed">
        Ankaa is staging the chapter, enlarging the prose into atmosphere,
        light and subtext rather than compressing it — then marking the
        passages that prove every image.
        {incoming.length > 0 && (
          <span className="text-ankaa-300">
            {" "}
            {incoming.length} plate{incoming.length === 1 ? "" : "s"} landed…
          </span>
        )}
        <span className="block mt-1.5">
          Navigate freely; this run is bound to “{chapter?.title}”.
        </span>
      </p>
    </div>
  );

  /* ── chapter text panel (split-view, or mobile Text tab) ── */
  const chapterPanelContent = (
    <div className="panel p-5 sm:p-6 lg:sticky lg:top-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-3.5 h-3.5 text-gold-500" />
        <span className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500">
          Source chapter
        </span>
      </div>
      <h2 className="font-display font-semibold text-xl sm:text-2xl text-mist-100 mb-5 leading-tight">
        {chapter?.title}
      </h2>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1 font-literata text-[15px] leading-relaxed text-mist-300">
        {chunks.map((c, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {c.text}
          </p>
        ))}
        {chunks.length === 0 && (
          <p className="text-mist-500 italic">
            This chapter has no readable text.
          </p>
        )}
      </div>
    </div>
  );

  /* ── atlas column (progress + motifs + plates + nav) ── */
  const scenesColumnContent = (
    <>
      {progressPanel}

      {motifs.length > 0 && !generating && (
        <MotifStrip
          motifs={motifs}
          active={activeMotif}
          onToggle={(m) =>
            setActiveMotif((cur) => (cur === m ? null : m))
          }
        />
      )}

      {showSkeletons ? (
        <div className={sceneGridClassName}>
          {[...Array(2)].map((_, i) => (
            <SceneSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className={sceneGridClassName}>
          {shown.map((s, i) => {
            /* Legacy scenes (pre-atlas rows with no anchors and no engine
               stamp) fall back to the keyword estimate, labelled as such. */
            const legacy =
              (s.anchors?.length ?? 0) === 0 && s.engine === undefined;
            const estimated = legacy ? sourceChunkFor(s) : null;
            const dimmed =
              activeMotif != null &&
              !(s.motifs ?? []).some(
                (m) => m.toLowerCase() === activeMotif,
              );
            return (
              <Fragment key={`${s.title}-${i}`}>
                <motion.div
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.32,
                    delay: i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <AtlasCard
                    scene={s}
                    ordinal={i}
                    total={totalScenes}
                    chunks={chunks}
                    note={notesMap.get(`${chapterIndex}:${i}`) ?? ""}
                    activeMotif={activeMotif}
                    dimmed={dimmed}
                    regenBusy={regenOrdinal === i}
                    onCompare={handleCompare}
                    onOpenChunk={openChunk}
                    onMotif={handleMotif}
                    onRegenerate={handleRegenerate}
                    onAskLuma={onAskLuma}
                    onNoteSave={handleNoteSave}
                    estimatedChunk={estimated}
                  />
                </motion.div>
                {s.thread && i < shown.length - 1 && (
                  <ThreadLink text={s.thread} />
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      <nav
        className="mt-10 flex items-center justify-between gap-2"
        aria-label="Chapter navigation"
      >
        <Button
          variant="outline"
          size="sm"
          disabled={chapterIndex === 0}
          onClick={onPrev}
        >
          <CaretLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={chapterIndex >= doc.contentJson.chapters.length - 1}
          onClick={onNext}
        >
          <span className="hidden sm:inline">Next</span>
          <CaretRight className="w-4 h-4" />
        </Button>
      </nav>
    </>
  );

  return (
    <div className={cx("mx-auto", isSplit ? "max-w-6xl" : "max-w-3xl")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-display font-medium uppercase tracking-[0.24em] text-gold-400 mb-1.5">
            Scene Atlas · chapter {chapterIndex + 1}
          </p>
          <h1 className="font-display font-semibold text-2xl sm:text-3xl leading-tight text-mist-100 wrap-break-word">
            {chapter?.title}
          </h1>
        </div>
        {headerActions}
      </div>

      {isSplit ? (
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Chapter panel — desktop always visible, mobile only when Text tab */}
          <aside
            className={cx(
              "min-w-0",
              mobileTab === "text" ? "block" : "hidden",
              "lg:block",
            )}
            aria-label="Source chapter text"
          >
            {chapterPanelContent}
          </aside>
          {/* Atlas column — desktop always visible, mobile only when Atlas tab */}
          <section
            className={cx(
              "min-w-0",
              mobileTab === "scenes" ? "block" : "hidden",
              "lg:block",
            )}
            aria-label="Scene Atlas plates"
          >
            {scenesColumnContent}
          </section>
        </div>
      ) : (
        <>
          {/* Mobile-only chapter view (hidden on desktop, where the atlas is the layout) */}
          <aside
            className={cx(
              "min-w-0 lg:hidden mb-6",
              mobileTab === "text" ? "block" : "hidden",
            )}
            aria-label="Source chapter text"
          >
            {chapterPanelContent}
          </aside>
          {/* Atlas column — always visible on desktop, mobile only when Atlas tab */}
          <section
            className={cx(
              "min-w-0",
              mobileTab === "scenes" ? "block" : "hidden",
              "lg:block",
            )}
            aria-label="Scene Atlas plates"
          >
            {scenesColumnContent}
          </section>
        </>
      )}

      {/* Interactive source comparison — the passage in context beside the
          enlargement it grounded. */}
      <Dialog
        open={!!compare}
        onClose={() => setCompare(null)}
        title="Source comparison"
        wide
      >
        {compare &&
          (() => {
            const scene = shown[compare.ordinal];
            const anchor = scene?.anchors?.[compare.anchorIdx];
            if (!scene || !anchor) return null;
            return (
              <SourceCompare
                scene={scene}
                anchor={anchor}
                chunks={chunks}
                onOpenInReader={(ci) => {
                  setCompare(null);
                  openChunk(ci);
                }}
              />
            );
          })()}
      </Dialog>
    </div>
  );
}
