"use client";

import dynamic from "next/dynamic";
import { BrandMark } from "@/components/brand";

/* The entire Lemniscate app is local-first: IndexedDB, localStorage,
   pdf.js workers, canvas — none of which exist on the server. We load
   it as a client-only chunk so SSR never touches the browser APIs. */
const App = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-ink-950">
      <BrandMark size={64} animated className="text-gold-500" strokeWidth={2.5} />
      <p className="text-[11px] font-display uppercase tracking-[0.3em] text-mist-500 animate-pulse-soft">
        Opening the reading room…
      </p>
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <App />
      {/* Crawlable without JavaScript, and honest about why: Lemniscate is
          a client-only application (the library lives in the reader's
          browser), so this block is what a no-JS visitor or crawler —
          GPTBot, ClaudeBot and friends — finds in the static HTML. It
          states the same facts as llms.txt and the JSON-LD in the head. */}
      <noscript>
        <div className="min-h-screen bg-ink-900 text-mist-200 font-body px-6 py-16">
          <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="font-display text-4xl text-mist-100 font-medium">
              Lemniscate — a local-first AI reading room
            </h1>
            <p className="leading-relaxed text-mist-300">
              Lemniscate turns your documents into living, interactive
              reading: import PDF, EPUB, DOCX, PPTX, Markdown, TXT or HTML
              files and read them in a distraction-free reader with
              annotations, bookmarks and book-grade typography. Three AI
              companions work beside the text — a margin companion that
              answers with citations from the open book, a study-set
              companion for summaries, themes, characters, quizzes and
              flashcards, and a long-form writing companion.
            </p>
            <p className="leading-relaxed text-mist-400">
              Everything stays on your device: the library lives in your
              browser&rsquo;s IndexedDB storage, there is no account and no
              server. The offline Anchor engine works with no setup at all;
              connecting your own free key from OpenRouter, Google Gemini,
              xAI Grok, Groq, Mistral or Cerebras unlocks live model
              answers, and the key never leaves your browser&rsquo;s memory.
            </p>
            <p className="leading-relaxed text-mist-500">
              Lemniscate runs entirely in your browser and needs JavaScript
              to open the reading room. Nothing is lost by leaving — no data
              is stored on any server.
            </p>
          </div>
        </div>
      </noscript>
    </>
  );
}
