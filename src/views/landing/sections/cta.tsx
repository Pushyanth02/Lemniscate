"use client";

import {
  BookOpen,
  ArrowRight,
  ClipboardText,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Reveal, Eyebrow, Button } from "../../../components/ui";
import { Magnetic } from "../motion";
import { BookStack } from "../diagrams";

export function Cta({
  onUpload,
  onPaste,
}: {
  onUpload: () => void;
  onPaste: () => void;
}) {
  return (
    <section className="border-t border-ink-700/60 bg-ink-900/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
            <div>
              <Eyebrow className="mb-3">Add to your library</Eyebrow>
              <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
                Bring your books with you
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist-400">
                Import PDFs and EPUBs, paste text, or drop a file anywhere on
                this page.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
                <Magnetic>
                  <Button
                    variant="gold"
                    size="lg"
                    onClick={onUpload}
                    className="min-h-11 group"
                  >
                    <BookOpen className="w-4 h-4" />
                    Add a book
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </Magnetic>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={onPaste}
                  className="min-h-11"
                >
                  <ClipboardText className="w-4 h-4" />
                  Paste text
                </Button>
              </div>
              <p className="mt-5 text-[11px] font-body text-mist-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-gold-600 shrink-0" />
                No account. No upload to a server. Just your reading room.
              </p>
              <p className="mt-6 text-[10px] font-body tracking-[0.22em] uppercase text-mist-600">
                PDF · EPUB · DOCX · PPTX · Markdown · TXT · HTML
              </p>
            </div>
            <div className="flex items-center justify-center lg:justify-end">
              <BookStack className="w-44 sm:w-52 text-gold-500" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
