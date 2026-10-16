"use client";

import { Gear } from "@phosphor-icons/react";
import { Reveal, Eyebrow, Button } from "../../../components/ui";
import { cx } from "../../../lib/utils";
import { FEATURES } from "../content";

export function Features({ onSettings }: { onSettings: () => void }) {
  return (
    <section id="features" className="scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-12">
            <div>
              <Eyebrow className="mb-3">Why Lemniscate</Eyebrow>
              <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
                Built for the long
                <br />
                sit-down.
              </h2>
            </div>
            <Button
              variant="outline"
              onClick={onSettings}
              className="min-h-11"
            >
              <Gear className="w-4 h-4" />
              Tune it in Settings
            </Button>
          </div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 0.07}
              className={cx(f.span ?? "", "h-full")}
            >
              <div
                className={cx(
                  "rounded-xl border shadow-card p-5 sm:p-6 h-full hover-lift group flex flex-col",
                  f.skin === "tint"
                    ? "border-ink-600/70 bg-ink-800"
                    : f.skin === "gilt"
                      ? "border-gold-700/45 bg-ink-850 hover:border-gold-600/60"
                      : "border-ink-700/70 bg-ink-850 hover:border-gold-700/50",
                )}
              >
                <div
                  className={cx(
                    "w-10 h-10 rounded-lg border flex items-center justify-center mb-4 transition-colors",
                    f.chip === "gilt"
                      ? "border-gold-700/40 bg-gold-500/10"
                      : "border-ink-600 bg-ink-800 group-hover:border-gold-700/50 group-hover:bg-gold-500/10",
                  )}
                >
                  <f.icon
                    className={cx(
                      "w-5 h-5 transition-colors",
                      f.chip === "gilt"
                        ? "text-gold-300"
                        : "text-gold-500 group-hover:text-gold-300",
                    )}
                  />
                </div>
                <h3 className="font-display font-medium text-[17px] sm:text-lg leading-snug text-mist-100">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-mist-400">
                  {f.body}
                </p>

                {/* typography cell: real type specimens. mt-auto pins every
                    specimen to the card base so the extra content aligns
                    across the row instead of floating mid-card */}
                {f.title === "Book-grade typography" && (
                  <div
                    className="mt-auto pt-4 flex items-end gap-5 pb-1"
                    aria-hidden
                  >
                    <span className="font-literata italic text-[26px] leading-none text-gold-200">
                      Aa
                    </span>
                    <span className="font-garamond text-[26px] leading-none text-mist-200">
                      Aa
                    </span>
                    <span className="font-spectral text-[26px] leading-none text-mist-400">
                      Aa
                    </span>
                    <span className="font-baskerville text-[26px] leading-none text-mist-600">
                      Aa
                    </span>
                  </div>
                )}

                {/* annotations cell: a real mark sample */}
                {f.title === "Annotations" && (
                  <p
                    className="mt-auto pt-4 font-literata text-[14px] leading-relaxed text-mist-400"
                    aria-hidden
                  >
                    <span className="bg-highlight text-highlight-ink rounded-sm px-0.5">
                      regulate every act and thought
                    </span>{" "}
                    accordingly.
                  </p>
                )}

                {/* scene cell: a real scene-card sample */}
                {f.title === "Scene view" && (
                  <div
                    className="mt-auto pt-4 rounded-lg border border-ink-600 bg-ink-800/60 p-3.5"
                    aria-hidden
                  >
                    <p className="text-[9px] font-mono tracking-[0.18em] text-mist-600 uppercase">
                      EXT. dawn
                    </p>
                    <p className="font-display italic text-[17px] text-mist-100 leading-snug mt-1">
                      The river Gran, among the Quadi
                    </p>
                    <p className="text-[10px] font-mono text-ouro-300 mt-1.5">
                      mood: hushed clarity
                    </p>
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
