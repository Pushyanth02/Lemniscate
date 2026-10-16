"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft } from "@phosphor-icons/react";
import { useNav } from "../lib/store";
import { cx } from "../lib/utils";

/* ═══════════════════════════════════════════════════════════════════
   Terms & Privacy — the fine print, typeset like everything else in
   the room. The document is set on the signature cream leaf so it
   reads as what it is: a page of the app, honest and reachable, not
   a lawyer's annex in another building. Every clause describes the
   software as it actually behaves. Nothing is invented.
   ═══════════════════════════════════════════════════════════════════ */

interface Section {
  id: string;
  title: string;
  body: string[];
}

const TERMS: Section[] = [
  {
    id: "terms-software",
    title: "The software",
    body: [
      "Lemniscate is a local-first reading room: an application that loads in your web browser and keeps your library on your own device. It is made for private reading, study, and writing.",
    ],
  },
  {
    id: "terms-no-account",
    title: "No account, no service",
    body: [
      "There is nothing to sign up for. The app has no server that receives your documents, no login, and no user database. You use it as a guest of your own browser.",
    ],
  },
  {
    id: "terms-yours",
    title: "Your documents are yours",
    body: [
      "Everything you import stays yours. You are responsible for having the right to read, store, and process the material you bring into the room, including under copyright law.",
    ],
  },
  {
    id: "terms-companions",
    title: "Companions are optional",
    body: [
      "The study companions can run entirely offline, on this device. If you connect an AI provider key, that connection is between you and the provider, under the provider's own terms; requests pass directly from your browser and are never seen by Lemniscate.",
    ],
  },
  {
    id: "terms-fair-use",
    title: "Fair use",
    body: [
      "Please do not use Lemniscate to infringe the rights of others, or to break any law that applies to you.",
    ],
  },
  {
    id: "terms-as-is",
    title: "As-is",
    body: [
      "The software is offered as-is, without warranty of any kind. Browser storage is durable but not infallible: your browser or operating system may clear it. Export work you care about from Settings, under Import & storage.",
    ],
  },
  {
    id: "terms-changes",
    title: "Changes",
    body: [
      "The software and these terms may change. The current text always lives in the app, and continuing to use the room after a change means the revised terms apply.",
    ],
  },
];

const PRIVACY: Section[] = [
  {
    id: "privacy-device",
    title: "What stays on this device",
    body: [
      "Documents and their chapter contents, annotations, bookmarks, scenes, scene notes, stories, activity and usage records are written to IndexedDB, the browser's local database, under the name lemniscate. Preferences and an anonymous, randomly generated profile ID live in localStorage. Typefaces are bundled with the app and load from this device. None of this is uploaded anywhere by the app itself.",
    ],
  },
  {
    id: "privacy-ai",
    title: "AI: what is sent, and when",
    body: [
      "An AI provider key you enter is held in memory only, never written to storage, and is wiped when the page reloads. There are no network requests at all unless you invoke an AI feature with a key set. When you do, your browser talks directly to that provider — nothing passes through any Lemniscate server, because there isn't one.",
      "What each action sends: asking Luma sends your question, the recent conversation, and excerpts from the current and neighbouring chapters it retrieves as context. Requesting an Ouro study set or a deep analysis sends an excerpt of the chapter or book it studies. Asking Ankaa to write from a source document sends an excerpt of that source plus your prompt. Opening the Scene Atlas with a key sends the chapter's text. Validating a key or listing models sends only the request itself.",
      "Import refinement is the one flow that can send a document's full imported text (up to about 30,000 characters) to the provider, and only after you explicitly agree the first time — a dialog explains exactly what will be sent before anything leaves the device. Declining keeps every import fully local; the choice is revocable in Settings, under AI companions.",
      "Whatever you send to a provider is governed by that provider's own privacy policy. Without a key, or with the network unavailable, the offline Anchor engines serve every feature with zero network requests.",
    ],
  },
  {
    id: "privacy-leaves",
    title: "What leaves the room",
    body: [
      "Only the AI requests described above, each one started by you. The typefaces are bundled and self-hosted — no fonts load from Google or anywhere else. There are no analytics scripts, no advertising networks, no telemetry, and no tracking cookies.",
    ],
  },
  {
    id: "privacy-delete",
    title: "Deleting your data",
    body: [
      "Settings, under Import & data, offers three distinct actions. Clear this profile's data removes the current profile's documents, annotations and records while leaving other profiles on the device untouched. Erase ALL app data on this device removes every profile's records, the AI artifact cache, and the app's local preferences — nothing of yours survives it. Removing a single other profile deletes just that profile's data. Active background work is cancelled before any deletion so results cannot reappear afterwards.",
    ],
  },
  {
    id: "privacy-children",
    title: "Children",
    body: [
      "Lemniscate is not directed to children, and it knowingly collects no personal information from anyone.",
    ],
  },
  {
    id: "privacy-truth",
    title: "The source of truth",
    body: [
      "This page describes the software as it actually behaves. The definitive record of what the room does, and does not do, is the code running in your browser.",
    ],
  },
];

const LEADS: Record<TabId, string> = {
  terms:
    "Lemniscate is reading software that runs entirely in your browser. These terms say what that means for you, in plain words.",
  privacy:
    "The short version: no accounts, no analytics, no telemetry, no tracking. Your library lives in this browser and nowhere else.",
};

type TabId = "terms" | "privacy";

export default function Legal() {
  const sub = useNav((s) => s.sub);
  const go = useNav((s) => s.go);
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabId>(sub === "privacy" ? "privacy" : "terms");
  const [active, setActive] = useState<string | null>(null);

  /* deep links: footer and Settings pass { sub: "privacy" } to open the
     privacy leaf directly; local tab switches stay local so they don't
     pollute the back-stack */
  useEffect(() => {
    setTab(sub === "privacy" ? "privacy" : "terms");
  }, [sub]);

  const doc = tab === "terms" ? TERMS : PRIVACY;

  const jump = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
  };

  /* scroll-spy for the contents rail: the last section whose heading has
     crossed a reading line ~a third of the way down the viewport is the
     one you're reading */
  useEffect(() => {
    const onScroll = () => {
      const line = Math.min(window.innerHeight * 0.35, 340);
      let current: string | null = null;
      for (const s of doc) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < line) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [doc]);

  const tabs = useMemo(
    () =>
      [
        { id: "terms", label: "Terms of use" },
        { id: "privacy", label: "Privacy" },
      ] as const,
    [],
  );

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "terms" ? "privacy" : "terms";
    setTab(next);
    document.getElementById(`legal-tab-${next}`)?.focus();
  };

  return (
    <div className="pb-20 sm:pb-28">
      {/* ── title page chrome, centered like a book's half-title ── */}
      <header className="pt-10 sm:pt-14 pb-8 sm:pb-10 text-center px-4">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-mist-500">
          Lemniscate · Cloth &amp; Gilt edition
        </p>
        <h1 className="mt-3 font-display italic font-medium text-3xl sm:text-[2.6rem] leading-tight text-mist-100">
          Terms &amp; privacy
        </h1>
        <p className="mt-3 max-w-md mx-auto text-[13px] font-body leading-relaxed text-mist-500">
          The fine print, set in Garamond like everything else worth
          reading. Plain words, no invented promises.
        </p>

        {/* leaf selector */}
        <div
          role="tablist"
          aria-label="Legal documents"
          className="mt-7 inline-flex items-center rounded-full border border-ink-600 bg-ink-850/70 p-1 gap-1"
        >
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                id={`legal-tab-${t.id}`}
                role="tab"
                aria-selected={on}
                aria-controls="legal-leaf"
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0, behavior: "auto" });
                }}
                onKeyDown={onTabKey}
                className={cx(
                  "rounded-full px-5 py-2 text-[13px] font-body font-medium tracking-wide transition-colors press",
                  on
                    ? "bg-gold-500/12 text-gold-300 border border-gold-700/40"
                    : "text-mist-400 hover:text-mist-100 border border-transparent",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── the leaf itself ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 xl:flex xl:gap-12 xl:justify-center">
        {/* contents rail — a quiet index beside the page */}
        <nav
          aria-label="Contents"
          className="hidden xl:block w-52 shrink-0"
        >
          <div className="sticky top-28">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-mist-600 mb-3">
              Contents
            </p>
            <ul className="space-y-0.5">
              {doc.map((s, i) => {
                const on = active === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => jump(s.id)}
                      className={cx(
                        "w-full text-left flex items-baseline gap-2.5 rounded-lg py-1.5 pr-2 transition-colors",
                        on
                          ? "text-gold-300"
                          : "text-mist-400 hover:text-mist-100",
                      )}
                    >
                      <span
                        className={cx(
                          "font-display italic text-sm w-4 text-right shrink-0",
                          on ? "text-gold-400" : "text-mist-500",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[12.5px] font-body leading-snug border-l border-ink-700 pl-2.5">
                        {s.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <article
          role="tabpanel"
          id="legal-leaf"
          aria-labelledby={`legal-tab-${tab}`}
          className="paper rounded-lg sm:rounded-xl w-full max-w-2xl xl:max-w-none xl:flex-1 px-6 sm:px-10 lg:px-14 py-10 sm:py-14"
        >
          {/* running head, like a page of the reader */}
          <header>
            <p className="font-mono text-[10px] tracking-[0.26em] uppercase text-paper-ink-soft">
              Lemniscate · {tab === "terms" ? "Terms of use" : "Privacy"}
            </p>
            <h2 className="mt-3 font-display font-semibold text-[1.9rem] sm:text-4xl text-paper-ink leading-tight">
              {tab === "terms" ? "Terms of use" : "Privacy"}
            </h2>
            <div
              className="mt-5 h-px w-full"
              style={{
                background:
                  "linear-gradient(90deg, #b2873c66, #b2873c22 70%, transparent)",
              }}
              aria-hidden
            />
            <p className="mt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-paper-ink-soft">
              Version 1.0 · applies to this copy of the app
            </p>
          </header>

          {/* preface */}
          <p className="mt-8 font-garamond italic text-[17px] leading-[1.72] text-paper-ink-soft">
            {LEADS[tab]}
          </p>

          {/* sections, numbered like chapters */}
          <div className="mt-9 space-y-9">
            {doc.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <div className="flex items-baseline gap-4">
                  <span
                    className="font-display italic text-[1.35rem] leading-none text-gold-700 w-5 shrink-0 text-right tabular-nums"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-display font-semibold text-[1.3rem] text-paper-ink leading-snug">
                    {s.title}
                  </h3>
                </div>
                <div className="mt-2.5 pl-9 space-y-3.5">
                  {s.body.map((p, j) => (
                    <p
                      key={j}
                      className={cx(
                        "font-garamond text-[16.5px] leading-[1.78] text-paper-ink/92 text-pretty",
                        i === 0 && j === 0 && "legal-dropcap",
                      )}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* colophon & the way back */}
          <footer className="mt-12 pt-8 border-t border-paper-line text-center">
            <button
              onClick={() => go("dashboard")}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-body font-medium text-paper-ink-soft hover:text-gold-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
              Return to the reading room
            </button>
            <p className="mt-4 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-ink-soft/70">
              ∞ Set in EB Garamond, like the rest of the room
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
