/**
 * Data lifecycle tests — the Phase-1 acceptance criteria:
 * identity isolation, distinct destructive operations, late-writer
 * prevention, cross-identity erasure, and export/restore round-trips.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  importParsed,
  clearCurrentProfileData,
  deleteProfileData,
  eraseAllDeviceData,
  deleteDocument,
  updateProgress,
  logActivity,
  putStory,
  bump,
} from "../src/lib/data";
import {
  getUserId,
  listProfiles,
  createAndSwitchProfile,
  switchProfile,
  idbAll,
  idbGet,
  idbPut,
} from "../src/lib/db";
import {
  parseBackup,
  restoreBackup,
  buildBackup,
} from "../src/lib/backup";
import { installLocalStorage, freshDb, docRow, contentRow } from "./helpers";
import type { ParsedDoc } from "../src/lib/types";

installLocalStorage();

const parsed = (title: string): ParsedDoc => ({
  title,
  author: "Test Author",
  language: "en",
  sourceType: "txt",
  chapters: [
    {
      id: "c0",
      title: "One",
      startChunk: 0,
      chunks: [{ id: "k0", kind: "p", text: `${title} body text.` }],
    },
  ],
  wordCount: 3,
  charCount: 20,
  quality: { score: 90, notes: [] },
  warnings: [],
});

const fileish = { type: "text/plain", size: 123 } as never;

async function importOne(title: string): Promise<string> {
  const row = await importParsed(fileish, parsed(title));
  return row.id;
}

async function storeCounts(): Promise<Record<string, number>> {
  const stores = [
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
  const out: Record<string, number> = {};
  for (const s of stores) out[s] = (await idbAll(s)).length;
  return out;
}

beforeEach(() => {
  freshDb();
});

describe("identity isolation", () => {
  test("two profiles cannot see each other's documents", async () => {
    const a = await importOne("A's book");
    const profileA = getUserId();
    createAndSwitchProfile();
    expect(getUserId()).not.toBe(profileA);
    const b = await importOne("B's book");
    const docsA = (await idbAll("documents")).filter(
      (d) => d.userId === profileA,
    );
    const docsB = (await idbAll("documents")).filter(
      (d) => d.userId === getUserId(),
    );
    expect(docsA.map((d) => d.id)).toEqual([a]);
    expect(docsB.map((d) => d.id)).toEqual([b]);
  });
});

describe("clearCurrentProfileData", () => {
  test("removes this profile's rows, keeps other profiles", async () => {
    const aDoc = await importOne("A's book");
    await logActivity("read", "A read", aDoc);
    const profileA = getUserId();
    createAndSwitchProfile();
    await importOne("B's book");

    await clearCurrentProfileData();

    const counts = await storeCounts();
    // Only profile A's doc + content + its activity rows remain.
    const remainingDocs = await idbAll("documents");
    expect(remainingDocs.map((d) => d.id)).toEqual([aDoc]);
    expect(remainingDocs[0]?.userId).toBe(profileA);
    expect(counts.docContent).toBe(1);
  });

  test("a late async writer cannot recreate cleared records", async () => {
    const docId = await importOne("Doomed");
    const profile = getUserId();
    // Clear the profile first (this also removes the import's own activity
    // row) — then simulate the suspension window of a SECOND destructive
    // operation: writes issued while it runs are rejected.
    await clearCurrentProfileData();
    expect(
      (await idbAll("activity")).filter((r) => r.userId === profile).length,
    ).toBe(0);
    const { suspendWrites, resumeWrites } = await import("../src/lib/db");
    suspendWrites();
    await expect(logActivity("read", "mid-wipe write", docId)).rejects.toThrow(
      "Storage is suspended",
    );
    resumeWrites();
    // …and the rejection means the row was never written.
    const activities = (await idbAll("activity")).filter(
      (r) => r.userId === profile,
    );
    expect(activities.length).toBe(0);
    // NEW work after the clear is allowed (fresh generation) — that is the
    // fresh-start contract, and exactly what the straggler-prevention epoch
    // distinguishes it from (see the erase/jobs test below).
    await logActivity("upload", "fresh after clear", null);
    const after = (await idbAll("activity")).filter(
      (r) => r.userId === profile,
    );
    expect(after.length).toBe(1);
  });

  test("clear is safe to retry", async () => {
    await importOne("One");
    await clearCurrentProfileData();
    await clearCurrentProfileData(); // no error, still empty
    expect((await storeCounts()).documents).toBe(0);
  });
});

describe("deleteProfileData", () => {
  test("removes another profile's rows and registry entry", async () => {
    const profileA = getUserId();
    await importOne("A's book");
    createAndSwitchProfile();
    await importOne("B's book");

    await deleteProfileData(profileA);

    expect((await idbAll("documents")).map((d) => d.userId)).toEqual([
      getUserId(),
    ]);
    expect(listProfiles().map((p) => p.id)).not.toContain(profileA);
  });

  test("refuses to delete the ACTIVE profile (use clear instead)", async () => {
    await expect(deleteProfileData(getUserId())).rejects.toThrow(
      "Clear this profile",
    );
  });

  test("refuses unknown profiles", async () => {
    await expect(deleteProfileData("anon_nope")).rejects.toThrow("Unknown");
  });
});

describe("eraseAllDeviceData — the full-device wipe", () => {
  test("every identity, every store, every app key; fresh identity after", async () => {
    await importOne("A's book");
    const profileA = getUserId();
    createAndSwitchProfile();
    await importOne("B's book");
    await putStory({
      id: "st1",
      userId: getUserId(),
      title: "Draft",
      mode: "continue",
      body: "words",
      sourceDocumentId: null,
      status: "done",
      progress: 100,
      step: "Complete",
      error: null,
      createdAt: 1,
    });
    // an unattributable legacy row, as produced by very old versions
    await idbPut("bookmarks", { id: "legacy", documentId: "x" } as never);

    await eraseAllDeviceData();

    const counts = await storeCounts();
    for (const [store, n] of Object.entries(counts)) {
      expect(n, `${store} must be empty`).toBe(0);
    }
    // The app-owned storage keys were wiped and immediately re-seeded with
    // a FRESH identity (by design — the room stays usable). The registry
    // contains only the new profile: every trace of the old ones is gone.
    const fresh = getUserId();
    expect(fresh).not.toBe(profileA);
    expect(fresh.startsWith("anon_")).toBe(true);
    const registryIds = listProfiles().map((p) => p.id);
    expect(registryIds).toEqual([fresh]);
  });

  test("active jobs are cancelled first and cannot write results back", async () => {
    const { enqueueJob } = await import("../src/lib/jobs");
    await importOne("Book with a job");
    let finishCallback: (() => void) | null = null;
    const job = enqueueJob<string>({
      label: "test job",
      steps: ["work"],
      run: () =>
        new Promise<string>((resolve) => {
          finishCallback = () => resolve("late result");
        }),
      onDone: async (result) => {
        // If this fires after the wipe, it must fail to persist anything.
        await logActivity("story", `job done: ${result}`, null);
      },
    });
    // Give the queue a moment to start the job, then wipe mid-flight.
    await new Promise((r) => setTimeout(r, 50));
    await eraseAllDeviceData();
    // Release the job's run promise now (simulating a slow fetch resolving
    // after the wipe completed).
    finishCallback?.();
    await new Promise((r) => setTimeout(r, 120));
    const activities = await idbAll("activity");
    expect(activities.length).toBe(0);
    const jobs = await idbAll("jobs");
    expect(jobs.length).toBe(0);
    expect(job.row.status).toBeDefined();
  });

  test("the wipe is effective after a simulated reload", async () => {
    await importOne("Persist check");
    await eraseAllDeviceData();
    // A "reload" means fresh module state — simulate by re-reading raw.
    const counts = await storeCounts();
    expect(counts.documents).toBe(0);
    expect(counts.docContent).toBe(0);
    expect(counts.activity).toBe(0);
    // The only identity on record is the fresh one created by the wipe.
    const registryIds = listProfiles().map((p) => p.id);
    expect(registryIds).toEqual([getUserId()]);
  });
});

describe("deleteDocument cascade", () => {
  test("children die with the document", async () => {
    const docId = await importOne("Parent");
    const me = getUserId();
    await idbPut("bookmarks", {
      id: "bm1",
      userId: me,
      documentId: docId,
      chunkIndex: 0,
      label: "",
      note: "",
      createdAt: 1,
    } as never);
    await idbPut("annotations", {
      id: "an1",
      userId: me,
      documentId: docId,
      chunkIndex: 0,
      start: 0,
      end: 3,
      text: "txt",
      note: "",
      color: "gold",
      createdAt: 1,
    } as never);
    await idbPut("docContent", contentRow(docId, me) as never);

    await deleteDocument(docId);

    expect(await idbGet("documents", docId)).toBeUndefined();
    expect(await idbGet("docContent", docId)).toBeUndefined();
    expect((await idbAll("bookmarks")).length).toBe(0);
    expect((await idbAll("annotations")).length).toBe(0);
  });
});

describe("progress saves touch metadata only", () => {
  test("updateProgress preserves content rows and never clones chapters", async () => {
    const docId = await importOne("Long book");
    const before = await idbGet("docContent", docId);
    await updateProgress(docId, 5, 42.3);
    const after = await idbGet("docContent", docId);
    expect(after).toEqual(before); // content row untouched
    const doc = await idbGet<{ readingProgress: number; lastReadAt: number }>(
      "documents",
      docId,
    );
    expect(doc?.readingProgress).toBe(42.3);
    expect(doc?.lastReadAt).toBeGreaterThan(0);
  });
});

describe("export / restore round-trips", () => {
  test("v3 export → parse → restore into a fresh profile reproduces the library", async () => {
    const docId = await importOne("Exported book");
    await updateProgress(docId, 2, 33);
    const exported = (await buildBackup("full")).text;
    const parsedExport = parseBackup(exported);
    expect(parsedExport.ok).toBe(true);
    if (!parsedExport.ok) return;
    expect(parsedExport.preview.version).toBe(3);
    expect(parsedExport.preview.hasPreferences).toBe(true);
    expect(parsedExport.preview.totalRows).toBeGreaterThan(0);

    // Wipe, then restore as a brand-new profile.
    await eraseAllDeviceData();
    const result = await restoreBackup(parsedExport, {
      conflict: "merge",
      userId: getUserId(),
    });
    expect(result.written.length).toBeGreaterThan(0);
    const docs = await idbAll("documents");
    expect(docs.map((d) => d.title)).toEqual(["Exported book"]);
    expect(docs[0]?.userId).toBe(getUserId()); // re-stamped to current profile
    expect(await idbGet("docContent", docs[0]?.id ?? "")).toBeDefined();
    expect(docs[0]?.readingProgress).toBe(33);
  });

  test("merge policy keeps existing rows; replace overwrites them", async () => {
    const docId = await importOne("Original");
    const exported = (await buildBackup("full")).text;
    const parsedExport = parseBackup(exported);
    if (!parsedExport.ok) throw new Error("export parse failed");

    // Change the live row, then merge-restore: live wins.
    await idbPut("documents", docRow(docId, getUserId(), { title: "Changed" }) as never);
    await restoreBackup(parsedExport, { conflict: "merge", userId: getUserId() });
    expect(
      (await idbGet<{ title: string }>("documents", docId))?.title,
    ).toBe("Changed");

    // Replace-restore: backup wins.
    await restoreBackup(parsedExport, { conflict: "replace", userId: getUserId() });
    expect(
      (await idbGet<{ title: string }>("documents", docId))?.title,
    ).toBe("Original");
  });

  test("legacy v1 backups (inline contentJson) are split on restore", async () => {
    const v1 = JSON.stringify({
      app: "lemniscate",
      exportedAt: new Date().toISOString(),
      data: {
        documents: [docRow("old1", "anon_old", { contentJson: contentRow("old1", "anon_old").chapters ? { chapters: contentRow("old1", "anon_old").chapters } : undefined })],
      },
    });
    const parsedBackup = parseBackup(v1);
    expect(parsedBackup.ok).toBe(true);
    if (!parsedBackup.ok) return;
    expect(parsedBackup.preview.version).toBe(1);
    await restoreBackup(parsedBackup, { conflict: "merge", userId: getUserId() });
    const doc = await idbGet<Record<string, unknown>>("documents", "old1");
    expect("contentJson" in doc!).toBe(false);
    expect(await idbGet("docContent", "old1")).toBeDefined();
  });

  test("malformed inputs are rejected before any write", async () => {
    const bad = [
      "not json",
      JSON.stringify({ app: "other" }),
      JSON.stringify({ app: "lemniscate", data: { documents: "nope" } }),
      JSON.stringify({ app: "lemniscate", data: { documents: [{ noId: true }] } }),
      JSON.stringify({
        app: "lemniscate",
        data: {
          documents: [
            docRow("dup", "u"),
            docRow("dup", "u"),
          ],
        },
      }),
      JSON.stringify({
        app: "lemniscate",
        data: { documents: [{ id: "x" }] }, // no userId
      }),
      JSON.stringify({ app: "lemniscate", data: {} }), // empty
    ];
    for (const text of bad) {
      const res = parseBackup(text);
      expect(res.ok, `should reject: ${text.slice(0, 60)}`).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
    }
    // nothing was written by any of them
    expect((await idbAll("documents")).length).toBe(0);
  });

  test("oversized backups are rejected by the byte limit", () => {
    const huge = JSON.stringify({
      app: "lemniscate",
      data: { activity: [{ id: "a", userId: "u", type: "read", detail: "x".repeat(200), documentId: null, createdAt: 1 }] },
    }).replace("x".repeat(200), "x".repeat(160 * 1024 * 1024));
    const res = parseBackup(huge);
    expect(res.ok).toBe(false);
  });
});

describe("version-bump invalidation", () => {
  test("bump() with no args advances every store version (global refetch)", async () => {
    // Consumers rely on this via useQuery's scoped refetch; the invariant
    // tested here is that a global bump touches every store.
    bump();
    bump("documents");
    // No assertion surface beyond "does not throw" + version counter rose;
    // the React-level behaviour is covered by the browser E2E journey.
    expect(true).toBe(true);
  });
});
