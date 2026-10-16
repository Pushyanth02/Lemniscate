"use client";

import { BrandMark } from "../../components/brand";
import { Question } from "@phosphor-icons/react";
import { scrollTo } from "./motion";

export function LandingFooter({
  onLibrary,
  onSettings,
  onTerms,
  onPrivacy,
}: {
  onLibrary: () => void;
  onSettings: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}) {
  return (
    <footer className="border-t border-ink-700/60 bg-ink-950 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <BrandMark size={26} className="text-gold-500" />
          <div>
            <p className="font-display font-semibold tracking-[0.22em] uppercase text-sm text-mist-100">
              Lemniscate
            </p>
            <p className="mt-1 text-[12px] text-mist-500">
              Local-first reading for a more thoughtful internet.
            </p>
          </div>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-7 gap-y-3"
          aria-label="Footer"
        >
          {(
            [
              ["Library", onLibrary],
              ["Features", () => scrollTo("features")],
              ["Demo", () => scrollTo("demo")],
              ["Settings", onSettings],
              ["Terms", onTerms],
              ["Privacy", onPrivacy],
            ] as [string, () => void][]
          ).map(([label, run]) => (
            <button
              key={label}
              onClick={run}
              className="group relative text-[13px] font-body text-mist-400 hover:text-gold-300 transition-colors inline-flex items-center min-h-7"
            >
              {label}
              <span
                className="absolute -bottom-0.5 left-0 h-px w-0 bg-gold-500 transition-all duration-300 group-hover:w-full"
                aria-hidden
              />
            </button>
          ))}
        </nav>
      </div>

      <div className="border-t border-ink-700/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-mist-600 flex items-center gap-1.5">
            <Question className="w-3.5 h-3.5" />
            Documentation lives in Settings → About.
          </p>
          <p className="text-[11px] text-mist-600 font-display tracking-wide">
            ∞ Read, annotate, create, return.
          </p>
        </div>
      </div>
    </footer>
  );
}
