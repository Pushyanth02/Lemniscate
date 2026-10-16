"use client";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { CloudArrowUp, ArrowRight } from "@phosphor-icons/react";
import { useNav } from "../lib/store";
import { Button, Dialog, Textarea } from "../components/ui";
import { useDocuments, useQuery } from "../lib/data";
import { idbLatestByComposite, getUserId } from "../lib/db";
import type { AnnotationRow } from "../lib/types";
import {
  CARD_QUOTES,
  READING_QUOTES,
  useSessionPicks,
} from "../lib/quotes";
import { sortDocs } from "../lib/utils";
import { SECTION_IDS, type SectionId } from "./landing/motion";
import { LandingHeader } from "./landing/landing-header";
import { Hero } from "./landing/hero";
import { Shelf } from "./landing/shelf";
import { Companions } from "./landing/sections/companions";
import { Instruments } from "./landing/sections/instruments";
import { Marginalia } from "./landing/sections/marginalia";
import { Features } from "./landing/sections/features";
import { Faq } from "./landing/sections/faq";
import { Cta } from "./landing/sections/cta";
import { LandingFooter } from "./landing/footer";

export default function Landing() {
  const go = useNav((s) => s.go);
  const setPendingFile = useNav((s) => s.setPendingFile);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* the shelf is real: only documents actually on this device, most
     recently read first. Nothing staged, nothing random. */
  const openDoc = useNav((s) => s.openDoc);
  const docsQ = useDocuments();
  const docs = useMemo(
    () => (docsQ.data ? sortDocs(docsQ.data, "recent").slice(0, 6) : []),
    [docsQ.data],
  );

  /* the wall is real too: this identity's annotations, newest first.
     Watches the annotations store, so a mark made in the reader is on
     the wall the moment this view next renders — no reload. DB v6:
     a descending composite-index cursor fetches just the six the wall
     shows, never the whole store. */
  const marksQ = useQuery(
    () =>
      idbLatestByComposite<AnnotationRow>(
        "annotations",
        "by_user_ts",
        getUserId(),
        6,
      ),
    [],
    ["annotations"],
  );
  const marks = useMemo(() => marksQ.data ?? [], [marksQ.data]);

  /* borrowed lines for the empty wall + the floating hero page —
     session-stable, never flickering mid-view */
  const borrowed = useSessionPicks(READING_QUOTES, 6);
  const heroPicks = useSessionPicks(CARD_QUOTES, 1);
  const heroQuote = heroPicks?.[0];

  /* header deepens once the page starts moving */
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled((prev) => {
      const next = y > 24;
      return prev === next ? prev : next;
    });
  });

  /* scroll-spy: highlight nav link for the section currently in view */
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection((prev) => (prev === id ? prev : id));
            }
          }
        },
        { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  /* Hand a selected file to the Upload view for immediate processing. */
  const handoffFile = useCallback(
    (file: File) => {
      setPendingFile(file);
      go("upload");
    },
    [setPendingFile, go],
  );

  return (
    <div
      className="min-h-screen bg-ink-950 text-mist-200 relative overflow-x-clip font-body"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        /* only clear when the pointer leaves the window entirely */
        if (!e.relatedTarget) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handoffFile(f);
      }}
    >
      {/* ---------- header (full-width sticky bar) + mobile menu ---------- */}
      <LandingHeader
        scrolled={scrolled}
        activeSection={activeSection}
        onLibrary={() => go("library")}
        onEnter={() => go("dashboard")}
      />

      {/* ---------- hero · format ledger · the margin (reader showcase) ---------- */}
      <Hero
        heroQuote={heroQuote}
        docs={docs}
        onUpload={() => fileInputRef.current?.click()}
        onEnter={() => go("dashboard")}
        onOpenDoc={openDoc}
        onLibrary={() => go("library")}
      />

      {/* ---------- my library — the real shelf, nothing staged ---------- */}
      <Shelf
        docs={docs}
        docsQ={docsQ}
        onOpenDoc={openDoc}
        onUpload={() => fileInputRef.current?.click()}
        onLibrary={() => go("library")}
      />

      {/* ---------- companions — engraved plates, hand-drawn sigils ---------- */}
      <Companions />

      {/* ---------- the instruments: one console, two engines ---------- */}
      <Instruments />

      {/* ---------- notes & marginalia — the live commonplace wall ---------- */}
      <Marginalia
        marksQ={marksQ}
        marks={marks}
        docs={docsQ.data}
        borrowed={borrowed}
        onOpenDoc={openDoc}
        onHistory={() => go("history")}
      />

      {/* ---------- features ---------- */}
      <Features onSettings={() => go("settings")} />

      {/* ---------- FAQ — plain answers, mirrored in FAQPage structured data ---------- */}
      <Faq />

      {/* ---------- CTA ---------- */}
      <Cta
        onUpload={() => fileInputRef.current?.click()}
        onPaste={() => setPasteOpen(true)}
      />

      {/* ---------- footer ---------- */}
      <LandingFooter
        onLibrary={() => go("library")}
        onSettings={() => go("settings")}
        onTerms={() => go("legal")}
        onPrivacy={() => go("legal", { sub: "privacy" })}
      />

      {/* ---------- full-page drag handoff ---------- */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-60 pointer-events-none bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-6"
            aria-hidden
          >
            <div className="rounded-2xl border-2 border-dashed border-gold-500 bg-ink-950/70 px-8 py-10 sm:px-14 sm:py-12 text-center shadow-glow-gold">
              <CloudArrowUp className="w-10 h-10 mx-auto mb-4 text-gold-400" />
              <p className="font-display text-2xl sm:text-3xl text-mist-100">
                Drop to open it in the reading room
              </p>
              <p className="mt-3 text-[10px] font-body tracking-[0.22em] uppercase text-mist-500">
                PDF · EPUB · DOCX · PPTX · Markdown · TXT · HTML
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- paste-text dialog ---------- */}
      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste text to import"
      >
        <div className="space-y-4">
          <p className="text-sm text-mist-300 leading-relaxed">
            Paste an article, a letter, or any passage worth keeping. It
            becomes a new document in your library, parsed entirely on-device.
          </p>
          <Textarea
            label="Your text"
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste anything worth reading slowly."
          />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
            <Button
              variant="ghost"
              onClick={() => setPasteOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={!pasteText.trim()}
              className="w-full sm:w-auto"
              onClick={() => {
                const text = pasteText.trim();
                if (!text) return;
                const slug =
                  text
                    .slice(0, 48)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 24) || "pasted";
                handoffFile(
                  new File([text], `${slug}.txt`, { type: "text/plain" }),
                );
                setPasteOpen(false);
                setPasteText("");
              }}
            >
              Import as document
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Hidden file input — triggered by the hero + CTA buttons and any
          drop on the page. On selection, the file is handed off to the
          Upload view for processing. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.docx,.pptx,.ppt,.md,.markdown,.txt,.text,.html,.htm"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handoffFile(f);
          e.target.value = ""; // reset so the same file can be re-selected
        }}
      />
    </div>
  );
}
