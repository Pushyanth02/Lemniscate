"use client";

import { Fragment } from "react";
import { Reveal, Eyebrow } from "../../../components/ui";
import { BrandMark } from "../../../components/brand";
import { DiamondRule } from "../../../components/sigils";
import { cx } from "../../../lib/utils";
import { INFRA } from "../content";
import { RouteDiagram, HeldLineDiagram } from "../diagrams";

export function Instruments() {
  return (
    <section className="border-y border-ink-700/60 bg-ink-900/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-12">
            <div>
              <Eyebrow className="mb-3">The instruments under the floor</Eyebrow>
              <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
                Meridian curates.
                <br />
                Anchor never sleeps.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-mist-500 leading-relaxed">
              Two quiet engines attend every request. You never see either
              one at work — you only notice that the room never goes dark.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          {/* the console: one panel, a spine, an engine on each side */}
          <div className="panel rounded-2xl overflow-hidden shadow-card">
            <div className="grid lg:grid-cols-[1fr_auto_1fr]">
              {INFRA.map((b, i) => (
                <Fragment key={b.name}>
                  {i === 1 && (
                    /* the spine — hairlines with the lemniscate at the
                       splice, holding the two engines together */
                    <div
                      className="hidden lg:flex flex-col items-center py-8"
                      aria-hidden
                    >
                      <div className="flex-1 w-px bg-ink-700/60" />
                      <BrandMark size={22} className="my-3.5 text-gold-600/80" />
                      <div className="flex-1 w-px bg-ink-700/60" />
                    </div>
                  )}
                  {/* the engraved banner plate: a tinted standard at the
                     head, the instrument panel at the heart, the plate
                     legend below, the honest line stamped at the foot */}
                  <article
                    className={cx(
                      "flex flex-col min-w-0",
                      i === 1 && "border-t border-ink-700/60 lg:border-t-0",
                    )}
                  >
                    <div className={cx("px-5 sm:px-6 pt-5 sm:pt-6", b.well)}>
                      <div className="flex items-center gap-4 sm:gap-5 pb-5 border-b border-ink-950/40">
                        <div
                          className={cx(
                            "w-14 h-14 rounded-full border border-ink-700/60 bg-ink-950/60 flex items-center justify-center shrink-0",
                          )}
                        >
                          <b.Sigil className={cx("w-8 h-8", b.ink)} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display font-medium text-2xl text-mist-100 leading-tight">
                            {b.name}
                          </h3>
                          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-mist-500 mt-1">
                            {b.role}
                          </p>
                        </div>
                        <span
                          className={cx(
                            "ml-auto font-display italic text-2xl text-gold-700/50 select-none hidden sm:block",
                          )}
                          aria-hidden
                        >
                          {i === 0 ? "I" : "II"}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 pt-5 flex flex-col flex-1">
                      <p className="text-[14px] sm:text-[15px] leading-relaxed text-mist-400 mb-5">
                        {b.line}
                      </p>

                      {/* the instrument panel: one hairline chart each */}
                      <div className="mb-5 rounded-lg border border-ink-700/60 bg-ink-950/60 px-4 pt-4 pb-2">
                        {b.name === "Meridian" ? (
                          <RouteDiagram />
                        ) : (
                          <HeldLineDiagram />
                        )}
                      </div>

                      {/* the plate legend — hairline rules between rows */}
                      <dl className="grid sm:grid-cols-2 gap-x-6 mb-5">
                        {b.ledger.map(([k, v]) => (
                          <div
                            key={k}
                            className="min-w-0 border-t border-ink-700/50 pt-2.5"
                          >
                            <dt className="font-mono uppercase tracking-[0.14em] text-[10px] text-gold-400/80">
                              {k}
                            </dt>
                            <dd className="text-[12px] leading-relaxed text-mist-400 mt-0.5">
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      {/* the foot: the rule, then the honest line */}
                      <div className="mt-auto pt-4">
                        <DiamondRule className="text-gold-700/60 mb-3" />
                        <p className="text-[11px] text-mist-600 leading-relaxed italic">
                          {b.honest}
                        </p>
                      </div>
                    </div>
                  </article>
                </Fragment>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
