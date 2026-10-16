"use client";

import Image from "next/image";
import { UploadSimple, ArrowRight, CaretRight } from "@phosphor-icons/react";
import { GlowLayer, ParticleField } from "../../components/brand";
import { Button, Reveal, Eyebrow } from "../../components/ui";
import ReaderDesk from "../../components/reader-desk";
import { FORMATS } from "./content";
import { Magnetic, HeroReveal } from "./motion";
import type { Quote } from "../../lib/quotes";
import type { DocumentRow } from "../../lib/types";

export function Hero({
  heroQuote,
  docs,
  onUpload,
  onEnter,
  onOpenDoc,
  onLibrary,
}: {
  heroQuote: Quote | undefined;
  docs: DocumentRow[];
  onUpload: () => void;
  onEnter: () => void;
  onOpenDoc: (id: string) => void;
  onLibrary: () => void;
}) {
  return (
    <>
      {/* ---------- hero (asymmetric two-column) ---------- */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 lg:pt-24 pb-20 sm:pb-24 lg:pb-32">
        <GlowLayer variant="landing" />
        <ParticleField density={40} />

        <div className="max-w-6xl mx-auto relative grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-16 items-center">
          {/* left: copy */}
          <div className="text-left">
            <HeroReveal>
              <Eyebrow className="mb-5 sm:mb-6">
                A local-first reading room
              </Eyebrow>
            </HeroReveal>
            <HeroReveal delay={0.06}>
              <h1 className="font-display font-medium text-[2.75rem] sm:text-6xl lg:text-[4.4rem] leading-[1.04] text-mist-100 tracking-tight text-balance">
                A quieter place
                <br />
                for <span className="italic text-gold-300">deeper reading</span>
                .
              </h1>
            </HeroReveal>
            <HeroReveal delay={0.12}>
              <p className="mt-6 max-w-lg text-[15px] sm:text-base leading-relaxed text-mist-400">
                Build your library, read without distraction, and keep your
                thoughts. A modern reading room for curious minds — your
                library lives in this browser, and nothing leaves it unless
                you ask an AI companion a question.
              </p>
            </HeroReveal>
            <HeroReveal delay={0.18}>
              <div className="mt-8 sm:mt-9 flex flex-wrap items-center gap-3 sm:gap-4">
                <Magnetic>
                  <Button
                    variant="gold"
                    size="lg"
                    onClick={onUpload}
                    className="min-h-11 group"
                  >
                    <UploadSimple className="w-4 h-4" />
                    Bring a document
                    <span
                      aria-hidden
                      className="ml-0.5 w-6 h-6 rounded-full bg-ink-950/15 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5"
                    >
                      <CaretRight className="w-3 h-3" weight="bold" />
                    </span>
                  </Button>
                </Magnetic>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={onEnter}
                  className="min-h-11"
                >
                  Enter the room
                </Button>
              </div>
            </HeroReveal>
            <HeroReveal delay={0.24}>
              <p className="mt-6 text-[10px] font-body tracking-[0.26em] uppercase text-mist-600">
                Local-first · Private by default
              </p>
            </HeroReveal>
          </div>

          {/* right: lamp-lit photograph + floating paper quote */}
          <HeroReveal delay={0.14} className="relative">
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-ink-700/80 bg-ink-900 shadow-float">
                <Image
                  src="/hero-desk.webp"
                  alt="A reading desk at night, lit by a single warm lamp, an open book resting beside a notebook"
                  width={1152}
                  height={864}
                  priority
                  className="w-full h-auto"
                />
                {/* dark vignette so the photo melts into the room */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(120% 90% at 50% 38%, transparent 52%, rgb(13 10 6 / 0.5) 100%), linear-gradient(to bottom, rgb(13 10 6 / 0.22), transparent 28%, transparent 62%, rgb(13 10 6 / 0.66))",
                  }}
                  aria-hidden
                />
                {/* subtle gold inner edge */}
                <div
                  className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-gold-600/30 pointer-events-none"
                  aria-hidden
                />
              </div>

              {/* the cream page, floating over the corner of the photo —
                  a borrowed line, different for every visitor and every
                  sitting */}
              <div className="paper rounded-xl p-6 sm:p-7 absolute -bottom-9 -left-2 sm:-left-6 lg:-left-10 max-w-[290px] min-h-[7.25rem]">
                {heroQuote ? (
                  <>
                    <p className="font-display italic text-xl sm:text-[1.35rem] leading-snug text-paper-ink">
                      &ldquo;{heroQuote.text}&rdquo;
                    </p>
                    <p className="mt-3 text-[10px] font-body tracking-[0.24em] uppercase text-paper-ink-soft">
                      {heroQuote.source}
                    </p>
                  </>
                ) : (
                  <span className="block" aria-hidden />
                )}
              </div>
            </div>
          </HeroReveal>
        </div>
      </section>

      {/* ---------- format ledger ---------- */}
      <section className="border-y border-ink-700/60 bg-ink-900/60 py-6 sm:py-8 overflow-hidden">
        <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-x-6 sm:gap-x-10 gap-y-3 justify-center">
          <span className="text-[10px] font-mono tracking-[0.12em] text-mist-600">
            Reads
          </span>
          {FORMATS.map((f) => (
            <span
              key={f}
              className="font-mono text-xs tracking-[0.08em] text-mist-500 hover:text-gold-300 transition-colors cursor-default"
            >
              {f}
            </span>
          ))}
          <span className="hidden md:inline text-[11px] font-body text-mist-600 ml-auto">
            into one calm page
          </span>
        </Reveal>
      </section>

      {/* ---------- the margin: reader showcase ---------- */}
      <section
        id="demo"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 scroll-mt-24"
      >
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-14">
            <div className="max-w-xl">
              <Eyebrow className="mb-3">The margin</Eyebrow>
              <h2 className="font-display font-medium text-3xl sm:text-4xl lg:text-[2.8rem] text-mist-100 leading-[1.1]">
                Read like it&rsquo;s paper,
                <br />
                think like it&rsquo;s software.
              </h2>
              <p className="mt-4 text-sm sm:text-[15px] leading-relaxed text-mist-400">
                Chapters detected from real structure, typography tuned like a
                book, and a margin that keeps the thoughts you have while
                reading.
              </p>
            </div>
            <button
              onClick={() => {
                /* smart route: straight into the reader if a real document
                   exists on this device, otherwise to the shelf */
                const latest = docs[0];
                if (latest) onOpenDoc(latest.id);
                else onLibrary();
              }}
              className="group inline-flex items-center gap-2 text-sm font-body text-mist-400 hover:text-gold-300 transition-colors min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/70 rounded-lg"
            >
              Open the reader
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="relative">
          {/* lamplight pooling under the page */}
          <div
            aria-hidden
            className="absolute -inset-x-4 sm:-inset-x-8 -bottom-12 -top-8 pointer-events-none"
            style={{
              background:
                "radial-gradient(58% 52% at 50% 42%, rgb(212 168 83 / 0.07), transparent 72%)",
            }}
          />
          <ReaderDesk />
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-6 text-center font-mono text-[10px] tracking-[0.14em] uppercase text-mist-600">
            A live excerpt — select any passage to highlight it or leave a
            note. Your marks stay on this device.
          </p>
        </Reveal>
      </section>
    </>
  );
}
