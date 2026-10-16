/**
 * Data access layer. All reads are filtered by the local session identity,
 * mirroring server-side ownership isolation. Components subscribe through
 * `useDbVersion` and refetch when the store changes.
 *
 * Since DB v5, document metadata (`documents`) and chapter content
 * (`docContent`) are separate stores: library lists, progress saves and
 * patch calls never clone whole books, and queries go through the
 * by_user / by_doc indexes instead of getAll + JS filtering.
 *
 * ── Destructive operations ──────────────────────────────────────────
 * Three distinct operations, three distinct semantics:
 *   • `clearCurrentProfileData()` — removes THIS identity's rows (plus
 *     unattributable legacy rows). Other profiles on the device remain.
 *   • `deleteProfileData(id)` — removes one registered profile's rows.
 *   • `eraseAllDeviceData()` — every identity, every store, app-owned
 *     localStorage keys, cross-tab coordinated. Nothing survives.
 * All of them first suspend writes (see ./db), cancel active jobs, give
 * in-flight writes a grace window to settle, and only then delete — so a
 * late async result can never recreate deleted records. Failures throw;
 * callers must surface them (never report a failed wipe as success).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  ActivityRow,
  ActivityType,
  AiSceneRow,
  AnalysisJob,
  AnnotationRow,
  BookmarkRow,
  DocContentRow,
  DocWithContent,
  DocumentRow,
  ParsedDoc,
  SceneDraft,
  SceneNoteRow,
  StoryRow,
  UsageRow,
  BotId,
} from "./types";
import {
  idbAll,
  idbAllByIndex,
  idbBulkPut,
  idbClearInternal,
  idbDelete,
  idbDeleteByIndexInternal,
  idbGet,
  idbLatestByComposite,
  idbPut,
  idbTrimByComposite,
  getUserId,
  listProfiles,
  unregisterProfile,
  resumeWrites,
  settleWrites,
  suspendWrites,
  clearAppStorageKeys,
  createAndSwitchProfile,
  STORES,
  type StoreName,
} from "./db";
import { cacheClearAll, cachePurgeDoc } from "./cache";
import { coverGradient, uid } from "./utils";
import { toChapters } from "./engine";
import type { Fileish } from "./ingest-types";
import { cancelAllJobs } from "./jobs";

let version = 0;
const bus = new EventTarget();

/** In-memory read-event throttle: documentId → timestamp of the last
 *  "read" activity row written. Replaces a full activity-table scan on
 *  every debounced progress save with an O(1) Map lookup. */
const lastReadEventAt = new Map<string, number>();

/* ────────────────────────────────────────────────────────────
   Per-store version counters — race-free scoped refetches.

   Each store has its own monotonic counter. A query snapshots the
   versions of its stores before fetching; on a version bump, it compares
   current versions to its snapshot and refetches if ANY of its stores'
   versions incremented. Race-free because counters are per-store and
   monotonic — the order of bumps within a batched re-render no longer
   matters.
   ──────────────────────────────────────────────────────────── */
const storeVersions = new Map<StoreName, number>();
for (const s of STORES) storeVersions.set(s, 0);

/** Snapshot of per-store versions — used by useQuery to detect whether
 * ANY of its stores changed since its last fetch. */
function snapshotVersions(
  stores: readonly StoreName[],
): Map<StoreName, number> {
  const snap = new Map<StoreName, number>();
  for (const s of stores) snap.set(s, storeVersions.get(s) ?? 0);
  return snap;
}

/** Bump the version bus. Optionally pass the specific store(s) that changed
 *  so only queries reading those stores refetch. Without the `stores`
 *  argument, ALL queries refetch (the legacy behavior, used by mutations
 *  that touch multiple stores like deleteDocument). */
export function bump(...stores: StoreName[]): void {
  version++;
  if (stores.length > 0) {
    for (const s of stores)
      storeVersions.set(s, (storeVersions.get(s) ?? 0) + 1);
  } else {
    // Global bump — increment every store so all queries refetch
    for (const s of STORES)
      storeVersions.set(s, (storeVersions.get(s) ?? 0) + 1);
  }
  bus.dispatchEvent(new Event("change"));
}

const subscribe = (fn: () => void) => {
  bus.addEventListener("change", fn);
  return () => bus.removeEventListener("change", fn);
};

export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Check whether any of the given stores' versions have advanced past
 * the snapshot. Used by useQuery's scoped-refetch optimization. */
function storesChangedSince(
  stores: readonly StoreName[],
  snapshot: Map<StoreName, number>,
): boolean {
  for (const s of stores) {
    if ((storeVersions.get(s) ?? 0) !== (snapshot.get(s) ?? 0)) return true;
  }
  return false;
}

export interface Query<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** manually re-run the query (error recovery) */
  retry: () => void;
}

export function useQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  stores?: readonly StoreName[],
): Query<T> {
  const v = useDbVersion();
  const [state, setState] = useState<Omit<Query<T>, "retry">>({
    data: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const hadData = useRef(false);
  const autoRetried = useRef(false);
  const depKey = JSON.stringify(deps);
  const lastDepKey = useRef(depKey);
  const lastV = useRef(v);
  // Hold the latest loader and stores in refs so the effect can stay keyed on
  // stable primitives (v, depKey, attempt, storesKey) without re-running every
  // render — every caller passes a fresh closure and a fresh `stores` array,
  // either of which would otherwise cause an infinite fetch loop once setState
  // triggers a re-render.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const storesRef = useRef(stores);
  storesRef.current = stores;
  // Stable string key for the dependency array — `stores.join(",")` is
  // referentially stable across renders for the same store set, so the
  // effect doesn't re-run just because the caller passed a new array.
  const storesKey = stores?.join(",") ?? "";
  // Snapshot of per-store versions from the last successful fetch. Used by
  // the scoped-refetch optimization: if none of this query's stores advanced
  // since the snapshot, we skip the refetch.
  const versionSnapshot = useRef<Map<StoreName, number> | null>(null);

  // Stale-while-revalidate: once data exists, background refetches replace it
  // silently (the reader never flashes a skeleton while progress saves bump
  // the store version). On failure we auto-retry once, then surface a
  // retryable error state for manual recovery.
  useEffect(() => {
    // A dependency change always wins and must be applied before the
    // scoped-refetch skip below: a dep change can land in the same render
    // as a version bump from an unrelated store, and the skip's early
    // return would otherwise swallow the new depKey until the next bump.
    // (Resetting hadData here also disarms the skip for this pass, so a
    // changed dep always fetches.)
    if (lastDepKey.current !== depKey) {
      lastDepKey.current = depKey;
      hadData.current = false;
      autoRetried.current = false;
      setState({ data: null, loading: true, error: null });
    }
    // Scoped-refetch optimization: if this query reads from specific stores
    // (e.g. useDoc reads "documents") and none of those stores' versions
    // advanced since our last fetch, skip the refetch entirely.
    const currentStores = storesRef.current;
    if (
      currentStores &&
      currentStores.length > 0 &&
      lastV.current !== v &&
      hadData.current &&
      versionSnapshot.current
    ) {
      if (!storesChangedSince(currentStores, versionSnapshot.current)) {
        lastV.current = v;
        return; // skip refetch — none of this query's stores changed
      }
    }
    lastV.current = v;
    let on = true;
    let retryTimer: number | undefined;
    loaderRef
      .current()
      .then((data) => {
        if (!on) return;
        hadData.current = true;
        autoRetried.current = false;
        // Take a fresh snapshot AFTER a successful fetch so we have the
        // correct baseline — catches bumps that fired during the fetch.
        if (currentStores && currentStores.length > 0) {
          versionSnapshot.current = snapshotVersions(currentStores);
        }
        setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!on) return;
        if (!autoRetried.current && !hadData.current) {
          autoRetried.current = true;
          retryTimer = window.setTimeout(() => {
            if (on) setAttempt((a) => a + 1);
          }, 700);
          return;
        }
        setState((s) => ({
          data: hadData.current ? s.data : null,
          loading: false,
          error: e instanceof Error ? e.message : "Something went wrong",
        }));
      });
    return () => {
      on = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [v, depKey, attempt, storesKey]);

  return {
    ...state,
    retry: () => {
      autoRetried.current = true;
      setAttempt((a) => a + 1);
    },
  };
}

const me = () => getUserId();

/* ---------------- queries ---------------- */

export function useDocuments(): Query<DocumentRow[]> {
  return useQuery(
    () => idbAllByIndex<DocumentRow>("documents", "by_user", me()),
    [],
    ["documents"],
  );
}

export function useDoc(id: string | null): Query<DocumentRow | null> {
  return useQuery<DocumentRow | null>(
    async () => {
      // No document open is the NORMAL state on every non-reader view —
      // returning null keeps it out of the error path (no retry churn,
      // no error state that nothing consumes).
      if (!id) return null;
      const row = await idbGet<DocumentRow>("documents", id);
      if (!row || row.userId !== me())
        throw new Error("This document isn’t in your library.");
      return row;
    },
    [id],
    ["documents"],
  );
}

/** Chapter content of one document (the v5 content split). Returns null
 *  when the document has no content row (should not happen for ready
 *  documents; callers treat it as an empty book). */
export function useDocContent(
  docId: string | null,
): Query<DocContentRow | null> {
  return useQuery<DocContentRow | null>(
    async () => {
      if (!docId) return null;
      return (await idbGet<DocContentRow>("docContent", docId)) ?? null;
    },
    [docId],
    ["docContent"],
  );
}

/** One-shot content fetch for non-React consumers (jobs, AI pipelines). */
export async function getDocContent(
  docId: string,
): Promise<DocContentRow | null> {
  try {
    return (await idbGet<DocContentRow>("docContent", docId)) ?? null;
  } catch {
    return null;
  }
}

/** Assemble the join reading/AI helpers take (metadata + chapters).
 *  Returns null when the content row is missing. */
export function withContent(
  doc: DocumentRow,
  content: DocContentRow | null | undefined,
): DocWithContent | null {
  if (!content) return null;
  return { ...doc, contentJson: { chapters: content.chapters } };
}

export function useBookmarks(docId: string | null): Query<BookmarkRow[]> {
  return useQuery(
    async () => {
      if (!docId) return [];
      const rows = await idbAllByIndex<BookmarkRow>("bookmarks", "by_doc", docId);
      return rows
        .filter((b) => b.userId === me())
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
    },
    [docId],
    ["bookmarks"],
  );
}

export function useAnnotations(docId: string | null): Query<AnnotationRow[]> {
  return useQuery(
    async () => {
      if (!docId) return [];
      const rows = await idbAllByIndex<AnnotationRow>(
        "annotations",
        "by_doc",
        docId,
      );
      return rows.filter((a) => a.userId === me());
    },
    [docId],
    ["annotations"],
  );
}

export function useScenes(docId: string | null): Query<AiSceneRow[]> {
  return useQuery(
    async () => {
      if (!docId) return [];
      const rows = await idbAllByIndex<AiSceneRow>("scenes", "by_doc", docId);
      return rows
        .filter((s) => s.userId === me())
        .sort(
          (a, b) => a.chapterIndex - b.chapterIndex || a.ordinal - b.ordinal,
        );
    },
    [docId],
    ["scenes"],
  );
}

/** The reader's own scene notes for a document, newest-touched first. */
export function useSceneNotes(docId: string | null): Query<SceneNoteRow[]> {
  return useQuery(
    async () => {
      if (!docId) return [];
      const rows = await idbAllByIndex<SceneNoteRow>(
        "sceneNotes",
        "by_doc",
        docId,
      );
      return rows
        .filter((n) => n.userId === me())
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    [docId],
    ["sceneNotes"],
  );
}

export function useActivity(limit = 40): Query<ActivityRow[]> {
  return useQuery(
    () =>
      // DB v6 composite index: a descending cursor returns the newest
      // `limit` rows directly — no full-store read, no JS sort.
      idbLatestByComposite<ActivityRow>(
        "activity",
        "by_user_ts",
        me(),
        limit,
      ),
    [limit],
    ["activity"],
  );
}

/* The activity ledger is a UI history, not content: bookmarks, notes and
 * annotations are never touched. To keep years of reading from growing
 * the store without bound, each boot trims this identity's ledger to the
 * newest ACTIVITY_KEEP events — twice the largest view (Dashboard/Insights
 * read at most 500) so paging surfaces never notice the cap. */
const ACTIVITY_KEEP = 1000;

/** Best-effort boot-time trim of the activity ledger (see ACTIVITY_KEEP).
 *  Never throws — a failed reap is retried on the next boot. */
export async function reapActivity(): Promise<void> {
  const who = me();
  if (!who) return;
  try {
    const removed = await idbTrimByComposite(
      "activity",
      "by_user_ts",
      who,
      ACTIVITY_KEEP,
    );
    if (removed > 0) bump("activity");
  } catch {
    /* best-effort by design */
  }
}

export function useUsage(): Query<UsageRow[]> {
  return useQuery(
    () => idbAllByIndex<UsageRow>("usage", "by_user", me()),
    [],
    ["usage"],
  );
}

export function useStories(): Query<StoryRow[]> {
  return useQuery(
    () =>
      idbAllByIndex<StoryRow>("stories", "by_user", me()).then((r) =>
        r.sort((a, b) => b.createdAt - a.createdAt),
      ),
    [],
    ["stories"],
  );
}

export function useJobs(docId?: string): Query<AnalysisJob[]> {
  return useQuery(
    () =>
      idbAllByIndex<AnalysisJob>("jobs", "by_user", me()).then((r) =>
        r
          .filter((j) => !docId || j.documentId === docId)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      ),
    [docId],
    ["jobs"],
  );
}

/* ---------------- mutations ---------------- */

export async function logActivity(
  type: ActivityType,
  detail: string,
  documentId: string | null = null,
): Promise<void> {
  const row: ActivityRow = {
    id: uid("act"),
    userId: me(),
    documentId,
    type,
    detail,
    createdAt: Date.now(),
  };
  await idbPut("activity", row);
  bump("activity");
}

export async function logUsage(
  bot: BotId,
  kind: string,
  estTokens: number,
  latencyMs: number,
  status: UsageRow["status"],
  documentId: string | null,
  model?: string,
): Promise<void> {
  const row: UsageRow = {
    id: uid("use"),
    userId: me(),
    bot,
    documentId,
    kind,
    estTokens,
    latencyMs,
    status,
    createdAt: Date.now(),
    ...(model ? { model } : {}),
  };
  try {
    await idbPut("usage", row);
    bump("usage");
  } catch {
    /* the ledger is best-effort: a quota error (or a destructive-operation
     * suspension) must not break the AI flow. */
  }
}

/** Write a parsed document: metadata row + content row (v5 split). */
export async function importParsed(
  file: Fileish,
  parsed: ParsedDoc,
): Promise<DocumentRow> {
  const now = Date.now();
  const row: DocumentRow = {
    id: uid("doc"),
    userId: me(),
    title: parsed.title,
    author: parsed.author,
    sourceType: parsed.sourceType,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    status: "ready",
    error: null,
    warnings: parsed.warnings,
    summary: null,
    language: parsed.language,
    coverGradient: coverGradient(parsed.title + now.toString(36)),
    chapterCount: parsed.chapters.length,
    wordCount: parsed.wordCount,
    charCount: parsed.charCount,
    createdAt: now,
    updatedAt: now,
    lastReadAt: null,
    readingProgress: 0,
    lastChunkIndex: 0,
    favorite: false,
    tags: [parsed.sourceType],
    collection: null,
  };
  await idbPut("documents", row);
  await idbPut("docContent", {
    id: row.id,
    userId: row.userId,
    chapters: parsed.chapters,
  });
  await logActivity(
    "upload",
    `Imported “${row.title}” (${row.sourceType.toUpperCase()}, ${row.chapterCount} chapters)`,
    row.id,
  );
  return row;
}

/** Progress-state fields: writes that touch ONLY these never bump
 *  `updatedAt`, so the reader's debounced progress save (~every 900ms while
 *  reading) and favorite toggles can't invalidate artifact cache keys that
 *  version on `updatedAt` (study sets, analyses, scene cards). Content-bearing
 *  patches (summary, appended chapters, tags) still bump it. */
const PROGRESS_STATE_FIELDS: ReadonlySet<string> = new Set([
  "lastReadAt",
  "readingProgress",
  "lastChunkIndex",
  "favorite",
]);

export async function patchDocument(
  id: string,
  patch: Partial<DocumentRow>,
): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  if (!row || row.userId !== me()) return;
  const keys = Object.keys(patch);
  const metaOnly =
    keys.length > 0 && keys.every((k) => PROGRESS_STATE_FIELDS.has(k));
  await idbPut("documents", {
    ...row,
    ...patch,
    id,
    ...(metaOnly ? {} : { updatedAt: Date.now() }),
  });
  bump("documents");
}

export async function setFavorite(
  id: string,
  favorite: boolean,
): Promise<void> {
  await patchDocument(id, { favorite });
  const row = await idbGet<DocumentRow>("documents", id);
  if (row)
    await logActivity(
      "favorite",
      favorite ? `Starred “${row.title}”` : `Unstarred “${row.title}”`,
      id,
    );
}

export async function updateProgress(
  id: string,
  chunkIndex: number,
  progress: number,
): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  if (!row || row.userId !== me()) return;
  const finishedNow = progress >= 99.5 && row.readingProgress < 99.5;
  // Progress is state, not content: preserve row.updatedAt so the reader's
  // debounced save doesn't invalidate artifact caches that version on it.
  // Since the v5 split this clones only the small metadata row — the
  // chapters are never touched.
  await idbPut("documents", {
    ...row,
    lastChunkIndex: chunkIndex,
    readingProgress: Math.round(progress * 10) / 10,
    lastReadAt: Date.now(),
  });
  // Throttle read events: at most one per document per 10 minutes. Kept in
  // memory instead of scanning the whole activity table on every debounced
  // progress save — an O(1) check instead of an O(N) full-store read.
  const cutoff = Date.now() - 10 * 60 * 1000;
  if ((lastReadEventAt.get(id) ?? 0) < cutoff) {
    lastReadEventAt.set(id, Date.now());
    await logActivity(
      "read",
      `Reading “${row.title}” — ${Math.round(progress)}%`,
      id,
    );
  }
  if (finishedNow) await logActivity("finish", `Finished “${row.title}”`, id);
  // Scoped bump: only the documents store changed. This prevents the reader's
  // debounced progress save (every 900ms) from triggering useActivity,
  // useUsage, useJobs, useScenes, useBookmarks, useAnnotations to all refetch.
  bump("documents");
}

export async function deleteDocument(id: string): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  // Ownership: never delete another local identity's document. A missing
  // row still cascades so orphaned children of an already-gone doc clean up.
  if (row && row.userId !== me()) return;
  lastReadEventAt.delete(id);
  await idbDelete("documents", id);
  await idbDelete("docContent", id);
  // Index-driven cascades: children are located via by_doc, not full scans.
  await idbDeleteByIndexInternal("bookmarks", "by_doc", id);
  await idbDeleteByIndexInternal("annotations", "by_doc", id);
  await idbDeleteByIndexInternal("scenes", "by_doc", id);
  await idbDeleteByIndexInternal("sceneNotes", "by_doc", id);
  await idbDeleteByIndexInternal("jobs", "by_doc", id);
  // Purge cached AI artifacts (study sets, analyses, scenes, Ouro outputs)
  // keyed by this document so they don't linger until TTL expiry.
  await cachePurgeDoc(id);
  if (row)
    await logActivity(
      "delete",
      `Deleted “${row.title}” from the library`,
      null,
    );
  bump();
}

export async function addBookmark(
  documentId: string,
  chunkIndex: number,
  label: string,
  note: string,
): Promise<void> {
  // Ownership: bookmarks may only land in a document owned by this identity.
  const doc = await idbGet<DocumentRow>("documents", documentId);
  if (!doc || doc.userId !== me()) return;
  const row: BookmarkRow = {
    id: uid("bm"),
    userId: me(),
    documentId,
    chunkIndex,
    label,
    note,
    createdAt: Date.now(),
  };
  await idbPut("bookmarks", row);
  bump("bookmarks"); // live: the reader's bookmarks query must see the new row
  await logActivity(
    "bookmark",
    label ? `Bookmarked: ${label}` : "Bookmark added",
    documentId,
  );
}

export async function removeBookmark(id: string): Promise<void> {
  const row = await idbGet<BookmarkRow>("bookmarks", id);
  if (row && row.userId !== me()) return; // ownership invariant
  await idbDelete("bookmarks", id);
  bump("bookmarks");
}

export async function addAnnotation(
  a: Omit<AnnotationRow, "id" | "createdAt" | "userId">,
): Promise<void> {
  // Ownership: annotations may only land in a document owned by this identity.
  const doc = await idbGet<DocumentRow>("documents", a.documentId);
  if (!doc || doc.userId !== me()) return;
  const row: AnnotationRow = {
    ...a,
    userId: me(),
    id: uid("an"),
    createdAt: Date.now(),
  };
  await idbPut("annotations", row);
  bump("annotations"); // live: the reader's annotations query must see the new row
  await logActivity(
    "annotation",
    `Annotated: “${a.text.slice(0, 48)}${a.text.length > 48 ? "…" : ""}”`,
    a.documentId,
  );
}

export async function removeAnnotation(id: string): Promise<void> {
  const row = await idbGet<AnnotationRow>("annotations", id);
  if (row && row.userId !== me()) return; // ownership invariant
  await idbDelete("annotations", id);
  bump("annotations");
}

export async function putScenes(
  documentId: string,
  chapterIndex: number,
  scenes: SceneDraft[],
): Promise<void> {
  // Ownership: scenes may only land in a document owned by this identity.
  const doc = await idbGet<DocumentRow>("documents", documentId);
  if (!doc || doc.userId !== me()) return;
  const existing = await idbAllByIndex<AiSceneRow>(
    "scenes",
    "by_doc",
    documentId,
  );
  for (const s of existing.filter(
    (s) => s.chapterIndex === chapterIndex,
  )) {
    await idbDelete("scenes", s.id);
  }
  const rows: AiSceneRow[] = scenes.map((s, i) => ({
    id: uid("scn"),
    userId: me(),
    documentId,
    chapterIndex,
    ordinal: i,
    title: s.title,
    body: s.body,
    mood: s.mood,
    characters: s.characters,
    createdAt: Date.now(),
    /* Scene Atlas (v3) fields — present only when the pipeline produced
       them, so legacy rows and legacy caches stay shape-compatible. */
    ...(s.setting !== undefined ? { setting: s.setting } : {}),
    ...(s.sensory !== undefined ? { sensory: s.sensory } : {}),
    ...(s.movement !== undefined ? { movement: s.movement } : {}),
    ...(s.motifs !== undefined ? { motifs: s.motifs } : {}),
    ...(s.anchors !== undefined ? { anchors: s.anchors } : {}),
    ...(s.thread !== undefined ? { thread: s.thread } : {}),
    ...(s.art !== undefined ? { art: s.art } : {}),
    ...(s.grounded !== undefined ? { grounded: s.grounded } : {}),
    ...(s.engine !== undefined ? { engine: s.engine } : {}),
  }));
  await idbBulkPut("scenes", rows);
  // Prune scene notes that no longer have a scene to attach to (the new
  // set is shorter than the old one). Notes for surviving ordinals are
  // deliberately kept — a reader's own words survive regeneration.
  const notes = await idbAllByIndex<SceneNoteRow>(
    "sceneNotes",
    "by_doc",
    documentId,
  );
  const staleNotes = notes.filter(
    (n) => n.chapterIndex === chapterIndex && n.ordinal >= scenes.length,
  );
  for (const n of staleNotes) await idbDelete("sceneNotes", n.id);
  bump("scenes"); // scenes must be visible the moment they land
  await logActivity(
    "scenes",
    `Scene Atlas rendered for chapter ${chapterIndex + 1} — ${scenes.length} plate${scenes.length === 1 ? "" : "s"}`,
    documentId,
  );
}

/** Save (or clear, when `note` is blank) the reader's own note on one scene.
 *  Deterministic id → upsert; empty notes delete their row so the store
 *  never accumulates blank placeholders. */
export async function saveSceneNote(
  documentId: string,
  chapterIndex: number,
  ordinal: number,
  note: string,
): Promise<void> {
  const doc = await idbGet<DocumentRow>("documents", documentId);
  if (!doc || doc.userId !== me()) return;
  const id = `${documentId}:${chapterIndex}:${ordinal}`;
  const trimmed = note.trim();
  if (!trimmed) {
    await idbDelete("sceneNotes", id);
    bump("sceneNotes");
    return;
  }
  const row: SceneNoteRow = {
    id,
    userId: me(),
    documentId,
    chapterIndex,
    ordinal,
    note: trimmed,
    updatedAt: Date.now(),
  };
  await idbPut("sceneNotes", row);
  bump("sceneNotes");
}

/**
 * Append generated prose to an EXISTING document as a new chapter, so a
 * continuation / new chapter / alternate ending written from the reader
 * becomes part of the same book — not a separate shelf item. Rebuilds chunk
 * indices and word/char counts, then bumps so the open reader reflects the
 * new chapter immediately. Reading position is preserved (only forward
 * chunk indices shift).
 */
export async function appendChapterToDocument(
  docId: string,
  title: string,
  body: string,
): Promise<DocumentRow> {
  const doc = await idbGet<DocumentRow>("documents", docId);
  if (!doc || doc.userId !== getUserId())
    throw new Error("Document not found.");
  const content = await getDocContent(docId);
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length)
    throw new Error("Nothing to append — the draft was empty.");
  const chapters = toChapters([
    ...(content?.chapters ?? []).map((c) => ({
      title: c.title,
      paras: c.chunks.map((k) => k.text),
    })),
    { title, paras },
  ]);
  const text = chapters
    .flatMap((c) => c.chunks.map((k) => k.text))
    .join("\n\n");
  const updated: DocumentRow = {
    ...doc,
    chapterCount: chapters.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    updatedAt: Date.now(),
  };
  await idbPut("documents", updated);
  await idbPut("docContent", {
    id: docId,
    userId: doc.userId,
    chapters,
  });
  await logActivity(
    "story",
    `Ankaa appended “${title}” to “${doc.title}”`,
    docId,
  );
  bump("documents");
  bump("docContent");
  return updated;
}

export async function saveStoryToLibrary(
  story: StoryRow,
): Promise<DocumentRow> {
  const paras = (story.body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chapters = toChapters([{ title: story.title, paras }]);
  const text = paras.join("\n\n");
  const now = Date.now();
  const row: DocumentRow = {
    id: uid("doc"),
    userId: getUserId(),
    title: story.title,
    author: "Ankaa · Lemniscate",
    sourceType: "markdown",
    mimeType: "text/plain",
    byteSize: new Blob([text]).size,
    status: "ready",
    error: null,
    warnings: [],
    summary: null,
    language: "en",
    coverGradient: coverGradient(story.title + now.toString(36)),
    chapterCount: chapters.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    createdAt: now,
    updatedAt: now,
    lastReadAt: null,
    readingProgress: 0,
    lastChunkIndex: 0,
    favorite: false,
    tags: ["ankaa", "story"],
    collection: "Ankaa drafts",
  };
  await idbPut("documents", row);
  await idbPut("docContent", {
    id: row.id,
    userId: row.userId,
    chapters,
  });
  await logActivity(
    "upload",
    `Saved Ankaa draft “${row.title}” to the library`,
    row.id,
  );
  return row;
}

export async function putStory(story: StoryRow): Promise<void> {
  await idbPut("stories", story);
  bump("stories");
}

export async function patchStory(
  id: string,
  patch: Partial<StoryRow>,
): Promise<void> {
  const row = await idbGet<StoryRow>("stories", id);
  if (!row || row.userId !== me()) return;
  await idbPut("stories", { ...row, ...patch, id });
  bump("stories");
}

/** Delete a draft from the writing desk and refresh every subscriber.
 *  Components must use this instead of raw `idbDelete("stories", …)` —
 *  a bare IndexedDB delete fires no version bump, so the story shelf
 *  would keep showing the deleted row until an unrelated store change. */
export async function deleteStory(id: string): Promise<void> {
  const row = await idbGet<StoryRow>("stories", id);
  if (row && row.userId !== me()) return; // ownership invariant
  await idbDelete("stories", id);
  bump("stories");
}

export async function putJob(job: AnalysisJob): Promise<void> {
  if (job.userId !== me()) return; // only persist this identity's jobs
  await idbPut("jobs", job);
  bump("jobs");
}

/* ---------------- storage management ---------------- */

/** Stores that hold user-owned rows (everything except the shared aiCache,
 *  which is non-personal derived output keyed by document). */
const USER_STORES = STORES.filter((s) => s !== "aiCache");

/** One-time ownership migration: rows written before per-user stamping
 *  existed (bookmarks / annotations / scenes) are claimed by the current
 *  local identity so they remain visible and are correctly scoped. */
export async function migrateOwnership(): Promise<void> {
  const uidMe = getUserId();
  const legacyStores: StoreName[] = ["bookmarks", "annotations", "scenes"];
  for (const store of legacyStores) {
    const rows = await idbAll<{ id: string; userId?: string }>(store);
    const orphans = rows.filter((r) => !r.userId);
    for (const r of orphans) await idbPut(store, { ...r, userId: uidMe });
  }
}

/* Backups live in ./backup.ts — buildBackup(scope) replaces the former
   exportAllData() with scoped exports (full / library / prefs) in the
   compact v3 format. */

/* ────────────────────────────────────────────────────────────
   Destructive operations.
   Order of operations for every variant:
     1. Suspend public writes (late async results now reject).
     2. Cancel all in-flight/queued jobs in THIS tab.
     3. Tell other tabs to stop (erase-all only; they reload).
     4. Grace window so in-flight transactions settle.
     5. Delete rows (index-driven where possible).
     6. Resume writes under a new generation.
   Any failure propagates — a wipe that failed partway must NEVER be
   reported as success; it is safe to retry (deletion is idempotent).
   ──────────────────────────────────────────────────────────── */

/** Cross-tab coordination channel for destructive storage operations. */
const STORAGE_CHANNEL =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("lemniscate-storage")
    : null;

if (STORAGE_CHANNEL) {
  STORAGE_CHANNEL.onmessage = (e: MessageEvent) => {
    const msg = e.data as { type?: string };
    if (msg?.type === "erase-begin") {
      // Another tab is erasing ALL device data: stop accepting work and
      // cancel our jobs immediately; the erasing tab will finish the wipe
      // and tell us to reload.
      suspendWrites();
      cancelAllJobs();
    } else if (msg?.type === "erase-done") {
      // Wipe complete: reload so this tab starts from the fresh state
      // (fresh identity, empty stores) instead of its stale memory.
      location.reload();
    }
  };
}

/** Rows of `store` owned by `ownerId`, plus unattributable legacy rows
 *  (no userId) when `includeUnowned` is set. Uses by_user index first,
 *  then a scan pass only for unowned rows. */
async function deleteOwnedRows(
  store: StoreName,
  ownerId: string,
  includeUnowned: boolean,
): Promise<void> {
  await idbDeleteByIndexInternal(store, "by_user", ownerId);
  if (includeUnowned) {
    const rows = await idbAll<{ id: string; userId?: string }>(store);
    for (const r of rows) {
      if (!r.userId) await idbDelete(store, r.id);
    }
  }
}

/** Clear THIS profile's data: all rows owned by the current identity plus
 *  unattributable legacy rows. Other profiles on this device are untouched.
 *  Active jobs are cancelled first so they cannot write results back. */
export async function clearCurrentProfileData(): Promise<void> {
  suspendWrites();
  try {
    cancelAllJobs();
    await settleWrites();
    const mine = getUserId();
    for (const s of USER_STORES) {
      await deleteOwnedRows(s, mine, true);
    }
    await cacheClearAll();
    lastReadEventAt.clear();
  } finally {
    resumeWrites();
  }
  bump();
}

/** Delete one registered profile's rows (identity bookkeeping included).
 *  Cannot delete the CURRENT profile — use clearCurrentProfileData for that
 *  (or eraseAllDeviceData for everything). */
export async function deleteProfileData(profileId: string): Promise<void> {
  if (profileId === getUserId()) {
    throw new Error(
      "This profile is active. Use “Clear this profile’s data” instead.",
    );
  }
  if (!listProfiles().some((p) => p.id === profileId)) {
    throw new Error("Unknown profile.");
  }
  suspendWrites();
  try {
    await settleWrites();
    for (const s of USER_STORES) {
      await deleteOwnedRows(s, profileId, false);
    }
    // Content rows don't appear in the profile registry's stores otherwise;
    // docContent is part of USER_STORES and carries userId — covered above.
    unregisterProfile(profileId);
  } finally {
    resumeWrites();
  }
  bump();
}

/** Erase ALL application data on this device: every identity's rows in
 *  every store, the AI artifact cache, and the app-owned localStorage keys
 *  (identity, profile registry, preferences). Other tabs are coordinated:
 *  they suspend and cancel their work the moment the erase begins, and
 *  reload when it completes. A fresh anonymous identity is created so the
 *  app continues to work immediately. */
export async function eraseAllDeviceData(): Promise<void> {
  suspendWrites();
  STORAGE_CHANNEL?.postMessage({ type: "erase-begin" });
  try {
    cancelAllJobs();
    await settleWrites(400); // give other tabs' handlers + our writes time
    for (const s of STORES) {
      await idbClearInternal(s);
    }
    clearAppStorageKeys();
    lastReadEventAt.clear();
    // Fresh anonymous identity so the app remains usable right away.
    createAndSwitchProfile();
  } finally {
    resumeWrites();
  }
  STORAGE_CHANNEL?.postMessage({ type: "erase-done" });
  bump();
}
