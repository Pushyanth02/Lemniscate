"use client";

import { Reveal, Eyebrow } from "../../../components/ui";
import { DiamondRule } from "../../../components/sigils";
import { cx } from "../../../lib/utils";
import { BOTS } from "../content";

export function Companions() {
  return (
    <section
      id="bots"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 scroll-mt-24"
    >
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-14">
          <div>
            <Eyebrow className="mb-3">The companions</Eyebrow>
            <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
              Three voices,
              <br />
              one room.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-mist-500 leading-relaxed">
            Each keeps to its craft. Meridian routes every request to the
            best free model on your connected provider, and Anchor takes over
            when AI is unavailable, so the room is never empty.
          </p>
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-5 gap-4 sm:gap-5">
        {BOTS.map((b, i) => (
          <Reveal
            key={b.name}
            delay={i * 0.08}
            className={cx(b.span, "h-full")}
          >
            <article className="panel rounded-xl h-full flex flex-col overflow-hidden hover-lift group relative">
              <div className="relative p-6 sm:p-7 flex-1 flex flex-col">
                {/* engraved emblem + plate numeral */}
                <div className="flex items-start justify-between mb-5">
                  <div
                    className={cx(
                      "w-12 h-12 rounded-lg border flex items-center justify-center shrink-0",
                      b.well,
                    )}
                  >
                    <b.Sigil className={cx("w-6 h-6", b.ink)} />
                  </div>
                  <span
                    className="font-display italic font-medium text-3xl leading-none text-gold-700/40 group-hover:text-gold-600/70 transition-colors duration-500 select-none"
                    aria-hidden
                  >
                    {b.numeral}
                  </span>
                </div>

                <h3 className="font-display font-medium text-xl sm:text-2xl text-mist-100 leading-tight">
                  {b.name}
                </h3>
                <p className="mt-1 text-[10px] font-mono tracking-[0.18em] uppercase text-mist-500">
                  {b.role}
                </p>
                <DiamondRule className="my-4 text-gold-700/60" />

                <p className="text-[14px] leading-relaxed text-mist-300 mb-5 max-w-lg">
                  {b.line}
                </p>

                {/* Luma: a real margin exchange, set on the cream page
                    the way it actually happens while reading */}
                {b.name === "Luma" && (
                  <div className="mb-5 max-w-md paper rounded-lg p-4 sm:p-5">
                    <p className="font-literata text-[13.5px] leading-relaxed text-paper-ink">
                      Since it is possible that thou mayest depart from life
                      this very moment,{" "}
                      <span className="bg-highlight text-highlight-ink rounded-sm px-0.5">
                        regulate every act and thought accordingly
                      </span>
                      .
                    </p>
                    <div className="mt-3 pt-3 border-t border-paper-200 space-y-2.5">
                      <p className="font-garamond italic text-[15px] leading-snug text-paper-ink">
                        Regulate — how, exactly?
                        <span className="ml-2 font-mono not-italic text-[8px] tracking-[0.18em] uppercase text-paper-ink-soft">
                          you
                        </span>
                      </p>
                      <p className="font-literata text-[13.5px] leading-relaxed text-paper-ink">
                        By the test he keeps returning to: is it just? is it
                        reasonable? does it belong to a human being?
                        <span className="ml-2 font-mono text-[8px] tracking-[0.18em] uppercase text-gold-700">
                          luma · Book II, ¶2
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
                  {b.tags.map((t) => (
                    <li
                      key={t}
                      className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-mist-500"
                    >
                      <span
                        className="h-1 w-1 rotate-45 bg-gold-600/70 shrink-0"
                        aria-hidden
                      />
                      {t}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4 border-t border-ink-700/40">
                  <p className="text-[11px] text-mist-600 leading-relaxed italic">
                    {b.honest}
                  </p>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
