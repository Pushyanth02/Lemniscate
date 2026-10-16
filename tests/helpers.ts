/**
 * Shared test environment for bun:test suites that touch the data layer.
 *
 * - fake-indexeddb provides a real, spec-faithful IndexedDB implementation
 *   (migrations, transactions, indexes, aborts) in-process.
 * - a minimal localStorage shim lets identity/profile-registry code run
 *   exactly as it does in the browser.
 * - `freshDb()` swaps in a brand-new empty database + clean module state,
 *   so every test starts from a known point.
 */
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { __resetDbForTests, clearAppStorageKeys } from "../src/lib/db";

/* ---------------- localStorage shim ---------------- */

class LocalStorageShim {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

export function installLocalStorage(): LocalStorageShim {
  const shim = new LocalStorageShim();
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
  return shim;
}

/* ---------------- fresh IndexedDB per test ---------------- */

/** Swap in a brand-new empty IndexedDB and reset the db module's memoized
 *  connection + write-generation state. Also wipes the localStorage shim.
 *  fake-indexeddb's IDBKeyRange is installed globally too — bun does not
 *  provide one natively, and the app code references the browser global. */
export function freshDb(): void {
  const factory = new IDBFactory();
  Object.defineProperty(globalThis, "indexedDB", {
    value: factory,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "IDBKeyRange", {
    value: IDBKeyRange,
    configurable: true,
    writable: true,
  });
  const ls = globalThis.localStorage as LocalStorageShim | undefined;
  if (ls && typeof ls.clear === "function") {
    ls.clear();
  } else {
    clearAppStorageKeys();
  }
  /* Reset the db module's transient state LAST: the no-shim fallback above
   * (clearAppStorageKeys) can itself latch the blocked-storage flag when
   * localStorage is absent — the reset clears it, so every caller starts
   * from the same known-clean module state. */
  __resetDbForTests();
}

/** Minimal row shape helpers for tests. */
export function docRow(
  id: string,
  userId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    userId,
    title: `Doc ${id}`,
    author: "Test",
    sourceType: "txt",
    mimeType: "text/plain",
    byteSize: 100,
    status: "ready",
    error: null,
    warnings: [],
    summary: null,
    language: "en",
    coverGradient: "g",
    chapterCount: 1,
    wordCount: 10,
    charCount: 50,
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: null,
    readingProgress: 0,
    lastChunkIndex: 0,
    favorite: false,
    tags: ["txt"],
    collection: null,
    ...extra,
  };
}

export function contentRow(
  docId: string,
  userId: string,
): Record<string, unknown> {
  return {
    id: docId,
    userId,
    chapters: [
      {
        id: `${docId}-c0`,
        title: "Chapter One",
        startChunk: 0,
        chunks: [{ id: "k0", kind: "p", text: "The first paragraph." }],
      },
    ],
  };
}
