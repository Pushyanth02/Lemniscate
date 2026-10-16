"use client";

import { useState } from "react";
import { UploadSimple, BookOpen, ArrowRight } from "@phosphor-icons/react";
import {
  Button,
  Reveal,
  Eyebrow,
  Skeleton,
  EmptyState,
} from "../../components/ui";
import { CoverArt } from "../../components/bits";
import { toast } from "../../lib/store";
import { seedSampleBooks } from "../../lib/seed";
import { fmtWords } from "../../lib/utils";
import type { Query } from "../../lib/data";
import type { DocumentRow } from "../../lib/types";

export function Shelf({
  docs,
  docsQ,
  onOpenDoc,
  onUpload,
  onLibrary,
}: {
  docs: DocumentRow[];
  docsQ: Query<DocumentRow[]>;
  onOpenDoc: (id: string) => void;
  onUpload: () => void;
  onLibrary: () => void;
}) {
  const [seeding, setSeeding] = useState(false);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-12">
          <div>
            <Eyebrow className="mb-3">My library</Eyebrow>
            <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
              Books for a more thoughtful life
            </h2>
          </div>
          <button
            onClick={onLibrary}
            className="group inline-flex items-center gap-2 text-sm font-body text-mist-400 hover:text-gold-300 transition-colors min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/70 rounded-lg"
          >
            View all
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </Reveal>

      {docsQ.loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <Reveal>
          <div className="panel rounded-xl p-6 sm:p-10">
            <EmptyState
              icon={<BookOpen className="w-6 h-6" />}
              title="Nothing on this shelf yet"
              body="This shelf only ever shows the books actually on this device — never staged filler. Bring a document, or start with the two built-in samples."
              action={
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button variant="gold" onClick={onUpload}>
                    <UploadSimple className="w-4 h-4" />
                    Bring a document
                  </Button>
                  <Button
                    variant="outline"
                    loading={seeding}
                    onClick={async () => {
                      setSeeding(true);
                      try {
                        await seedSampleBooks();
                        toast(
                          "success",
                          "Sample books added to your library.",
                        );
                      } finally {
                        setSeeding(false);
                      }
                    }}
                  >
                    <BookOpen className="w-4 h-4" />
                    Load the sample books
                  </Button>
                </div>
              }
            />
          </div>
        </Reveal>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
          {docs.map((d, i) => (
            <Reveal key={d.id} delay={(i % 3) * 0.06}>
              <button
                type="button"
                onClick={() => onOpenDoc(d.id)}
                aria-label={`Open ${d.title} in the reader`}
                className="group w-full text-left hover-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 rounded-lg"
              >
                <CoverArt
                  doc={d}
                  className="aspect-[2/3] w-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-rotate-1 group-hover:scale-[1.015]"
                />
                <h3 className="mt-4 font-display font-medium text-[16px] sm:text-[17px] text-mist-100 leading-snug line-clamp-2 group-hover:text-gold-300 transition-colors">
                  {d.title}
                </h3>
                <p className="mt-0.5 text-xs text-mist-500 truncate">
                  {d.author}
                </p>
                <div
                  className="mt-3 h-0.5 rounded-full bg-ink-700 overflow-hidden"
                  role="progressbar"
                  aria-label={`${d.title} reading progress`}
                  aria-valuenow={Math.round(d.readingProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-gold-500"
                    style={{ width: `${d.readingProgress}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-mist-500 tabular-nums">
                  {Math.round(d.readingProgress)}% · {fmtWords(d.wordCount)}
                </p>
              </button>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
