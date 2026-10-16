"use client";

import { CaretRight, House } from "@phosphor-icons/react";
import { useNav, usePrefs } from "../lib/store";
import type { View } from "../lib/types";
import { cx } from "../lib/utils";

/* Breadcrumb row rendered directly under the AppHeader (above <main>) by
   App.tsx. The trail is derived from the nav store plus the active
   document's title, so it stays truthful without prop drilling. It scrolls
   away naturally — only the header itself is sticky. */

/** Long document titles collapse to ~28 chars so the row never wraps
 *  awkwardly on a 390px phone; the full name rides along in title/tooltip. */
const MAX_CRUMB = 28;

function ellipsize(s: string, max = MAX_CRUMB): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

interface Crumb {
  label: string;
  /** Nav target; the current (last) crumb has none. */
  to?: View;
  /** Full untruncated text for the tooltip, when the label is ellipsized. */
  full?: string;
}

function trailFor(view: View, docTitle: string | null): Crumb[] {
  switch (view) {
    case "library":
      return [{ label: "Library" }];
    case "reader":
      return [
        { label: "Library", to: "library" },
        {
          label: docTitle ? ellipsize(docTitle) : "Reader",
          full: docTitle ?? undefined,
        },
      ];
    case "upload":
      return [
        { label: "Library", to: "library" },
        { label: "Add documents" },
      ];
    case "create":
      return [{ label: "Writing desk" }];
    case "analytics":
      return [{ label: "Insights" }];
    case "history":
      return [
        { label: "Insights", to: "analytics" },
        { label: "History" },
      ];
    case "settings":
    case "account":
      return [{ label: "Settings" }];
    case "legal":
      return [{ label: "Terms & privacy" }];
    default:
      /* landing and dashboard ARE home — no trail below the header. */
      return [];
  }
}

export function Breadcrumbs({ docTitle }: { docTitle: string | null }) {
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);
  const readerFocus = usePrefs((s) => s.prefs.reader.focusMode);

  const trail = trailFor(view, docTitle);
  if (trail.length === 0) return null;
  /* focus mode is an immersive reader state — let the page be only the book */
  if (view === "reader" && readerFocus) return null;

  const crumbs: Crumb[] = [{ label: "Home", to: "dashboard" }, ...trail];

  return (
    <nav aria-label="Breadcrumb" className="border-b border-ink-800/60">
      <ol
        itemScope
        itemType="https://schema.org/BreadcrumbList"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center gap-1 text-xs font-medium whitespace-nowrap overflow-x-auto"
      >
        {crumbs.map((crumb, i) => {
          const current = i === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${i}`}
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
              className={cx(
                "flex items-center gap-1",
                current ? "min-w-0" : "shrink-0",
              )}
            >
              {current ? (
                <span
                  aria-current="page"
                  itemProp="name"
                  title={crumb.full}
                  className="px-1 py-1 text-mist-200 max-w-[60vw] sm:max-w-xs truncate"
                >
                  {crumb.label}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    itemProp="name"
                    aria-label={crumb.to === "dashboard" ? "Home" : undefined}
                    onClick={() => {
                      if (crumb.to) go(crumb.to);
                    }}
                    title={crumb.full}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-mist-500 hover:text-gold-400 hover:bg-ink-750/60 transition-colors"
                  >
                    {crumb.to === "dashboard" && (
                      <House className="w-3 h-3 shrink-0" aria-hidden />
                    )}
                    <span
                      className={
                        crumb.to === "dashboard" ? "hidden sm:inline" : undefined
                      }
                    >
                      {crumb.label}
                    </span>
                  </button>
                  <CaretRight
                    aria-hidden
                    className="w-3 h-3 text-mist-700 shrink-0"
                  />
                </>
              )}
              <meta itemProp="position" content={String(i + 1)} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
