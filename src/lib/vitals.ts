/**
 * Core Web Vitals — observed locally, reported locally.
 *
 * Lemniscate is a local-first, static-export application: there is no
 * analytics backend, and none is wanted. This module watches LCP, CLS and
 * INP with the standard PerformanceObserver entry types, keeps the latest
 * values in memory (available to any diagnostics surface via getVitals()),
 * and logs one summary line to the console after the page settles — enough
 * to see the real numbers in dev and in the field, without shipping a
 * monitoring service the architecture doesn't need.
 */

export interface VitalsSnapshot {
  /** Largest Contentful Paint, ms (lower is better; good < 2500). */
  lcp: number | null;
  /** Cumulative Layout Shift, unitless (lower is better; good < 0.1). */
  cls: number | null;
  /** Interaction to Next Paint, ms (lower is better; good < 200). */
  inp: number | null;
}

const latest: VitalsSnapshot = { lcp: null, cls: null, inp: null };
let started = false;

/** Begin observing. Safe to call multiple times; a no-op where the
 *  PerformanceObserver API is unavailable. */
export function startVitals(): void {
  if (started || typeof window === "undefined") return;
  const PO = (window as unknown as {
    PerformanceObserver?: typeof PerformanceObserver;
  }).PerformanceObserver;
  if (!PO) return;
  started = true;

  try {
    // LCP: the last reported entry wins.
    new PO((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) latest.lcp = last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* unsupported entry type */
  }

  try {
    // CLS: sum every layout-shift that wasn't user-initiated.
    new PO((list) => {
      for (const e of list.getEntries()) {
        if (!(e as { hadRecentInput?: boolean }).hadRecentInput) {
          latest.cls =
            (latest.cls ?? 0) +
            (e as unknown as { value: number }).value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    // INP: the worst qualifying interaction so far.
    new PO((list) => {
      for (const e of list.getEntries()) {
        const dur = (e as { duration?: number }).duration ?? 0;
        if (dur >= 40 && dur > (latest.inp ?? 0)) latest.inp = dur;
      }
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 40,
    } as unknown as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  // One summary line once the page has settled — a diagnostic, not a log
  // stream. 8s is late enough for LCP to have landed on slow loads.
  window.setTimeout(() => {
    const { lcp, cls, inp } = latest;
    const fmt = (label: string, v: number | null, unit: string): string =>
      v == null ? `${label} n/a` : `${label} ${Math.round(v * 100) / 100}${unit}`;
    // eslint-disable-next-line no-console
    console.info(
      `[lemniscate] web vitals — ${fmt("LCP", lcp, "ms")} · ${fmt("CLS", cls, "")} · ${fmt("INP", inp, "ms")}`,
    );
  }, 8000);
}
