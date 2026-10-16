/**
 * IndexedDB persistence layer — the local-first backbone.
 *
 * Every store is keyed by `id`; secondary lookups use the `by_user` / `by_doc`
 * indexes. Since v5, document *content* (the parsed chapters) lives in its
 * own `docContent` store so library/progress queries never clone whole books.
 *
 * ── Write-lifecycle guard (destructive operations) ──────────────────
 * `suspendWrites()` / `resumeWrites()` bracket every destructive data
 * operation ("clear this profile", "erase all device data", restore).
 * While suspended, and for any write that began under an earlier
 * *generation*, the write helpers reject with `StorageSuspendedError` —
 * so a late asynchronous result (job heartbeat, activity log, progress
 * save) can never recreate a record the user just deleted.
 *
 * ── Identity ────────────────────────────────────────────────────────
 * The anonymous identity lives in localStorage, together with a registry
 * of every profile ever created on this device (`listProfiles`). When
 * localStorage is blocked (private mode, permissions policy), identity
 * falls back to an in-memory ephemeral ID and `localStorageBlocked()`
 * reports true so the UI can explain the situation instead of failing
 * an unexplained startup.
 */

export const DB_NAME = "lemniscate";
/* v6: composite [userId, createdAt] indexes on activity + annotations so
 * "latest N for this identity" reads walk an index cursor instead of
 * loading the whole store and sorting in JS. Created idempotently below. */
const DB_VERSION = 6;

export const STORES = [
  "documents",
  "docContent",
  "bookmarks",
  "annotations",
  "scenes",
  "sceneNotes",
  "activity",
  "usage",
  "stories",
  "jobs",
  "aiCache",
] as const;

export type StoreName = (typeof STORES)[number];

/** Secondary indexes per store: name → key path (a string, or string[]
 *  for a composite key). Created idempotently on every version bump so
 *  upgrades from any prior version converge. */
const INDEXES: Partial<
  Record<StoreName, { name: string; path: string | string[] }[]>
> = {
  documents: [{ name: "by_user", path: "userId" }],
  docContent: [{ name: "by_user", path: "userId" }],
  bookmarks: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  annotations: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
    { name: "by_user_ts", path: ["userId", "createdAt"] },
  ],
  scenes: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  sceneNotes: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  activity: [
    { name: "by_user", path: "userId" },
    { name: "by_ts", path: "createdAt" },
    { name: "by_user_ts", path: ["userId", "createdAt"] },
  ],
  usage: [{ name: "by_user", path: "userId" }],
  stories: [{ name: "by_user", path: "userId" }],
  jobs: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction!;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id" });
          }
          const os = tx.objectStore(s);
          for (const idx of INDEXES[s] ?? []) {
            if (!os.indexNames.contains(idx.name)) {
              os.createIndex(idx.name, idx.path, { unique: false });
            }
          }
        }
        /* v5: split chapter content out of `documents` into `docContent`.
         * Runs as an idempotent cursor migration inside the versionchange
         * transaction — a row that already lost its contentJson is a no-op,
         * so upgrades from any version converge. */
        if (db.objectStoreNames.contains("documents")) {
          const docs = tx.objectStore("documents");
          const content =
            db.objectStoreNames.contains("docContent")
              ? tx.objectStore("docContent")
              : null;
          if (content) {
            const cursorReq = docs.openCursor();
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (!cursor) return;
              const row = cursor.value as {
                id?: string;
                userId?: string;
                contentJson?: { chapters?: unknown[] };
              };
              if (row && typeof row.id === "string" && row.contentJson) {
                content.put({
                  id: row.id,
                  userId: row.userId ?? "",
                  chapters: row.contentJson.chapters ?? [],
                });
                const { contentJson: _drop, ...rest } = row;
                void _drop;
                cursor.update(rest);
              }
              cursor.continue();
            };
          }
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab wants to upgrade the DB version: close our handle so
        // the other tab's open can proceed instead of blocking forever.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => {
        // A failed open (storage disabled, corruption) must not be memoized
        // forever — clear so the next call can retry.
        dbPromise = null;
        reject(req.error ?? new Error("Failed to open local database"));
      };
      // An older tab holds the previous version open: fail fast with an
      // actionable message instead of hanging in `blocked` indefinitely.
      req.onblocked = () => {
        dbPromise = null;
        reject(
          new Error(
            "Close other Lemniscate tabs to finish the local-database upgrade.",
          ),
        );
      };
    });
  }
  return dbPromise;
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (os: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        let reqResult: unknown;
        req.onsuccess = () => {
          reqResult = req.result;
        };
        req.onerror = () =>
          reject(req.error ?? new Error(`IndexedDB ${store} operation failed`));
        // A transaction abort fires onabort, not onerror — without this the
        // promise would hang forever if the transaction is aborted (e.g. by
        // a quota error or an unhandled request error in a multi-op tx).
        t.onabort = () =>
          reject(
            t.error ?? new Error(`IndexedDB ${store} transaction aborted`),
          );
        // Writes resolve only on COMMIT: request success fires before the
        // transaction commits, so a commit-phase abort (quota pressure)
        // would otherwise masquerade as a successful save.
        t.oncomplete = () => resolve(reqResult as T);
        // Readonly transactions have no commit semantics to wait for beyond
        // the request itself, but oncomplete fires for them too — one path.
        void mode;
      }),
  );
}

export interface Row {
  id: string;
}

/* ────────────────────────────────────────────────────────────
   Write-lifecycle guard.
   See the module header: destructive operations suspend writes
   and advance the generation so late async results cannot
   recreate deleted records.
   ──────────────────────────────────────────────────────────── */

export class StorageSuspendedError extends Error {
  constructor() {
    super("Storage is suspended during a destructive operation.");
    this.name = "StorageSuspendedError";
  }
}

let writeGeneration = 0;
let writesSuspended = false;

/** Suspend all public write helpers. Call before beginning a destructive
 *  operation; pair with `resumeWrites()` in a finally. */
export function suspendWrites(): void {
  writesSuspended = true;
}

/** Resume writes. `bumpGeneration` (default true) permanently invalidates
 *  writes that began before the suspension, so a straggler promise from an
 *  earlier era keeps failing instead of landing post-clear data. */
export function resumeWrites(bumpGeneration = true): void {
  if (bumpGeneration) writeGeneration++;
  writesSuspended = false;
}

function assertWritable(gen: number): void {
  if (writesSuspended || gen !== writeGeneration) {
    throw new StorageSuspendedError();
  }
}

/** Await this before clearing stores in a destructive flow: in-flight
 *  writes from THIS tab get a brief window to settle (or abort) so the
 *  clear transaction orders after them. */
export function settleWrites(graceMs = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, graceMs));
}

/* ────────────────────────────────────────────────────────────
   CRUD helpers (public API — all guarded).
   ──────────────────────────────────────────────────────────── */

export function idbAll<T extends Row>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, "readonly", (os) => os.getAll());
}

/** All rows in `store` whose `indexName` key equals `key` — uses the
 *  IndexedDB index instead of getAll + JS filter. */
export function idbAllByIndex<T extends Row>(
  store: StoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const t = db.transaction(store, "readonly");
        const os = t.objectStore(store);
        let index: IDBIndex;
        try {
          index = os.index(indexName);
        } catch {
          // Index missing (ancient DB mid-upgrade) — fall back to a scan.
          void t.abort?.();
          idbAll<T>(store).then(
            (rows) =>
              resolve(
                rows.filter(
                  (r) =>
                    (r as Record<string, unknown>)[indexNameToPath(store, indexName)] ===
                    key,
                ),
              ),
            reject,
          );
          return;
        }
        const req = index.getAll(IDBKeyRange.only(key));
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () =>
          reject(req.error ?? new Error(`Index read ${store}.${indexName} failed`));
        t.onabort = () =>
          reject(t.error ?? new Error(`Index read ${store}.${indexName} aborted`));
      }),
  );
}

/** keyPath for a declared index, used only by the fallback path above. */
function indexNameToPath(store: StoreName, indexName: string): string {
  const idx = INDEXES[store]?.find((i) => i.name === indexName);
  return (idx?.path as string) ?? indexName;
}

/* ────────────────────────────────────────────────────────────
   Composite-index reads (v6): "the newest N rows for this user"
   without loading the store. Requires an index whose key path is
   [userId, <timestamp-ish field>]; the cursor walks it in reverse,
   so cost scales with N (plus one jump), not with library size.
   ──────────────────────────────────────────────────────────── */

/** The IDBKeyRange covering every composite key [userId, *] for one
 * identity: `[userId]` lower-bounds the prefix (a shorter array sorts
 * before its extensions) and `[userId, []]` upper-bounds it (the empty
 * array sorts after every number), so all [userId, n] keys fall inside. */
function compositeUserRange(userId: string): IDBKeyRange {
  return IDBKeyRange.bound([userId], [userId, []]);
}

/** The newest `limit` rows of `store` for `userId`, newest first, read
 *  through a descending cursor on the composite index — the bounded
 *  replacement for "load all, filter, sort, slice". */
export function idbLatestByComposite<
  T extends Row & { userId: string; createdAt: number },
>(
  store: StoreName,
  indexName: string,
  userId: string,
  limit: number,
): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const t = db.transaction(store, "readonly");
        const os = t.objectStore(store);
        let index: IDBIndex;
        try {
          index = os.index(indexName);
        } catch {
          // Index missing (ancient DB mid-upgrade) — bounded scan fallback.
          void t.abort?.();
          idbAll<T>(store).then(
            (rows) =>
              resolve(
                rows
                  .filter((r) => r.userId === userId)
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, limit),
              ),
            reject,
          );
          return;
        }
        const out: T[] = [];
        const req = index.openCursor(compositeUserRange(userId), "prev");
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || out.length >= limit) {
            resolve(out);
            return;
          }
          out.push(cursor.value as T);
          cursor.continue();
        };
        req.onerror = () =>
          reject(req.error ?? new Error(`Index read ${store}.${indexName} failed`));
        t.onabort = () =>
          reject(t.error ?? new Error(`Index read ${store}.${indexName} aborted`));
      }),
  );
}

/** Keep only the newest `keep` rows of `store` for `userId` (by the same
 *  composite ordering) and delete the rest; resolves with the number of
 *  rows removed. Guarded by the write-lifecycle guard like every write.
 *  `advance(keep)` skips the survivors in one jump, so a ledger already
 *  under the cap costs one cursor open, not a row-by-row walk. */
export function idbTrimByComposite(
  store: StoreName,
  indexName: string,
  userId: string,
  keep: number,
): Promise<number> {
  const gen = writeGeneration;
  return (async () => {
    assertWritable(gen);
    return openDb().then(
      (db) =>
        new Promise<number>((resolve, reject) => {
          const t = db.transaction(store, "readwrite");
          const os = t.objectStore(store);
          let index: IDBIndex;
          try {
            index = os.index(indexName);
          } catch {
            // Index missing — nothing to trim through; report zero. The
            // next boot (after the v6 upgrade lands) trims for real.
            void t.abort?.();
            resolve(0);
            return;
          }
          let removed = 0;
          // Rows still to skip before deleting begins (the survivors).
          let skip = keep;
          const req = index.openCursor(compositeUserRange(userId), "prev");
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return; // resolved on transaction complete
            if (skip > 0) {
              // Jump over the survivors in one advance.
              const n = skip;
              skip = 0;
              cursor.advance(n);
              return;
            }
            removed++;
            cursor.delete();
            cursor.continue();
          };
          t.oncomplete = () => resolve(removed);
          t.onerror = () =>
            reject(t.error ?? new Error(`Trim ${store}.${indexName} failed`));
          t.onabort = () =>
            reject(t.error ?? new Error(`Trim ${store}.${indexName} aborted`));
        }),
    );
  })();
}

export function idbGet<T extends Row>(
  store: StoreName,
  id: string,
): Promise<T | undefined> {
  return tx<T | undefined>(store, "readonly", (os) => os.get(id));
}

export function idbPut<T extends Row>(
  store: StoreName,
  value: T,
): Promise<void> {
  const gen = writeGeneration;
  // The guard rejects ASYNCHRONOUSLY (async wrapper) so every existing
  // `.catch()` path in background writers (job heartbeats, fire-and-forget
  // logs) handles the suspension instead of an uncaught sync throw.
  return (async () => {
    assertWritable(gen);
    await tx<IDBValidKey>(store, "readwrite", (os) => os.put(value));
  })();
}

export function idbBulkPut<T extends Row>(
  store: StoreName,
  values: T[],
): Promise<void> {
  const gen = writeGeneration;
  return (async () => {
    assertWritable(gen);
    await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        for (const v of values) os.put(v);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error("Bulk write failed"));
        // An abort (e.g. quota exceeded or a failed request) fires onabort,
        // not onerror — without this handler the promise would hang forever.
        t.onabort = () => reject(t.error ?? new Error("Bulk write aborted"));
      }),
    );
  })();
}

export function idbDelete(store: StoreName, id: string): Promise<void> {
  const gen = writeGeneration;
  return (async () => {
    assertWritable(gen);
    await tx<undefined>(store, "readwrite", (os) => os.delete(id));
  })();
}

/** Unguarded clear used ONLY by the destructive flows themselves (which
 *  suspend public writes first). Everything else goes through idbClear. */
export function idbClearInternal(store: StoreName): Promise<void> {
  return tx<undefined>(store, "readwrite", (os) => os.clear()).then(
    () => undefined,
  );
}

export function idbClear(store: StoreName): Promise<void> {
  const gen = writeGeneration;
  return (async () => {
    assertWritable(gen);
    await idbClearInternal(store);
  })();
}

/** Delete every row in `store` whose `indexName` key equals `key`.
 *  Index-driven (no full getAll). Unguarded variant for destructive flows. */
export function idbDeleteByIndexInternal(
  store: StoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<number> {
  return openDb().then(
    (db) =>
      new Promise<number>((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        let count = 0;
        try {
          const req = os.index(indexName).openCursor(IDBKeyRange.only(key));
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            cursor.delete();
            count++;
            cursor.continue();
          };
        } catch {
          void t.abort?.();
          reject(new Error(`Index ${store}.${indexName} unavailable`));
          return;
        }
        t.oncomplete = () => resolve(count);
        t.onerror = () =>
          reject(t.error ?? new Error(`Index delete ${store}.${indexName} failed`));
        t.onabort = () =>
          reject(t.error ?? new Error(`Index delete ${store}.${indexName} aborted`));
      }),
  );
}

/* ---------------- session identity ---------------- */

/** localStorage keys for the anonymous local identity. Exported so other
 *  surfaces (e.g. Settings' profile management) never duplicate the
 *  literals. */
export const UID_KEY = "lemniscate:uid";
export const UID_CREATED_KEY = "lemniscate:uid-created";
/** Registry of every profile that has ever existed on this device, so
 *  "rotating" never orphans data: previous profiles stay listed and can be
 *  switched back to or explicitly deleted. */
export const PROFILES_KEY = "lemniscate:profiles";

export interface ProfileMeta {
  id: string;
  createdAt: number;
}

/** True when localStorage threw on access (blocked storage, e.g. strict
 *  privacy mode). The app keeps working with an in-memory ephemeral
 *  identity; the UI surfaces this so startup never fails opaquely. */
let localStorageBlockedFlag = false;

export function localStorageBlocked(): boolean {
  return localStorageBlockedFlag;
}

/** In-memory fallback identity for blocked-storage sessions. */
let ephemeralId: string | null = null;

/** Ids already registered in the device profile registry during this
 *  session. getUserId() sits on the hottest path in the app (every query
 *  loader, progress save, and AI request); re-registering on every call
 *  meant a full registry JSON round-trip through localStorage each time. */
const registeredThisSession = new Set<string>();

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    localStorageBlockedFlag = true;
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    localStorageBlockedFlag = true;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    localStorageBlockedFlag = true;
  }
}

function newId(): string {
  const cryptoObj =
    typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `anon_${cryptoObj.randomUUID()}`;
  }
  return `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** The registry of profiles on this device. Best-effort: blocked storage
 *  yields an empty list rather than throwing. */
export function listProfiles(): ProfileMeta[] {
  const raw = safeGet(PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ProfileMeta[] = [];
    for (const p of parsed) {
      if (
        p &&
        typeof p === "object" &&
        typeof (p as ProfileMeta).id === "string" &&
        typeof (p as ProfileMeta).createdAt === "number"
      ) {
        out.push({ id: (p as ProfileMeta).id, createdAt: (p as ProfileMeta).createdAt });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function registerProfile(id: string, createdAt: number): void {
  const profiles = listProfiles().filter((p) => p.id !== id);
  profiles.push({ id, createdAt });
  safeSet(PROFILES_KEY, JSON.stringify(profiles.slice(-50)));
}

/** Anonymous signed-style local identity. All rows are stamped with it so
 *  data access is always filtered by owner — mirroring server-side isolation.
 *  Registers the profile in the device registry so switching back is always
 *  possible. When localStorage is blocked, a per-session ephemeral identity
 *  is used instead (see `localStorageBlocked()`). */
export function getUserId(): string {
  /* Blocked-storage sessions pin one ephemeral identity for their whole
     lifetime: regenerating per call would orphan every row written a
     moment earlier (ids are row owners). */
  if (localStorageBlockedFlag && ephemeralId) return ephemeralId;
  let id = safeGet(UID_KEY);
  if (!id) {
    id = newId();
    const now = Date.now();
    safeSet(UID_KEY, id);
    safeSet(UID_CREATED_KEY, String(now));
    registerProfile(id, now);
    registeredThisSession.add(id);
    if (localStorageBlockedFlag) {
      // Storage is blocked: keep a stable in-memory identity for this
      // session so rows are at least consistently owned while it lasts.
      ephemeralId = id;
    }
  }
  if (!registeredThisSession.has(id)) {
    registerProfile(
      id,
      Number(safeGet(UID_CREATED_KEY) ?? Date.now()) || Date.now(),
    );
    registeredThisSession.add(id);
  }
  return id;
}

export function getUserIdentity(): { id: string; createdAt: number } {
  const id = getUserId();
  const createdRaw = safeGet(UID_CREATED_KEY);
  return {
    id,
    createdAt: createdRaw ? Number(createdRaw) || Date.now() : Date.now(),
  };
}

/** Create a fresh profile, register it, and make it current. The previous
 *  profile remains in the registry (recoverable) — nothing is orphaned. */
export function createAndSwitchProfile(): ProfileMeta {
  const id = newId();
  const createdAt = Date.now();
  safeSet(UID_KEY, id);
  safeSet(UID_CREATED_KEY, String(createdAt));
  registerProfile(id, createdAt);
  return { id, createdAt };
}

/** Switch back to a previously registered profile. Returns the profile, or
 *  null when the id is unknown to the registry (nothing changes). */
export function switchProfile(id: string): ProfileMeta | null {
  const known = listProfiles().find((p) => p.id === id);
  if (!known) return null;
  safeSet(UID_KEY, known.id);
  safeSet(UID_CREATED_KEY, String(known.createdAt));
  ephemeralId = null;
  /* Allow the next getUserId() to re-assert registration (self-healing
     bookkeeping, matching the pre-optimization behavior). */
  registeredThisSession.delete(known.id);
  return known;
}

/** Remove a profile from the registry (identity bookkeeping only — its
 *  IndexedDB rows are removed by the data layer). */
export function unregisterProfile(id: string): void {
  safeSet(
    PROFILES_KEY,
    JSON.stringify(listProfiles().filter((p) => p.id !== id)),
  );
  /* A later getUserId() may legitimately re-register this id if it is
     still the active identity — keep that self-healing path open. */
  registeredThisSession.delete(id);
}

/** Every localStorage key this app owns. Used by full-device erasure and
 *  by tests that need a clean slate. */
export const APP_STORAGE_KEYS: readonly string[] = [
  UID_KEY,
  UID_CREATED_KEY,
  PROFILES_KEY,
  "lemniscate:prefs",
];

/** Remove all app-owned localStorage keys (identity, registry, prefs). */
export function clearAppStorageKeys(): void {
  for (const k of APP_STORAGE_KEYS) safeRemove(k);
  ephemeralId = null;
  registeredThisSession.clear();
}

/* ---------------- test support ---------------- */

/** Reset memoized DB state so a test file can point `indexedDB` at a fresh
 *  fake factory. Never call from application code. Resets the COMPLETE
 *  transient module surface — including the blocked-storage fallback
 *  (`localStorageBlockedFlag` + `ephemeralId`), which otherwise pins a
 *  stale ephemeral identity across test files: a file that runs without
 *  a localStorage shim (e.g. the cache suite) makes every storage access
 *  throw, latching the blocked flag; the next file's first getUserId()
 *  would then pin an ephemeral id and ignore the real registry forever. */
export function __resetDbForTests(): void {
  dbPromise = null;
  writesSuspended = false;
  writeGeneration = 0;
  registeredThisSession.clear();
  localStorageBlockedFlag = false;
  ephemeralId = null;
}

/** The live database handle, for tests that must inspect raw schema state
 *  (e.g. that an index exists after a version upgrade). Never call from
 *  application code; the handle is the module's own memoized connection. */
export function __openDbForTests(): Promise<IDBDatabase> {
  return openDb();
}
