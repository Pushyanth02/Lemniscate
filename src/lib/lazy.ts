/**
 * Lazy-view loading with chunk-failure recovery.
 *
 * The app code-splits its heavy views (Library, Reader, Create, Insights,
 * Settings, Legal) with React.lazy. When the dev server restarts mid-session
 * (or a redeploy replaces content-hashed chunks), a browser that keeps the
 * old page open holds stale chunk URLs: the next lazy import fetches a chunk
 * that no longer exists and fails with a ChunkLoadError — and React memoizes
 * the rejection, so the view stays unreachable until a full page reload.
 *
 * The fix: recognize chunk-load failures at both the import boundary and the
 * error boundary, and recover with EXACTLY ONE automatic reload per browser
 * session (a sessionStorage + in-memory guard prevents reload loops when the
 * chunk is genuinely, permanently missing). A second failure in the same
 * session surfaces as a manual "reload the room" card instead.
 */
import { lazy } from "react";
import type { ComponentType } from "react";

const RELOAD_KEY = "lemniscate:chunk-reloaded";

/** Module-level mirror of the sessionStorage guard — covers private-browsing
 *  modes where sessionStorage access can throw. */
let reloadAttempted = false;

/** Error shapes that mean "the browser tried to fetch a code chunk that no
 *  longer exists": Turbopack dev restarts, redeploys with content-hashed
 *  chunks, or an offline cache referencing retired assets. */
export function isChunkLoadError(e: unknown): boolean {
  const msg =
    e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return (
    /ChunkLoadError/i.test(msg) ||
    /Failed to load chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk \d+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/** Pure decision core (unit-tested): does this failure warrant the one
 *  automatic recovery reload? Only chunk failures, and only once. */
export function shouldReloadForChunkError(
  e: unknown,
  alreadyAttempted: boolean,
): boolean {
  return isChunkLoadError(e) && !alreadyAttempted;
}

/** Has the automatic chunk-recovery reload already run this session? */
export function chunkRecoveryAttempted(): boolean {
  if (reloadAttempted) return true;
  try {
    return sessionStorage.getItem(RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

/** Run the one-shot recovery: mark the attempt durably, then reload. Returns
 *  false (and does nothing) when a reload was already attempted — the caller
 *  should surface a manual recovery card instead. */
export function recoverFromChunkError(): boolean {
  if (chunkRecoveryAttempted()) return false;
  reloadAttempted = true;
  try {
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* in-memory flag above still guards the loop */
  }
  window.location.reload();
  return true;
}

/** React.lazy with chunk-failure recovery wired in. The import rejection is
 *  re-thrown after recovery is triggered, so React's Suspense/ErrorBoundary
 *  flow stays honest — the reload simply supersedes it a beat later. */
export function lazyView(
  load: () => Promise<{ default: ComponentType<unknown> }>,
) {
  return lazy(() =>
    load().catch((e: unknown) => {
      if (shouldReloadForChunkError(e, chunkRecoveryAttempted())) {
        recoverFromChunkError();
      }
      throw e;
    }),
  );
}
