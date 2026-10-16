"use client";

import { Reveal, Eyebrow } from "../../../components/ui";
import { Plus } from "@phosphor-icons/react";
import { cx } from "../../../lib/utils";
import { FAQ_ITEMS } from "../../../lib/faq";

/* The questions and answers live in lib/faq.ts — the same list ships as
   FAQPage structured data from the static HTML head (layout.tsx), so
   non-JS crawlers and LLMs read exactly what visitors see here. */

export function Faq() {
  return (
    <section id="faq" className="border-t border-ink-700/60 bg-ink-900/40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal>
          <Eyebrow className="mb-3">Plain answers</Eyebrow>
          <h2 className="font-display font-medium text-3xl sm:text-4xl text-mist-100 leading-tight">
            Questions, asked and
            <br />
            answered.
          </h2>
        </Reveal>
        <div className="mt-8 sm:mt-10 space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i * 0.05, 0.2)}>
              <details className="group rounded-xl border border-ink-700/70 bg-ink-850 hover:border-gold-700/50 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-display font-medium text-[17px] sm:text-lg text-mist-100 leading-snug">
                    {item.q}
                  </span>
                  <Plus
                    aria-hidden
                    className={cx(
                      "w-4 h-4 shrink-0 text-gold-500 transition-transform duration-300",
                      "group-open:rotate-45",
                    )}
                  />
                </summary>
                <p className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-[13.5px] sm:text-sm leading-relaxed text-mist-400">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
