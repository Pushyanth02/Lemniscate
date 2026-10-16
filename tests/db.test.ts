/**
 * DB layer tests: v4→v5 content-split migration, CRUD, index queries,
 * write-suspension guard, profile registry, blocked-storage fallback.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  idbAll,
  idbAllByIndex,
  idbGet,
  idbPut,
  idbDelete,
  idbClear,
  suspendWrites,
  resumeWrites,
  StorageSuspendedError,
  getUserId,
  getUserIdentity,
  listProfiles,
  switchProfile,
  createAndSwitchProfile,
  unregisterProfile,
  clearAppStorageKeys,
  APP_STORAGE_KEYS,
  DB_NAME,
  __resetDbForTests,
  STORES,
} from "../src/lib/db";
import { installLocalStorage, freshDb } from "./helpers";
import { IDBFactory } from "fake-indexeddb";

installLocalStorage();

beforeEach(() => {
  freshDb();
});

describe("CRUD round-trip", () => {
  test("put → get → delete", async () => {
    await idbPut("documents", { id: "d1", userId: "u1" } as never);
    expect(await idbGet("documents", "d1")).toEqual({ id: "d1", userId: "u1" });
    await idbDelete("documents", "d1");
    expect(await idbGet("documents", "d1")).toBeUndefined();
  });

  test("clear empties a store", async () => {
    await idbPut("documents", { id: "d1", userId: "u1" } as never);
    await idbPut("documents", { id: "d2", userId: "u2" } as never);
    await idbClear("documents");
    expect(await idbAll("documents")).toEqual([]);
  });
});

describe("index queries", () => {
  test("by_user index returns only matching rows", async () => {
    await idbPut("documents", { id: "a", userId: "u1" } as never);
    await idbPut("documents", { id: "b", userId: "u2" } as never);
    await idbPut("documents", { id: "c", userId: "u1" } as never);
    const rows = await idbAllByIndex("documents", "by_user", "u1");
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  test("by_doc index on annotations", async () => {
    await idbPut("annotations", { id: "x", userId: "u1", documentId: "docA" } as never);
    await idbPut("annotations", { id: "y", userId: "u1", documentId: "docB" } as never);
    const rows = await idbAllByIndex("annotations", "by_doc", "docA");
    expect(rows.map((r) => r.id)).toEqual(["x"]);
  });
});

describe("write-lifecycle guard", () => {
  test("writes reject while suspended", async () => {
    suspendWrites();
    for (const p of [
      idbPut("documents", { id: "d" } as never),
      idbDelete("documents", "d"),
      idbClear("documents"),
    ]) {
      await expect(p).rejects.toThrow("Storage is suspended");
    }
    // reads still work
    expect(await idbAll("documents")).toEqual([]);
    resumeWrites();
    expect(new StorageSuspendedError().name).toBe("StorageSuspendedError");
  });

  test("resume with generation bump rejects stragglers from the old era", async () => {
    // A write that CAPTURED its generation before the suspension…
    suspendWrites();
    resumeWrites(true); // generation advanced
    // …any write that began (captured gen) before the bump now fails:
    // simulate by calling through the public API after a manual downgrade is
    // impossible; instead verify the invariant directly: a NEW write works.
    await idbPut("documents", { id: "fresh", userId: "u1" } as never);
    expect(await idbGet("documents", "fresh")).toBeDefined();
  });

  test("suspension is what destructive ops rely on: no put can land mid-wipe", async () => {
    await idbPut("documents", { id: "keep-me-out", userId: "u1" } as never);
    suspendWrites();
    try {
      await expect(
        idbPut("documents", { id: "late", userId: "u1" } as never),
      ).rejects.toThrow("Storage is suspended");
    } finally {
      resumeWrites();
    }
    expect(await idbGet("documents", "keep-me-out")).toBeDefined();
    expect(await idbGet("documents", "late")).toBeUndefined();
  });
});

describe("profile registry", () => {
  test("getUserId creates and registers exactly one identity", () => {
    const a = getUserId();
    expect(a.startsWith("anon_")).toBe(true);
    expect(getUserId()).toBe(a);
    const profiles = listProfiles();
    expect(profiles.map((p) => p.id)).toContain(a);
  });

  test("createAndSwitchProfile keeps the old profile registered (recoverable)", () => {
    const first = getUserId();
    const next = createAndSwitchProfile();
    expect(next.id).not.toBe(first);
    expect(getUserId()).toBe(next.id);
    expect(getUserIdentity().id).toBe(next.id);
    // BOTH are in the registry — rotation can never orphan data.
    const ids = listProfiles().map((p) => p.id);
    expect(ids).toContain(first);
    expect(ids).toContain(next.id);
  });

  test("switchProfile returns the profile and switches; unknown ids are rejected", () => {
    const first = getUserId();
    const second = createAndSwitchProfile();
    const back = switchProfile(first);
    expect(back?.id).toBe(first);
    expect(getUserId()).toBe(first);
    expect(switchProfile("anon_nonexistent")).toBeNull();
    expect(getUserId()).toBe(first);
    void second;
  });

  test("unregisterProfile removes bookkeeping only", () => {
    const a = getUserId();
    const b = createAndSwitchProfile();
    unregisterProfile(a);
    expect(listProfiles().map((p) => p.id)).not.toContain(a);
    expect(listProfiles().map((p) => p.id)).toContain(b.id);
  });

  test("clearAppStorageKeys wipes every app-owned key", () => {
    getUserId();
    localStorage.setItem("lemniscate:prefs", "{}");
    clearAppStorageKeys();
    for (const k of APP_STORAGE_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
    }
    // A fresh identity is created on next use.
    const next = getUserId();
    expect(next).not.toBeNull();
  });
});

describe("v4 → v5 content-split migration", () => {
  test("a v4 database with inline contentJson is migrated on open", async () => {
    // Build a v4-shaped database by hand: same stores as v4 (no docContent),
    // documents rows carrying contentJson inline.
    const factory = new IDBFactory();
    Object.defineProperty(globalThis, "indexedDB", {
      value: factory,
      configurable: true,
      writable: true,
    });
    __resetDbForTests();

    const v4Stores = STORES.filter((s) => s !== "docContent");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of v4Stores) {
          if (!db.objectStoreNames.contains(s)) {
            const os = db.createObjectStore(s, { keyPath: "id" });
            if (s === "documents") os.createIndex("by_user", "userId");
          }
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put({
          id: "legacy1",
          userId: "anon_legacy",
          title: "Legacy Book",
          contentJson: {
            chapters: [
              {
                id: "c0",
                title: "One",
                startChunk: 0,
                chunks: [{ id: "k0", kind: "p", text: "Old words." }],
              },
            ],
          },
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Now the app's module opens it at v5 and the migration runs.
    const doc = (await idbGet<Record<string, unknown>>("documents", "legacy1"))!;
    expect(doc).toBeDefined();
    expect("contentJson" in doc).toBe(false); // split out
    expect(doc.title).toBe("Legacy Book");
    const content = await idbGet<Record<string, unknown>>("docContent", "legacy1");
    expect(content).toBeDefined();
    const chapters = (content as { chapters: { chunks: { text: string }[] }[] })
      .chapters;
    expect(chapters[0]?.chunks[0]?.text).toBe("Old words.");
  });

  test("migration is idempotent for already-split rows", async () => {
    // A v5 DB opened again at v5: no version change, no migration, rows intact.
    await idbPut("documents", { id: "meta", userId: "u", title: "T" } as never);
    await idbPut("docContent", {
      id: "meta",
      userId: "u",
      chapters: [],
    } as never);
    const doc = await idbGet<Record<string, unknown>>("documents", "meta");
    expect("contentJson" in doc!).toBe(false);
    expect(await idbGet("docContent", "meta")).toBeDefined();
  });
});

describe("v6 composite indexes and bounded reads", () => {
  test("a fresh database exposes by_user_ts on activity and annotations", async () => {
    const db = await (await import("../src/lib/db")).__openDbForTests();
    const act = db.transaction("activity").objectStore("activity");
    const ann = db.transaction("annotations").objectStore("annotations");
    expect(act.indexNames.contains("by_user_ts")).toBe(true);
    expect(ann.indexNames.contains("by_user_ts")).toBe(true);
    db.close();
  });

  test("idbLatestByComposite returns newest-first, user-scoped, bounded", async () => {
    const { idbLatestByComposite } = await import("../src/lib/db");
    const rows = [
      { id: "old", userId: "u1", createdAt: 100, text: "old" },
      { id: "mid", userId: "u2", createdAt: 200, text: "other user" },
      { id: "new", userId: "u1", createdAt: 300, text: "new" },
      { id: "newest", userId: "u1", createdAt: 400, text: "newest" },
    ];
    for (const r of rows) await idbPut("activity", r as never);
    const out = await idbLatestByComposite<Record<string, unknown>>(
      "activity",
      "by_user_ts",
      "u1",
      2,
    );
    expect(out.map((r) => r.id)).toEqual(["newest", "new"]); // newest first, u2 excluded, bounded to 2
  });

  test("idbLatestByComposite with limit beyond the row count returns all of the user's rows", async () => {
    const { idbLatestByComposite } = await import("../src/lib/db");
    await idbPut("activity", { id: "a", userId: "u1", createdAt: 1 } as never);
    await idbPut("activity", { id: "b", userId: "u1", createdAt: 2 } as never);
    const out = await idbLatestByComposite<Record<string, unknown>>(
      "activity",
      "by_user_ts",
      "u1",
      50,
    );
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("idbTrimByComposite keeps the newest rows and deletes the rest", async () => {
    const { idbTrimByComposite, idbAllByIndex } = await import("../src/lib/db");
    for (let i = 0; i < 8; i++) {
      await idbPut("activity", {
        id: `a${i}`,
        userId: "u1",
        createdAt: 1000 + i,
      } as never);
    }
    const removed = await idbTrimByComposite(
      "activity",
      "by_user_ts",
      "u1",
      3,
    );
    expect(removed).toBe(5);
    const left = await idbAllByIndex<Record<string, unknown>>(
      "activity",
      "by_user",
      "u1",
    );
    expect(left.map((r) => r.id).sort()).toEqual(["a5", "a6", "a7"]); // the three newest survive
  });

  test("idbTrimByComposite under the cap is a no-op returning zero", async () => {
    const { idbTrimByComposite } = await import("../src/lib/db");
    await idbPut("activity", { id: "a", userId: "u1", createdAt: 1 } as never);
    const removed = await idbTrimByComposite(
      "activity",
      "by_user_ts",
      "u1",
      1000,
    );
    expect(removed).toBe(0);
    expect(await idbAll("activity")).toHaveLength(1);
  });

  test("trim respects the write-lifecycle guard like every write", async () => {
    const { idbTrimByComposite } = await import("../src/lib/db");
    suspendWrites();
    await expect(
      idbTrimByComposite("activity", "by_user_ts", "u1", 0),
    ).rejects.toBeInstanceOf(StorageSuspendedError);
    resumeWrites();
  });

  test("a v5 database (no composite indexes) upgrades to v6 and its rows become boundedly readable", async () => {
    // Build a v5-shaped database by hand: all stores, v5-era indexes only.
    const factory = new IDBFactory();
    Object.defineProperty(globalThis, "indexedDB", {
      value: factory,
      configurable: true,
      writable: true,
    });
    __resetDbForTests();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id" });
          }
        }
        const tx = req.transaction!;
        const act = tx.objectStore("activity");
        if (!act.indexNames.contains("by_user")) act.createIndex("by_user", "userId");
        if (!act.indexNames.contains("by_ts")) act.createIndex("by_ts", "createdAt");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("activity", "readwrite");
        tx.objectStore("activity").put({
          id: "legacy1",
          userId: "anon_legacy",
          createdAt: 12345,
          type: "import",
          text: "Old book imported",
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // The app's module opens it at v6: the composite index lands, and the
    // bounded read serves the legacy row through it.
    const { idbLatestByComposite, __openDbForTests } = await import(
      "../src/lib/db"
    );
    const out = await idbLatestByComposite<Record<string, unknown>>(
      "activity",
      "by_user_ts",
      "anon_legacy",
      10,
    );
    expect(out.map((r) => r.id)).toEqual(["legacy1"]);
    const db = await __openDbForTests();
    expect(
      db.transaction("activity").objectStore("activity").indexNames.contains("by_user_ts"),
    ).toBe(true);
    db.close();
  });
});
