"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Books,
  ArrowRight,
  X,
  List,
  CaretRight,
} from "@phosphor-icons/react";
import { BrandMark } from "../../components/brand";
import { Button } from "../../components/ui";
import { cx } from "../../lib/utils";
import { EASE, Magnetic, scrollTo, type SectionId } from "./motion";

export function LandingHeader({
  scrolled,
  activeSection,
  onLibrary,
  onEnter,
}: {
  scrolled: boolean;
  activeSection: SectionId | null;
  onLibrary: () => void;
  onEnter: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks: [string, SectionId, () => void][] = [
    ["Companions", "bots", () => scrollTo("bots")],
    ["Features", "features", () => scrollTo("features")],
    ["Demo", "demo", () => scrollTo("demo")],
  ];

  return (
    <>
      {/* ---------- header (full-width sticky bar) ---------- */}
      <header
        className={cx(
          "sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-500",
          scrolled
            ? "border-ink-800 bg-ink-950/95"
            : "border-transparent bg-ink-950/70",
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center gap-4 sm:gap-6">
            <button
              onClick={() =>
                window.scrollTo({ top: 0, behavior: "smooth" })
              }
              className="flex items-center gap-3 shrink-0"
              aria-label="Lemniscate, back to top"
            >
              <BrandMark size={26} animated className="text-gold-500" />
              <span className="font-display font-semibold tracking-[0.2em] uppercase text-[13px] sm:text-sm text-mist-100">
                Lemniscate
              </span>
              <span className="hidden lg:block text-[9px] font-body tracking-[0.28em] uppercase text-mist-600 border-l border-ink-700 pl-5 ml-1">
                A local-first reading room
              </span>
            </button>

            <nav
              className="hidden md:flex items-center gap-1 mx-auto"
              aria-label="Landing"
            >
              {navLinks.map(([label, id, run]) => {
                const active = activeSection === id;
                return (
                  <button
                    key={label}
                    onClick={run}
                    aria-current={active ? "true" : undefined}
                    className={cx(
                      "relative px-3 py-2 text-[13px] font-body font-medium transition-colors inline-flex items-center min-h-10",
                      active
                        ? "text-gold-300"
                        : "text-mist-400 hover:text-gold-300",
                    )}
                  >
                    {label}
                    <span
                      className={cx(
                        "absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-gold-400 transition-all duration-400",
                        active ? "w-5 opacity-100" : "w-0 opacity-0",
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 ml-auto md:ml-0 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={onLibrary}
                className="hidden sm:inline-flex min-h-10"
              >
                <Books className="w-3.5 h-3.5" />
                Library
              </Button>
              <Magnetic>
                {/* Compact label under sm: the full "Enter the room" pill
                    plus brand and menu icon cannot fit a 390px header
                    row without overflowing the viewport edge. */}
                <Button
                  variant="gold"
                  size="sm"
                  onClick={onEnter}
                  className="min-h-10 group"
                  aria-label="Enter the room"
                >
                  <span className="sm:hidden">Enter</span>
                  <span className="hidden sm:inline">Enter the room</span>
                  <span
                    aria-hidden
                    className="ml-0.5 w-6 h-6 rounded-full bg-ink-950/15 hidden sm:flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    <CaretRight className="w-3 h-3" weight="bold" />
                  </span>
                </Button>
              </Magnetic>

              {/* mobile menu trigger */}
              <button
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-ink-600 text-mist-300 hover:text-gold-300 hover:border-gold-700/60 transition-colors shrink-0"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="w-4 h-4" />
                ) : (
                  <List className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- mobile menu (full-screen glass, staggered reveal) ---------- */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 bg-ink-950/90 backdrop-blur-2xl md:hidden flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="h-14 flex items-center justify-between px-4 safe-top">
              <div className="flex items-center gap-2.5">
                <BrandMark size={24} className="text-gold-500" />
                <span className="font-display font-semibold tracking-[0.2em] uppercase text-sm text-mist-100">
                  Lemniscate
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-full border border-ink-600 flex items-center justify-center text-mist-300"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col justify-center px-8 gap-2" aria-label="Mobile">
              {navLinks.map(([label, , run], i) => (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.5, ease: EASE }}
                  onClick={() => {
                    run();
                    setMobileMenuOpen(false);
                  }}
                  className="text-left font-display text-3xl text-mist-200 hover:text-gold-300 py-3 transition-colors"
                >
                  {label}
                </motion.button>
              ))}
              <motion.button
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.5, ease: EASE }}
                onClick={() => {
                  onLibrary();
                  setMobileMenuOpen(false);
                }}
                className="text-left font-display text-3xl text-mist-200 hover:text-gold-300 py-3 transition-colors"
              >
                Library
              </motion.button>
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.5, ease: EASE }}
                className="pt-6"
              >
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    onEnter();
                    setMobileMenuOpen(false);
                  }}
                >
                  Enter the room
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
