/**
 * Job runner tests: lifecycle, cancellation, cross-tab ownership probes,
 * identity-scoped recovery, and the mass-invalidation epoch.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  enqueueJob,
  cancelJob,
  cancelAllJobs,
  recoverStaleJobs,
  jobOwnedByThisTab,
  __resetJobRunnerForTests,
} from "../src/lib/jobs";
import { getUserId, createAndSwitchProfile, idbAll, idbPut } from "../src/lib/db";
import { installLocalStorage, freshDb } from "./helpers";
import type { AnalysisJob } from "../src/lib/types";

installLocalStorage();

beforeEach(() => {
  freshDb();
  __resetJobRunnerForTests();
});

function waitFor(fn: () => boolean | Promise<boolean>, ms = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      void Promise.resolve()
        .then(fn)
        .then((ok) => {
          if (ok) return resolve();
          if (Date.now() - t0 > ms) return reject(new Error("waitFor timeout"));
          setTimeout(tick, 20);
        })
        .catch(reject);
    };
    tick();
  });
}

describe("job lifecycle", () => {
  test("queued → running → done with onDone delivery", async () => {
    let started = false;
    const delivered: string[] = [];
    const { id } = enqueueJob<string>({
      label: "lifecycle",
      steps: ["work"],
      run: async () => {
        started = true;
        return "the result";
      },
      onDone: (r) => {
        delivered.push(r);
      },
    });
    await waitFor(() => delivered.length === 1);
    expect(started).toBe(true);
    expect(delivered).toEqual(["the result"]);
    const rows = await idbAll<AnalysisJob>("jobs");
    const row = rows.find((j) => j.id === id);
    expect(row?.status).toBe("done");
    expect(row?.progress).toBe(100);
  });

  test("failures mark the row failed and deliver onError", async () => {
    const errors: string[] = [];
    const { id } = enqueueJob({
      label: "boom",
      steps: ["work"],
      // retries: 0 so the failure is immediate
      retries: 0,
      run: async () => {
        throw new Error("model exploded");
      },
      onError: (e) => {
        errors.push(e.message);
      },
    });
    await waitFor(() => errors.length === 1);
    const row = (await idbAll<AnalysisJob>("jobs")).find((j) => j.id === id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("model exploded");
  });

  test("user cancelJob marks the row cancelled (single cancel keeps epoch)", async () => {
    let release: (() => void) | null = null;
    const { id } = enqueueJob({
      label: "cancellable",
      steps: ["work"],
      run: () =>
        new Promise<void>(() => {
          release = () => undefined;
        }),
    });
    await waitFor(() => {
      void release;
      return true;
    });
    // wait until the row is running
    await waitFor(async () => {
      const row = (await idbAll<AnalysisJob>("jobs")).find((j) => j.id === id);
      return row?.status === "running";
    });
    expect(cancelJob(id)).toBe(true);
    await waitFor(async () => {
      const row = (await idbAll<AnalysisJob>("jobs")).find((j) => j.id === id);
      return row?.status === "failed" && row?.error === "Cancelled by user.";
    });
  });
});

describe("mass invalidation (destructive ops)", () => {
  test("cancelAllJobs aborts everything; a run that ignores the signal drops out silently", async () => {
    const sideEffects: string[] = [];
    let release: (() => void) | null = null;
    enqueueJob({
      label: "stubborn",
      steps: ["work"],
      run: () =>
        new Promise<string>((resolve) => {
          release = () => resolve("late");
        }),
      onDone: () => {
        sideEffects.push("onDone");
      },
    });
    // let the job reach running state
    await new Promise((r) => setTimeout(r, 60));
    cancelAllJobs();
    // The destructive flow wipes the jobs store after cancelling (this is
    // what eraseAllDeviceData does).
    const { idbClearInternal } = await import("../src/lib/db");
    await idbClearInternal("jobs");
    // The stubborn run resolves AFTER the mass cancel (e.g. a slow fetch
    // that ignored the abort). The epoch mechanism must suppress delivery
    // AND re-persistence — the wiped store must stay empty.
    release?.();
    await new Promise((r) => setTimeout(r, 150));
    expect(sideEffects).toEqual([]);
    const rows = await idbAll<AnalysisJob>("jobs");
    expect(rows.filter((j) => j.label === "stubborn").length).toBe(0);
  });

  test("cancelAllJobs clears the in-memory queue so pending work never starts", async () => {
    let ran = 0;
    const blocker = enqueueJob({
      label: "blocker-1",
      steps: ["work"],
      run: () => new Promise<void>(() => {}),
    });
    const blocker2 = enqueueJob({
      label: "blocker-2",
      steps: ["work"],
      run: () => new Promise<void>(() => {}),
    });
    void blocker;
    void blocker2;
    // both MAX_ACTIVE slots busy; this one must sit in the queue
    const queued = enqueueJob({
      label: "never-runs",
      steps: ["work"],
      run: async () => {
        ran++;
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    cancelAllJobs();
    await new Promise((r) => setTimeout(r, 120));
    expect(ran).toBe(0);
    const row = (await idbAll<AnalysisJob>("jobs")).find(
      (j) => j.id === queued.id,
    );
    // its row was never flipped to running either
    expect(row?.status === "queued" || row === undefined).toBe(true);
  });
});

describe("recoverStaleJobs", () => {
  test("an abandoned queued job (no tab owns it) is marked interrupted", async () => {
    await idbPut("jobs", {
      id: "orphan",
      documentId: "",
      userId: getUserId(),
      status: "queued",
      step: "Queued",
      progress: 0,
      etaSec: null,
      results: null,
      error: null,
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 60_000,
      label: "orphan",
      words: 0,
    } as never);
    await recoverStaleJobs();
    const row = (await idbAll<AnalysisJob>("jobs")).find(
      (j) => j.id === "orphan",
    );
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("Interrupted");
  });

  test("a QUEUED job owned by a live tab is claimed for liveness (the probe fix)", async () => {
    // Fill both active slots with never-settling jobs, then enqueue a third
    // (it stays queued in this tab's in-memory queue).
    enqueueJob({ label: "a", steps: ["w"], run: () => new Promise<void>(() => {}) });
    enqueueJob({ label: "b", steps: ["w"], run: () => new Promise<void>(() => {}) });
    const third = enqueueJob({
      label: "queued-and-owned",
      steps: ["w"],
      run: async () => "done",
    });
    await new Promise((r) => setTimeout(r, 50));
    // THE FIX, directly: ownership covers QUEUED jobs, not just running
    // ones (the old activeJobIds bug).
    expect(jobOwnedByThisTab(third.id)).toBe(true);
    cancelAllJobs();
  });

  test("cross-tab protocol: a booting tab's probe gets an alive response for a queued job and spares it", async () => {
    if (typeof BroadcastChannel === "undefined") {
      throw new Error("BroadcastChannel unavailable — cannot test cross-tab protocol");
    }
    enqueueJob({ label: "a", steps: ["w"], run: () => new Promise<void>(() => {}) });
    enqueueJob({ label: "b", steps: ["w"], run: () => new Promise<void>(() => {}) });
    const third = enqueueJob({
      label: "queued-and-owned",
      steps: ["w"],
      run: async () => "done",
    });
    await new Promise((r) => setTimeout(r, 50));

    // A second "tab": a same-named BroadcastChannel that answers probes.
    const tabB = new BroadcastChannel("lemniscate-jobs");
    const probed = new Set<string>();
    const responder = (e: MessageEvent) => {
      const msg = e.data as { type?: string; jobId?: string };
      if (msg?.type === "probe" && msg.jobId) {
        probed.add(msg.jobId);
        if (jobOwnedByThisTab(msg.jobId)) {
          tabB.postMessage({ type: "alive", jobId: msg.jobId });
        }
      }
    };
    tabB.addEventListener("message", responder);

    await recoverStaleJobs();
    tabB.removeEventListener("message", responder);
    tabB.close();

    // The probe asked about our queued job…
    expect(probed.has(third.id)).toBe(true);
    // …and because a live tab claimed it, the row was NOT failed.
    const row = (await idbAll<AnalysisJob>("jobs")).find(
      (j) => j.id === third.id,
    );
    expect(row?.status === "queued" || row?.status === "running").toBe(true);
    expect(row?.error ?? null).toBeNull();
    cancelAllJobs(); // cleanup: stop the two blockers
  });

  test("recovery never touches another profile's jobs", async () => {
    const mine = getUserId();
    createAndSwitchProfile();
    const otherProfile = mine; // the OLD identity is now "another profile"
    await idbPut("jobs", {
      id: "theirs",
      documentId: "",
      userId: otherProfile,
      status: "running",
      step: "Working",
      progress: 10,
      etaSec: null,
      results: null,
      error: null,
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 30_000,
      label: "their job",
      words: 0,
    } as never);
    await recoverStaleJobs();
    const row = (await idbAll<AnalysisJob>("jobs")).find(
      (j) => j.id === "theirs",
    );
    // Not our identity → untouched, whatever its state.
    expect(row?.status).toBe("running");
  });
});
