"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { Reveal, Eyebrow, Skeleton } from "../../../components/ui";
import { cx, timeAgo } from "../../../lib/utils";
import type { Query } from "../../../lib/data";
import type { AnnotationRow, DocumentRow } from "../../../lib/types";
import type { Quote } from "../../../lib/quotes";

/* ── Notes & marginalia ──
   The wall is live: it renders the visitor's real highlights and
   margin notes from the annotations store (same source as the reader
   and the dashboard), most recent first. While the wall is empty it
   borrows lines from the commonplace pool — session-stable, honest
   about being borrowed, and replaced by the first real mark. */

export function Marginalia({
  marksQ,
  marks,
  docs,
  borrowed,
  onOpenDoc,
  onHistory,
}: {
  marksQ: Query<AnnotationRow[]>;
  marks: AnnotationRow[];
  docs: DocumentRow[] | null;
  borrowed: Quote[] | null;
  onOpenDoc: (id: string) => void;
  onHistory: () => void;
}) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-12">
          <div className="max-w-xl">
            <Eyebrow className="mb-3">Notes &amp; marginalia</Eyebrow>
            <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
              A record of a more attentive mind
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-mist-500">
              {marksQ.data && marks.length === 0
                ? "Nothing on the wall yet — these borrowed lines hold the places until your first highlight. Select any passage in the reader and it will appear here, instantly."
                : "Your highlights and margin notes, exactly as you left them in the books on this device — the newest marks first."}
            </p>
          </div>
          <button
            onClick={onHistory}
            className="group inline-flex items-center gap-2 text-sm font-body text-mist-400 hover:text-gold-300 transition-colors min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/70 rounded-lg"
          >
            View all
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </Reveal>

      {marksQ.loading && !marksQ.data ? (
        /* first load: the wall is being fetched from the shelf */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : marks.length > 0 ? (
        /* the real thing: this visitor's marks, newest first */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {marks.map((m, i) => {
            const doc = docs?.find((d) => d.id === m.documentId);
            const body = (
              <>
                <span
                  className="font-display text-4xl text-gold-500/40 leading-none select-none"
                  aria-hidden
                >
                  &ldquo;
                </span>
                <blockquote
                  className={cx(
                    "mt-2 font-display italic text-xl sm:text-[1.4rem] leading-snug",
                    i === 0
                      ? "bg-highlight text-highlight-ink rounded-sm px-1.5 -mx-1.5 py-0.5"
                      : "text-mist-100",
                  )}
                >
                  {m.text}
                </blockquote>
                {m.note && (
                  <p className="mt-4 text-[13px] leading-relaxed text-mist-400">
                    {m.note}
                  </p>
                )}
                <figcaption className="mt-auto pt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[10px] font-body tracking-[0.2em] uppercase text-gold-400/90">
                    {doc?.title ?? "A removed document"}
                  </span>
                  <span className="text-[10px] font-body tracking-[0.14em] uppercase text-mist-600">
                    {timeAgo(m.createdAt)}
                  </span>
                </figcaption>
              </>
            );
            return (
              <Reveal key={m.id} delay={(i % 3) * 0.08} className="h-full">
                {doc ? (
                  <button
                    onClick={() => onOpenDoc(doc.id)}
                    aria-label={`Open ${doc.title} in the reader`}
                    className="panel rounded-xl p-6 sm:p-7 h-full w-full text-left hover-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/70 flex flex-col"
                  >
                    <figure className="flex flex-col h-full">{body}</figure>
                  </button>
                ) : (
                  <figure className="panel rounded-xl p-6 sm:p-7 h-full flex flex-col opacity-80">
                    {body}
                  </figure>
                )}
              </Reveal>
            );
          })}
        </div>
      ) : (
        /* an empty wall borrows from the greats — varied per visitor
           and per sitting, honestly labelled, never faked as your own */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {(borrowed ?? []).map((q, i) => (
            <Reveal key={q.source + q.text.slice(0, 24)} delay={(i % 3) * 0.08} className="h-full">
              <figure className="panel rounded-xl p-6 sm:p-7 h-full flex flex-col">
                <span
                  className="font-display text-4xl text-gold-500/40 leading-none select-none"
                  aria-hidden
                >
                  &ldquo;
                </span>
                <blockquote
                  className={cx(
                    "mt-2 font-display italic text-xl sm:text-[1.4rem] leading-snug",
                    i === 0
                      ? "bg-highlight text-highlight-ink rounded-sm px-1.5 -mx-1.5 py-0.5"
                      : "text-mist-100",
                    q.verse && "whitespace-pre-line",
                  )}
                >
                  {q.text}
                </blockquote>
                <figcaption className="mt-auto pt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[10px] font-body tracking-[0.2em] uppercase text-gold-400/90">
                    {q.source}
                  </span>
                  <span className="text-[10px] font-body tracking-[0.14em] uppercase text-mist-600">
                    A borrowed line
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
