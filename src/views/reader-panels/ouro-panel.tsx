import { useCallback, useState } from "react";
import {
  ArrowsClockwise,
  BookOpen,
  CircleNotch,
  Compass,
  Lightbulb,
  ListChecks,
  Pen,
  Question,
  Scroll,
  Translate,
} from "@phosphor-icons/react";
import { Badge, Button, Segmented, Skeleton } from "../../components/ui";
import {
  getOuroArtifact,
  TASK_TITLES,
  AiUnavailable,
  offlineReasonText,
  type OuroTask,
  type OuroArtifact,
} from "../../lib/ai";
import type { DocWithContent, QuizQuestion } from "../../lib/types";
import { cx, uid } from "../../lib/utils";
import { RichText } from "./rich-text";

/* ---------- Ouro — study companion (ask, then build) ----------
   Ouro starts by asking what you actually need and builds ONE focused
   artifact per request — summary, quiz, guide, themes, vocab, essays or
   the full set. Results accumulate as cards and are cached per task+scope,
   so chapter work and whole-text work stay distinct. */

const OURO_TASKS: {
  task: OuroTask;
  label: string;
  icon: typeof BookOpen;
  hint: string;
}[] = [
  {
    task: "summary",
    label: "Summary",
    icon: BookOpen,
    hint: "What happens, distilled",
  },
  {
    task: "quiz",
    label: "Quiz me",
    icon: Question,
    hint: "Sourced multiple-choice",
  },
  {
    task: "guide",
    label: "Study guide",
    icon: Compass,
    hint: "Objectives + close-reading steps",
  },
  {
    task: "themes",
    label: "Themes & cast",
    icon: Lightbulb,
    hint: "Motifs and their carriers",
  },
  {
    task: "vocab",
    label: "Vocabulary",
    icon: Translate,
    hint: "Words worth keeping",
  },
  {
    task: "essays",
    label: "Essay prompts",
    icon: Pen,
    hint: "University-level questions",
  },
  {
    task: "full",
    label: "Full study set",
    icon: ListChecks,
    hint: "Everything in one pass",
  },
];

interface FeedItem {
  key: string;
  task: OuroTask;
  scope: "chapter" | "whole";
  status: "loading" | "done" | "error";
  artifact?: OuroArtifact;
  error?: string;
}

export function OuroPanel({
  doc,
  chapterIndex,
}: {
  doc: DocWithContent;
  chapterIndex: number;
}) {
  const [scope, setScope] = useState<"chapter" | "whole">("chapter");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const chapterTitle =
    doc.contentJson.chapters[chapterIndex]?.title ?? "this chapter";
  const scopeLabel =
    scope === "chapter" ? `“${chapterTitle}”` : "the whole text";

  const request = useCallback(
    async (task: OuroTask) => {
      const itemScope = scope;
      const key = uid("ouro");
      setFeed((f) => [
        ...f,
        { key, task, scope: itemScope, status: "loading" },
      ]);
      try {
        const artifact = await getOuroArtifact(
          doc,
          itemScope === "chapter" ? chapterIndex : null,
          task,
        );
        setFeed((f) =>
          f.map((x) =>
            x.key === key ? { ...x, status: "done", artifact } : x,
          ),
        );
      } catch (e) {
        const msg =
          e instanceof AiUnavailable
            ? e.message
            : "Ouro couldn’t build that one. Try again?";
        setFeed((f) =>
          f.map((x) =>
            x.key === key ? { ...x, status: "error", error: msg } : x,
          ),
        );
      }
    },
    [doc, chapterIndex, scope],
  );

  return (
    <div className="flex flex-col h-full">
      {/* context strip */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 shrink-0 bg-ink-875/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Segmented
            ariaLabel="Study scope"
            value={scope}
            onChange={(v) => setScope(v)}
            options={[
              { value: "chapter", label: "This chapter" },
              { value: "whole", label: "Whole text" },
            ]}
          />
          <p className="text-[11px] text-mist-500 truncate">
            grounded in {scopeLabel}
          </p>
        </div>
      </div>

      {/* feed */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {feed.length === 0 && (
          <div className="text-center pt-6 pb-2">
            <span className="inline-flex w-12 h-12 rounded-2xl border border-ouro-500/50 bg-ouro-500/10 items-center justify-center mb-3">
              <Scroll className="w-5 h-5 text-ouro-400" />
            </span>
            <p className="text-sm font-display text-mist-200">
              What do you need from {scopeLabel}?
            </p>
            <p className="text-xs text-mist-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Tell me in the box below, or start with one of these; I’ll build
              exactly that, and cache it.
            </p>
          </div>
        )}

        {/* task tiles / chips */}
        {feed.length === 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {OURO_TASKS.map((t) => (
              <button
                key={t.task}
                onClick={() => void request(t.task)}
                className="text-left rounded-xl border border-ink-600 bg-ink-875 px-3.5 py-3 hover:border-ouro-500/70 hover:bg-ink-800 hover-lift transition-all press"
              >
                <t.icon className="w-4 h-4 text-ouro-400 mb-1.5" />
                <span className="block text-xs font-body font-medium text-mist-200">
                  {t.label}
                </span>
                <span className="block text-[10px] text-mist-500 mt-0.5 leading-snug">
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1"
            style={{ scrollbarWidth: "none" }}
          >
            {OURO_TASKS.map((t) => (
              <button
                key={t.task}
                onClick={() => void request(t.task)}
                className="shrink-0 text-[11px] font-body px-3 py-1.5 rounded-full border border-ink-600 text-mist-400 hover:border-ouro-500/70 hover:text-ouro-300 hover:bg-ink-750/60 transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {feed.map((item) => (
          <div
            key={item.key}
            className="rounded-xl border border-ink-700 bg-ink-800/80 overflow-hidden hover-lift"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700/70 bg-ink-875/60">
              <span className="text-[10px] font-body font-medium uppercase tracking-[0.16em] text-ouro-300">
                {TASK_TITLES[item.task]}
              </span>
              <span className="text-[10px] text-mist-600">
                · {item.scope === "chapter" ? "this chapter" : "whole text"}
              </span>
              {item.status === "done" && item.artifact && (
                <Badge
                  tone={item.artifact.offline ? "muted" : "ouro"}
                  className="ml-auto"
                  title={
                    item.artifact.offline
                      ? `Anchor engine · ${offlineReasonText(item.artifact.reason)}`
                      : undefined
                  }
                >
                  {item.artifact.offline ? "Anchor" : "model"}
                </Badge>
              )}
              {item.status === "loading" && (
                <CircleNotch className="w-3.5 h-3.5 animate-spin text-ouro-400 ml-auto" />
              )}
            </div>
            <div className="px-4 py-3.5 text-[13px] leading-relaxed text-mist-300">
              {item.status === "loading" && (
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3.5 w-9/12" />
                  <p className="text-[11px] text-mist-500 pt-1.5 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-ouro-400 border-t-transparent animate-spin inline-block" />
                    Ouro is reading carefully…
                  </p>
                </div>
              )}
              {item.status === "error" && (
                <div>
                  <p className="text-xs text-danger-400 mb-2.5">{item.error}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void request(item.task)}
                  >
                    <ArrowsClockwise className="w-3 h-3" />
                    Retry
                  </Button>
                </div>
              )}
              {item.status === "done" && item.artifact && (
                <>
                  <RichText text={item.artifact.body} />
                  {item.artifact.quiz && item.artifact.quiz.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-ink-700/60">
                      <QuizBlock quiz={item.artifact.quiz} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ask Ouro directly */}
      <OuroAsk onAsk={(task) => void request(task)} />
    </div>
  );
}

function OuroAsk({ onAsk }: { onAsk: (task: OuroTask) => void }) {
  const [text, setText] = useState("");
  const pick = (): OuroTask => {
    const t = text.toLowerCase();
    if (/quiz|test|question/.test(t)) return "quiz";
    if (/guide|how (do|to) study|plan/.test(t)) return "guide";
    if (/theme|character|cast|motif/.test(t)) return "themes";
    if (/vocab|word|terminolog/.test(t)) return "vocab";
    if (/essay|prompt|write about/.test(t)) return "essays";
    if (/summar|recap|about/.test(t)) return "summary";
    return "full";
  };
  return (
    <form
      className="px-4 sm:px-5 pb-5 pt-1.5 shrink-0"
      onSubmit={(e) => {
        e.preventDefault();
        onAsk(pick());
        setText("");
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-ink-600 bg-ink-850 focus-within:border-ouro-500 focus-within:shadow-[0_0_0_3px_rgb(86_147_131/0.12)] transition-all p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “quiz me on this chapter”"
          aria-label="Ask Ouro for a study task"
          className="flex-1 bg-transparent outline-none text-sm text-mist-100 placeholder:text-mist-500 px-2 py-1.5"
        />
        <Button
          type="submit"
          variant="gold"
          size="sm"
          aria-label="Build study artifact"
          disabled={!text.trim()}
        >
          <Scroll className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
}

function OuroSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-3 font-display font-medium text-[15px] text-ouro-300 mb-3.5">
        {title}
        <span aria-hidden className="h-px flex-1 bg-ink-700/70" />
      </h3>
      {children}
    </section>
  );
}

function QuizBlock({ quiz }: { quiz: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answered = Object.keys(answers).length;
  const correct = Object.entries(answers).filter(
    ([qi, a]) => (quiz[Number(qi)]?.answer ?? -1) === a,
  ).length;
  return (
    <OuroSection
      title={`Quiz: ${answered === 0 ? `${quiz.length} questions` : `${correct}/${answered} correct`}`}
    >
      <div className="divide-y divide-ink-700/60">
        {quiz.map((q, qi) => (
          <div key={qi} className="py-4 first:pt-0 last:pb-0">
            <p className="text-[13px] text-mist-200 leading-relaxed mb-3">
              {q.q}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {q.options.map((opt, oi) => {
                const chosen = answers[qi];
                const isAnswer = q.answer === oi;
                const isChosen = chosen === oi;
                return (
                  <button
                    key={oi}
                    onClick={() =>
                      chosen === undefined &&
                      setAnswers((a) => ({ ...a, [qi]: oi }))
                    }
                    disabled={chosen !== undefined}
                    className={cx(
                      "text-left text-xs px-3 py-2 rounded-lg border transition-all press",
                      chosen === undefined &&
                        "border-ink-600 text-mist-300 hover:border-gold-600/70 hover:text-gold-200 hover:bg-gold-500/10",
                      chosen !== undefined &&
                        isAnswer &&
                        "border-ok-500/60 bg-ok-500/10 text-ok-400",
                      chosen !== undefined &&
                        isChosen &&
                        !isAnswer &&
                        "border-danger-500/60 bg-danger-500/10 text-danger-400",
                      chosen !== undefined &&
                        !isChosen &&
                        !isAnswer &&
                        "border-ink-700 text-mist-600",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {answers[qi] !== undefined && (
              <p className="text-[11px] text-mist-500 mt-2.5 italic font-literata leading-relaxed">
                Source: “{q.why}”
              </p>
            )}
          </div>
        ))}
      </div>
    </OuroSection>
  );
}
