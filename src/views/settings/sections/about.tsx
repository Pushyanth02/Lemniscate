import { BookOpen, CheckCircle, Shield } from "@phosphor-icons/react";
import { useNav, useShallow } from "../../../lib/store";
import { Button, Panel } from "../../../components/ui";

/* About: what the room is, the documentation notes, the edition line. */
export function AboutSection() {
  const nav = useNav(useShallow((s) => ({ go: s.go })));

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display italic text-2xl text-mist-100 mb-3">
          Lemniscate, the reading room
        </h2>
        <p className="text-sm text-mist-400 leading-relaxed mb-3">
          A local-first reading room where books, papers, documents and
          stories become living, interactive experiences. Import once;
          read in a calm, chapter-aware reader; converse with Luma,
          study with Ouro, and write with Ankaa, all grounded in your
          text.
        </p>
        <p className="text-sm text-mist-400 leading-relaxed flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
          <span>
            Privacy: your library, notes and progress live only in
            this browser. An optional provider key, when you invoke a
            companion, sends the relevant excerpts directly to that
            provider — and nothing else, ever.
          </span>
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => nav.go("legal")}
          >
            Read the terms of use
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => nav.go("legal", { sub: "privacy" })}
          >
            Read the privacy note
          </Button>
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-4">
          Documentation
        </h2>
        <ul className="space-y-3.5">
          {[
            [
              "Import",
              "Drop PDF, EPUB, DOCX, Markdown, TXT or HTML onto the Import view. The engine validates content signatures, strips boilerplate, mends broken lines, detects chapters from real structure and quality-scores the result.",
            ],
            [
              "Reader",
              "Alt+←/→ changes chapters · b bookmarks · f focus mode · s scene view · t index · l Luma · / search · ? all shortcuts.",
            ],
            [
              "Companions",
              "Luma answers from the active chapter; Ouro builds cached study sets; Ankaa drafts long-form as visible jobs. Without a key, grounded Anchor engines take over.",
            ],
            [
              "Data",
              "Stored in IndexedDB under lemniscate. Export anytime from Import & storage. Deleting a document removes its bookmarks, annotations and scenes.",
            ],
          ].map(([t, b]) => (
            <li key={t} className="flex gap-3">
              <CheckCircle className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[15px] font-display font-medium text-mist-100">
                  {t}
                </p>
                <p className="text-xs text-mist-500 leading-relaxed mt-1">
                  {b}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 pt-4 border-t border-ink-700 text-[11px] font-body text-mist-600 flex items-center gap-2 flex-wrap">
          <BookOpen className="w-3.5 h-3.5 text-gold-600 shrink-0" />
          <span>Lemniscate v1.0 · Cloth &amp; Gilt edition</span>
          <span className="opacity-60">·</span>
          <span className="opacity-70">
            Cormorant Garamond &amp; Instrument Sans · reader faces:
            Literata, EB Garamond, Spectral, Source Serif, Georgia,
            Bookerly, Baskerville, Palatino
          </span>
        </p>
      </Panel>
    </>
  );
}
