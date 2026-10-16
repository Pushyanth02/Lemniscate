import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CircleNotch,
  CopySimple,
  Eye,
  FilePlus,
  FloppyDisk,
  PenNib,
} from "@phosphor-icons/react";
import { Badge, Button, Dialog, Progress } from "../../components/ui";
import { useNav, toast } from "../../lib/store";
import {
  putStory,
  patchStory,
  saveStoryToLibrary,
  appendChapterToDocument,
} from "../../lib/data";
import {
  runAnkaaLong,
  ankaaSteps,
  detectDepth,
  ankaaSectionsFor,
  aiConfigured,
  offlineReasonText,
  activeModelFor,
  type AnkaaDepth,
} from "../../lib/ai";
import { enqueueJob } from "../../lib/jobs";
import { getUserId } from "../../lib/db";
import type { AnkaaMode, DocWithContent, StoryRow } from "../../lib/types";
import { cx, clamp, uid } from "../../lib/utils";

/* ---------- Ankaa — write from inside the reader ---------- */

const ANKAA_MODES: { id: AnkaaMode; label: string; hint: string }[] = [
  {
    id: "continue",
    label: "Continue",
    hint: "Pick up where the text left off",
  },
  { id: "chapter", label: "New chapter", hint: "Draft the next chapter" },
  { id: "whatif", label: "What if…", hint: "One hinge, another door" },
  {
    id: "alternate",
    label: "Alternate ending",
    hint: "Fork the last turning point",
  },
  { id: "lore", label: "World lore", hint: "Histories the text only implies" },
  {
    id: "children",
    label: "For children",
    hint: "The same story, gentler hands",
  },
];

export function AnkaaPanel({ doc }: { doc: DocWithContent }) {
  const openDoc = useNav((s) => s.openDoc);
  const [mode, setMode] = useState<AnkaaMode>("continue");
  const [prompt, setPrompt] = useState("");
  // The reader's Ankaa panel always has a source document attached, so depth
  // is normally "long" — but a user who types "short scene about X" should
  // still get a short draft. detectDepth honors short-form cue words even
  // when a doc is present (the doc just means the writer is continuing
  // from a book, not that they want a full chapter).
  const depth = useMemo<AnkaaDepth>(() => {
    // If the user typed a short-form cue, honor it even with a doc attached.
    const q = prompt.trim().toLowerCase();
    if (
      /\b(short|brief|scene|moment|flash|vignette|drabble|paragraph|sketch)\b/.test(
        q,
      )
    )
      return "short";
    return detectDepth(prompt, doc);
  }, [prompt, doc]);
  const steps = useMemo(() => ankaaSteps(depth), [depth]);
  const [live, setLive] = useState<{
    stepIdx: number;
    words: number;
    status: "running" | "done" | "failed";
    error?: string;
  } | null>(null);
  const [result, setResult] = useState<{
    id: string;
    title: string;
    body: string;
    words: number;
    offline: boolean;
    reasonText: string;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  const [appending, setAppending] = useState(false);
  const [appended, setAppended] = useState(false);
  const running = live?.status === "running";

  /** Weave the finished draft into THIS book as a new chapter, so the story
   *  continues in place rather than living on a separate shelf. */
  const append = async () => {
    if (!result || appending) return;
    setAppending(true);
    try {
      const chapterTitle = result.title.includes("—")
        ? result.title.split("—").pop()!.trim()
        : result.title;
      await appendChapterToDocument(doc.id, chapterTitle, result.body);
      setAppended(true);
      toast(
        "success",
        `Added “${chapterTitle}” as chapter ${doc.chapterCount + 1} of “${doc.title}”.`,
      );
    } catch (e) {
      toast(
        "error",
        e instanceof Error ? e.message : "Couldn’t append the draft.",
      );
    } finally {
      setAppending(false);
    }
  };

  const generate = async () => {
    if (running) return;
    // Capture depth at dispatch time so the running job keeps its own snapshot
    // even if the user keeps typing.
    const runDepth = depth;
    const id = uid("story");
    setResult(null);
    setPreview(false);
    setAppended(false);
    setLive({ stepIdx: 0, words: 0, status: "running" });
    const story: StoryRow = {
      id,
      userId: getUserId(),
      title: `Draft: ${doc.title}`,
      mode,
      body: "",
      sourceDocumentId: doc.id,
      status: "running",
      progress: 0,
      step: "Queued",
      error: null,
      createdAt: Date.now(),
    };
    await putStory(story);
    enqueueJob({
      label: `Ankaa · ${ANKAA_MODES.find((m) => m.id === mode)?.label ?? "draft"}`,
      bot: "ankaa",
      kind: mode,
      documentId: doc.id,
      steps,
      run: async (report) =>
        runAnkaaLong(
          mode,
          prompt,
          doc,
          (stepIdx, frac, words) => {
            report({ step: stepIdx, fraction: frac, words });
            setLive((l) =>
              l && l.status === "running" ? { ...l, stepIdx, words } : l,
            );
            void patchStory(id, {
              step: steps[stepIdx],
              progress: Math.round(((stepIdx + frac) / steps.length) * 100),
            });
          },
          undefined,
          runDepth,
        ),
      onDone: async (res) => {
        await putStory({
          ...story,
          title: res.title,
          body: res.body,
          status: "done",
          progress: 100,
          step: "Complete",
        });
        setResult({
          id,
          title: res.title,
          body: res.body,
          words: res.words,
          offline: res.offline,
          reasonText: res.offline ? offlineReasonText(res.reason) : "",
        });
        setLive({ stepIdx: steps.length, words: res.words, status: "done" });
        toast(
          "success",
          `Ankaa finished: ${res.words.toLocaleString()} words${res.offline ? ` (Anchor engine · ${offlineReasonText(res.reason)})` : ""}.`,
        );
      },
      onError: async (err) => {
        await patchStory(id, { status: "failed", error: err.message });
        setLive({ stepIdx: 0, words: 0, status: "failed", error: err.message });
        toast("error", err.message);
      },
    });
  };

  const save = async () => {
    if (!result) return;
    const row = await saveStoryToLibrary({
      id: result.id,
      userId: getUserId(),
      title: result.title,
      mode,
      body: result.body,
      sourceDocumentId: doc.id,
      status: "done",
      progress: 100,
      step: "Complete",
      error: null,
      createdAt: Date.now(),
    });
    toast("success", `“${row.title}” is now in your library.`);
    openDoc(row.id);
  };

  const stepLabel = running
    ? steps[clamp(live?.stepIdx ?? 0, 0, steps.length - 1)]
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* context strip */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 flex items-center gap-3 shrink-0 bg-ink-875/50">
        <span className="w-10 h-10 rounded-xl border border-ankaa-500/50 bg-ankaa-500/10 flex items-center justify-center font-display italic text-lg text-ankaa-300 shrink-0">
          A
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-display text-mist-100 leading-tight">
            Ankaa · long-form
          </p>
          <p className="text-[11px] text-mist-500 truncate mt-0.5">
            writing from “{doc.title}”; runs in the background
          </p>
        </div>
        <Badge
          tone={
            activeModelFor("ankaa").startsWith("meridian/") || !aiConfigured()
              ? "muted"
              : "ok"
          }
        >
          {aiConfigured() ? "model" : "Anchor engine"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
        {/* approach */}
        <div>
          <p className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500 mb-2.5">
            Approach
          </p>
          <div
            className="grid grid-cols-2 gap-2.5"
            role="radiogroup"
            aria-label="Writing approach"
          >
            {ANKAA_MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cx(
                  "text-left rounded-xl border p-3 transition-all press",
                  mode === m.id
                    ? "border-ankaa-500/70 bg-ankaa-500/9 shadow-[0_0_0_3px_rgb(213_133_79/0.10)]"
                    : "border-ink-600 hover:border-ink-500 bg-ink-875 hover:bg-ink-800",
                )}
              >
                <span
                  className={cx(
                    "block text-xs font-body font-medium",
                    mode === m.id ? "text-ankaa-300" : "text-mist-200",
                  )}
                >
                  {m.label}
                </span>
                <span className="block text-[10px] text-mist-500 mt-0.5 leading-snug">
                  {m.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* prompt */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-500">
              What should it be about?
            </p>
            <Badge
              tone="ankaa"
              title={`${ankaaSectionsFor(depth)} sections · ${depth}-form draft`}
            >
              {depth === "short"
                ? "Short-form"
                : depth === "medium"
                  ? "Medium-form"
                  : "Long-form"}
              <span className="opacity-60 ml-1">
                · {ankaaSectionsFor(depth)}
              </span>
            </Badge>
          </div>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Optional but powerful: name characters, places, tone. e.g. “A winter storm, an unsent letter, and ${doc.author === "Unknown author" ? "the keeper's confession" : "a confession at the door"}.”`}
            aria-label="Ankaa writing prompt"
            className="w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-3 text-sm text-mist-100 placeholder:text-mist-500 focus:border-ankaa-500 focus:shadow-[0_0_0_3px_rgb(213_133_79/0.12)] outline-none transition-all resize-y leading-relaxed"
          />
          <p className="text-[10px] text-mist-600 mt-1.5 leading-relaxed">
            Everything you name becomes canon. Ankaa weaves it through every
            section. Type “short scene…” to get a brief draft instead of a full
            chapter.
          </p>
        </div>

        {/* progress / result */}
        {running && live && (
          <div className="rounded-xl border border-ankaa-500/40 bg-ankaa-500/6 p-4">
            <div className="flex items-center gap-2.5 mb-2.5">
              <CircleNotch className="w-4 h-4 animate-spin text-ankaa-400" />
              <p className="text-xs font-body font-medium text-ankaa-300">
                {stepLabel}…
              </p>
              <span className="ml-auto text-[11px] font-mono text-mist-400 tabular-nums">
                {live.words.toLocaleString()} words
              </span>
            </div>
            <Progress value={((live.stepIdx + 0.4) / steps.length) * 100} />
            <p className="text-[10px] text-mist-600 mt-2 leading-relaxed">
              Visible in the header job tray; safe to keep reading meanwhile.
            </p>
          </div>
        )}

        {live?.status === "failed" && (
          <div className="rounded-xl border border-danger-500/40 bg-danger-500/6 p-4">
            <p className="text-xs text-danger-400 mb-2.5 leading-relaxed">
              {live.error}
            </p>
            <Button size="sm" variant="outline" onClick={() => void generate()}>
              <ArrowsClockwise className="w-3.5 h-3.5" />
              Try again
            </Button>
          </div>
        )}

        {live?.status === "done" && result && (
          <div className="rounded-xl border border-ok-500/40 bg-ok-500/6 p-4">
            <p className="text-sm font-display text-mist-100 mb-0.5">
              {result.title}
            </p>
            <p className="text-[11px] font-mono text-mist-500 mb-3.5">
              {result.words.toLocaleString()} words
              {result.offline
                ? ` · Anchor engine (${result.reasonText})`
                : ""}{" "}
              · written from this
              book’s context
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="gold"
                onClick={() => void append()}
                loading={appending}
                disabled={appended}
              >
                <FilePlus className="w-3.5 h-3.5" />
                {appended ? "Added to this book" : "Continue this book"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPreview(true)}
              >
                <Eye className="w-3.5 h-3.5" />
                Read the draft
              </Button>
              <Button size="sm" variant="outline" onClick={() => void save()}>
                <FloppyDisk className="w-3.5 h-3.5" />
                Save separately
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(result.body)
                    .then(() => toast("success", "Copied to clipboard."));
                }}
              >
                <CopySimple className="w-3.5 h-3.5" />
                Copy
              </Button>
            </div>
            {appended && (
              <p className="text-[10px] text-ok-400 mt-2.5 leading-relaxed">
                The draft is now chapter {doc.chapterCount + 1} of “{doc.title}”.
                Find it in the chapter index (t) or keep reading.
              </p>
            )}
          </div>
        )}

        {!live && (
          <p className="text-[11px] text-mist-600 leading-relaxed">
            Ankaa outlines first, then writes section by section with a live
            word count. Length scales to your prompt: type “short scene…” for
            ~400 words, or leave it long for a full chapter (~2,500 with a
            model, ~1,800 with the Anchor engine).
          </p>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-5 shrink-0">
        <Button
          variant="gold"
          className="w-full"
          onClick={() => void generate()}
          loading={running}
          disabled={running}
        >
          <PenNib className="w-4 h-4" />
          {running ? "Ankaa is writing…" : "Begin the draft"}
        </Button>
      </div>

      {/* preview */}
      <Dialog
        open={preview && !!result}
        onClose={() => setPreview(false)}
        title={result?.title ?? ""}
        wide
      >
        {result && (
          <>
            <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-4 font-literata text-[15px] leading-relaxed text-mist-300">
              {result.body.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 mt-5 pt-4 border-t border-ink-700">
              <span className="text-[11px] font-mono text-mist-500 tabular-nums">
                {result.words.toLocaleString()} words
              </span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="gold"
                  onClick={() => {
                    void append();
                    setPreview(false);
                  }}
                  loading={appending}
                  disabled={appended}
                >
                  <FilePlus className="w-4 h-4" />
                  {appended ? "Added" : "Continue this book"}
                </Button>
                <Button variant="outline" onClick={() => void save()}>
                  <FloppyDisk className="w-4 h-4" />
                  Save separately
                </Button>
                <Button variant="ghost" onClick={() => setPreview(false)}>
                  Close
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
