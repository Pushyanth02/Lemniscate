"use client";

import { lazy, Suspense } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  FilePlus, BookOpen, Bookmark, Highlighter, Sparkle, FilmSlate, Trash,
  Star, Feather, FileText, CheckCircle, Pulse,
} from "@phosphor-icons/react";
import type { ActivityRow, ActivityType, DocumentRow } from "../lib/types";
import { coverInitial, cx, timeAgo } from "../lib/utils";

/* Animated numerals are presentation polish, so @number-flow/react rides
   in a lazy chunk instead of the initial one. While it loads we render the
   exact same formatted value as a plain span — same digits, same parent
   font/size classes — so nothing shifts when the odometer swaps in. */
const NumberFlow = lazy(() => import("@number-flow/react"));

/** Cached default formatter; matches NumberFlow's own default output
 *  (new Intl.NumberFormat() with grouping) for a seamless fallback. */
const fmtNum = new Intl.NumberFormat();

export function LazyNumberFlow({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <Suspense
      fallback={
        <span className={className}>{fmtNum.format(value)}</span>
      }
    >
      <NumberFlow value={value} className={className} />
    </Suspense>
  );
}

export function CoverArt({ doc, className, showInitial = true }: { doc: DocumentRow; className?: string; showInitial?: boolean }) {
  return (
    <div className={cx("relative overflow-hidden rounded-lg cover-noise", className)} style={{ background: doc.coverGradient }} aria-hidden>
      {/* Warm binding tone — deepens the stored gradient toward lamp-lit ink. */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgb(30 26 19 / 0.35), transparent 42%, rgb(13 10 6 / 0.55) 94%)" }} />
      {/* Spine crease — the shadow a hinge throws along the left edge. */}
      <div className="absolute inset-y-0 left-0 w-[9%]" style={{ background: "linear-gradient(90deg, rgb(8 6 3 / 0.55), rgb(8 6 3 / 0.12) 55%, transparent)" }} />
      {/* Gilt hairline frame, stamped inside the cover like a binding rule. */}
      {showInitial && <div className="absolute inset-1.5 rounded-md border border-gold-700/40" />}
      {showInitial && (
        <span className="absolute inset-0 flex items-center justify-center font-display italic text-4xl text-gold-300/90 drop-shadow-[0_2px_10px_rgb(8_6_3/0.8)]">
          {coverInitial(doc.title)}
        </span>
      )}
    </div>
  );
}

export function activityIcon(type: ActivityType): Icon {
  const map: Record<ActivityType, Icon> = {
    upload: FilePlus, read: BookOpen, bookmark: Bookmark, annotation: Highlighter,
    summary: Sparkle, scenes: FilmSlate, delete: Trash, favorite: Star,
    story: Feather, analyze: FileText, finish: CheckCircle,
  };
  return map[type] ?? Pulse;
}

export function ActivityLine({ row, onOpen, dense }: { row: ActivityRow; onOpen?: (docId: string) => void; dense?: boolean }) {
  const Icon = activityIcon(row.type);
  return (
    <button
      onClick={() => row.documentId && onOpen?.(row.documentId)}
      disabled={!row.documentId}
      className={cx("w-full flex items-start gap-3 text-left rounded-lg px-2 -mx-2 transition-colors", row.documentId && onOpen && "hover:bg-ink-750/60 cursor-pointer", dense ? "py-1.5" : "py-2.5")}
    >
      <span className="w-8 h-8 rounded-lg border border-ink-600/70 bg-ink-800 flex items-center justify-center text-gold-500 shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-mist-300 leading-snug truncate">{row.detail}</span>
        <span className="block text-[11px] text-mist-500 mt-0.5 font-mono">{timeAgo(row.createdAt)}</span>
      </span>
    </button>
  );
}

