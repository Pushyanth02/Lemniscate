import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookOpen,
  Highlighter,
  Trash,
} from "@phosphor-icons/react";
import {
  Button,
  IconBtn,
  Sheet,
  Skeleton,
  Tabs,
} from "../../components/ui";
import {
  useAnnotations,
  useBookmarks,
  removeAnnotation,
  removeBookmark,
} from "../../lib/data";
import { toast } from "../../lib/store";
import type { DocWithContent } from "../../lib/types";
import { cx } from "../../lib/utils";

/* ================= Chapter index ================= */

export function ChapterIndexSheet({
  open,
  onClose,
  doc,
  chapterIndex,
  onJumpChapter,
  onJumpChunk,
}: {
  open: boolean;
  onClose: () => void;
  doc: DocWithContent;
  chapterIndex: number;
  onJumpChapter: (i: number) => void;
  onJumpChunk: (gi: number) => void;
}) {
  const [tab, setTab] = useState("chapters");
  const bookmarks = useBookmarks(doc.id);
  const annotations = useAnnotations(doc.id);
  useEffect(() => {
    if (open) setTab("chapters");
  }, [open]);

  /* Per-chapter word counts, computed once per document instead of
     re-walking every chapter's full text on each render (sheet open, tab
     switch, any bookmarks/annotations query bump). Index-aligned with
     doc.contentJson.chapters. */
  const chapterWords = useMemo(
    () =>
      doc.contentJson.chapters.map((ch) =>
        ch.chunks.reduce((a, c) => a + c.text.split(/\s+/).length, 0),
      ),
    [doc.contentJson.chapters],
  );

  const chunkText = (gi: number) => {
    for (const ch of doc.contentJson.chapters) {
      if (gi < ch.startChunk + ch.chunks.length)
        return ch.chunks[gi - ch.startChunk]?.text ?? "";
    }
    return "";
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Index"
      side="left"
      width="max-w-sm"
    >
      <div className="sticky top-0 bg-ink-875/95 backdrop-blur-md z-10 px-4 sm:px-5 pt-3 border-b border-ink-700">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "chapters",
              label: "Chapters",
              icon: <BookOpen className="w-3.5 h-3.5" />,
            },
            {
              id: "bookmarks",
              label: `Bookmarks`,
              icon: <Bookmark className="w-3.5 h-3.5" />,
            },
            {
              id: "notes",
              label: "Notes",
              icon: <Highlighter className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>
      <div className="p-3 sm:p-4">
        {tab === "chapters" && (
          <ul className="space-y-1">
            {doc.contentJson.chapters.map((ch, i) => {
              const words = chapterWords[i] ?? 0;
              const read = ch.startChunk <= doc.lastChunkIndex;
              return (
                <li key={ch.id}>
                  <button
                    onClick={() => {
                      onJumpChapter(i);
                      onClose();
                    }}
                    className={cx(
                      "group w-full flex items-center gap-3 rounded-lg text-left transition-colors py-2.5",
                      i === chapterIndex
                        ? "bg-gold-500/8 pr-3 pl-2"
                        : "hover:bg-ink-750/60 px-3",
                    )}
                  >
                    {/* The gilt bar marks the chapter you are in. */}
                    <span
                      aria-hidden
                      className={cx(
                        "w-0.5 self-stretch rounded-full shrink-0 transition-colors",
                        i === chapterIndex ? "bg-gold-500" : "bg-transparent",
                      )}
                    />
                    <span
                      className={cx(
                        "w-4 text-right font-mono text-[10px] tabular-nums shrink-0 mt-0.5",
                        read ? "text-gold-500" : "text-mist-600",
                      )}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          "block text-[13.5px] truncate font-display leading-snug",
                          i === chapterIndex
                            ? "text-gold-300"
                            : "text-mist-400 group-hover:text-mist-200",
                        )}
                      >
                        {ch.title}
                      </span>
                      <span className="block text-[10px] font-mono text-mist-600 mt-0.5">
                        {ch.chunks.length} passages · {words.toLocaleString()}{" "}
                        words
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tab === "bookmarks" &&
          (bookmarks.loading ? (
            <Skeleton className="h-24" />
          ) : (bookmarks.data ?? []).length === 0 ? (
            <p className="text-sm text-mist-500 px-3 py-8 text-center leading-relaxed">
              No bookmarks yet. Press <kbd>b</kbd> while reading.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {(bookmarks.data ?? []).map((b) => (
                <li
                  key={b.id}
                  className="hairline rounded-xl bg-ink-875 p-3.5 hover-lift"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm text-gold-300 font-display truncate">
                      {b.label || "Bookmark"}
                    </p>
                    <IconBtn
                      label="Delete bookmark"
                      className="w-7 h-7 shrink-0"
                      onClick={() => {
                        void removeBookmark(b.id);
                        toast("info", "Bookmark removed.");
                      }}
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>
                  <p className="text-xs text-mist-300 italic font-literata line-clamp-2 leading-relaxed border-l-2 border-gold-700/60 pl-3">
                    “{chunkText(b.chunkIndex)}”
                  </p>
                  {b.note && (
                    <p className="text-[13px] text-mist-400 font-display mt-2 leading-relaxed">
                      {b.note}
                    </p>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="mt-2.5"
                    onClick={() => {
                      onJumpChunk(b.chunkIndex);
                      onClose();
                    }}
                  >
                    Jump to passage
                  </Button>
                </li>
              ))}
            </ul>
          ))}
        {tab === "notes" &&
          (annotations.loading ? (
            <Skeleton className="h-24" />
          ) : (annotations.data ?? []).length === 0 ? (
            <p className="text-sm text-mist-500 px-3 py-8 text-center leading-relaxed">
              Select any passage while reading to annotate it.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {[...(annotations.data ?? [])]
                .sort((a, b) => a.chunkIndex - b.chunkIndex)
                .map((a) => (
                  <li
                    key={a.id}
                    className="hairline rounded-xl bg-ink-875 p-3.5 hover-lift"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-2 text-[10px] font-mono text-mist-500">
                        <span
                          className="w-3 h-3 rounded-sm"
                          style={{
                            background: {
                              gold: "#d4a853",
                              ouro: "#569383",
                              ankaa: "#d5854f",
                              ok: "#6cbb81",
                            }[a.color],
                          }}
                        />
                        passage {a.chunkIndex + 1}
                      </span>
                      <IconBtn
                        label="Delete annotation"
                        className="w-7 h-7 shrink-0"
                        onClick={() => {
                          void removeAnnotation(a.id);
                          toast("info", "Annotation removed.");
                        }}
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                    {/* The highlighted passage, carried over as the marginalia
                        yellow it wears in the text. */}
                    <p className="text-xs text-highlight-ink italic font-literata line-clamp-2 leading-relaxed bg-highlight rounded-md px-2.5 py-1.5">
                      “{a.text}”
                    </p>
                    {a.note && (
                      <p className="text-[13px] text-mist-400 font-display mt-2 leading-relaxed">
                        {a.note}
                      </p>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      className="mt-2.5"
                      onClick={() => {
                        onJumpChunk(a.chunkIndex);
                        onClose();
                      }}
                    >
                      Jump to passage
                    </Button>
                  </li>
                ))}
            </ul>
          ))}
      </div>
    </Sheet>
  );
}
