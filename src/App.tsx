"use client";

import { Suspense, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { IconContext } from "@phosphor-icons/react";
import { useNav, usePrefs, useToasts } from "./lib/store";
import { migrateOwnership, useDoc, reapActivity } from "./lib/data";
import { cacheSweepExpired } from "./lib/cache";
import type { View } from "./lib/types";
import { recoverStaleJobs, startJobReaper } from "./lib/jobs";
import { lazyView } from "./lib/lazy";
import { startVitals } from "./lib/vitals";
import { AppHeader } from "./components/header";
import { Breadcrumbs } from "./components/breadcrumbs";
import {
  PageFade,
  ToastHost,
  ErrorBoundary,
  PageLoader,
} from "./components/ui";
import { AppAmbient } from "./components/brand";
import Landing from "./views/Landing";
import { cx } from "./lib/utils";

/* Heavy views are code-split so first paint stays fast; the brand loader
   covers the chunk fetch with intent instead of a blank gap. lazyView adds
   one-shot chunk-failure recovery: a stale chunk manifest (dev-server
   restart or redeploy) auto-reloads the room instead of bricking the view.
   Dashboard and Upload ride the same lazy path — only the landing page
   (the default view) pays the eager-import cost at first paint. */
const Dashboard = lazyView(() => import("./views/Dashboard"));
const Upload = lazyView(() => import("./views/Upload"));
const Library = lazyView(() => import("./views/Library"));
const Reader = lazyView(() => import("./views/Reader"));
const Create = lazyView(() => import("./views/Create"));
const Insights = lazyView(() => import("./views/Insights"));
const Settings = lazyView(() => import("./views/Settings"));
const Legal = lazyView(() => import("./views/Legal"));

/* Per-view browser tab titles; the reader swaps in the document's name
   once it resolves from the library. */
const VIEW_TITLES: Record<View, string> = {
  landing: "Open the reading room",
  dashboard: "Dashboard",
  library: "Library",
  upload: "Add documents",
  create: "Writing desk",
  analytics: "Insights",
  history: "History",
  settings: "Settings",
  account: "Settings",
  reader: "Reader",
  legal: "Terms & privacy",
};

export default function App() {
  const view = useNav((s) => s.view);
  const docId = useNav((s) => s.docId);
  const motionOn = usePrefs((s) => s.prefs.reader.motion);
  const ring = usePrefs((s) => s.prefs.ring);
  const accent = usePrefs((s) => s.prefs.accent);
  const uiScale = usePrefs((s) => s.prefs.uiScale);
  const touchTargets = usePrefs((s) => s.prefs.touchTargets);
  const underlineLinks = usePrefs((s) => s.prefs.underlineLinks);

  /* Interface scale: CSS `zoom` on the root element scales the whole room
     uniformly (rem, px and art alike — exactly what browser zoom does),
     independent of the reader-only typography settings. Standardized and
     supported by every current browser; on engines without it the setting
     is simply inert, never broken. */
  useEffect(() => {
    document.documentElement.style.zoom =
      uiScale === 1 ? "" : String(uiScale);
  }, [uiScale]);

  /* first run: claim legacy un-owned rows for this local identity (no
     automatic seeding — a fresh visitor starts with an empty library);
     recover jobs interrupted by a reload; start the periodic reaper;
     reap AI cache rows no grace window can still serve, and trim this
     identity's activity ledger to its cap (bounded growth on both) */
  useEffect(() => {
    void migrateOwnership();
    void recoverStaleJobs();
    startJobReaper();
    startVitals();
    void cacheSweepExpired();
    void reapActivity();
  }, []);

  /* surface stray runtime errors as recoverable feedback instead of silence */
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      console.error("Uncaught error:", e.error ?? e.message);
      useToasts
        .getState()
        .push(
          "error",
          `Something went wrong: ${e.message || "unknown error"}. Your library is safe — try the action again.`,
        );
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg =
        e.reason instanceof Error
          ? e.reason.message
          : "a background task failed";
      console.error("Unhandled rejection:", e.reason);
      useToasts.getState().push("error", `Background task failed: ${msg}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  /* reset scroll on view change */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view, docId]);

  /* the tab mirrors the room you're standing in */
  const docQ = useDoc(view === "reader" ? docId : null);
  const docTitle = view === "reader" ? (docQ.data?.title ?? null) : null;
  useEffect(() => {
    document.title =
      view === "reader" && docTitle
        ? `Lemniscate — ${docTitle}`
        : `Lemniscate — ${VIEW_TITLES[view]}`;
  }, [view, docTitle]);

  const isLanding = view === "landing";
  // Analytics and History are one surface with two tabs — never remount
  // between them, or the tabs would flicker out mid-transition.
  const insightsView = view === "analytics" || view === "history";
  const pageKey = insightsView
    ? "insights"
    : view === "reader"
      ? `reader-${docId}`
      : view;

  return (
    <IconContext.Provider value={{ weight: "light" }}>
    <div
      className={cx("min-h-screen flex flex-col", !motionOn && "motion-off")}
      data-ring={ring}
      data-accent={accent}
      data-touch={touchTargets}
      data-underline={underlineLinks ? "on" : "off"}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-99 focus:px-4 focus:py-2 focus:bg-gold-500 focus:text-(--acc-ink) focus:rounded font-display text-sm"
      >
        Skip to content
      </a>
      {!isLanding && <AppAmbient />}
      {!isLanding && <AppHeader />}
      {!isLanding && <Breadcrumbs docTitle={docTitle} />}
      <main id="main" className="relative z-10 flex-1">
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <PageFade id={pageKey} key={pageKey}>
              <Suspense fallback={<PageLoader />}>
                {view === "landing" && <Landing />}
                {view === "dashboard" && <Dashboard />}
                {view === "library" && <Library />}
                {view === "upload" && <Upload />}
                {view === "reader" && <Reader key={docId ?? "none"} />}
                {view === "create" && <Create />}
                {insightsView && <Insights />}
                {(view === "settings" || view === "account") && <Settings />}
                {view === "legal" && <Legal />}
              </Suspense>
            </PageFade>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <ToastHost />
    </div>
    </IconContext.Provider>
  );
}
