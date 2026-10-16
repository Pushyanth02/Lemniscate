/**
 * Background job runner.
 *
 * Long AI work (Ankaa drafts, deep analyses, scene cinematization) runs as a
 * queued job with:
 *   - bounded concurrency (2 simultaneous)
 *   - persisted progress rows (the `jobs` store) so the header tray and any
 *     view can observe via the normal data hooks
 *   - live word counts + ETA derived from elapsed time, smoothed via a
 *     rolling 3-sample window rather than a single point estimate
 *   - per-job AbortController so a running job can be cancelled by the user
 *     via `cancelJob(id)` — the controller's signal is passed to `spec.run`
 *   - priority queue: luma (chat) jobs jump the line so the companion feels
 *     instant even when Ankaa is mid-draft
 *   - crash recovery: rows stuck in running for > 5 min are marked failed on
 *     boot; recently-updated rows are left alone in case another tab still
 *     owns them (with a console warning for observability)
 *
 * The runner is the local-first analogue of a server job queue + Redis
 * pub/sub: persistence in IndexedDB, notification through the version bus.
 */
import type { AnalysisJob, BotId } from "./types";
import { idbAll, idbGet, idbPut, idbDelete, getUserId } from "./db";
import { uid } from "./utils";
import { bump } from "./data";

export interface JobReport {
  /** step index within spec.steps */
  step: number;
  /** 0..1 fraction of the current step */
  fraction: number;
  words?: number;
}

export interface JobSpec<R> {
  label: string;
  bot?: BotId;
  kind?: string;
  documentId?: string | null;
  steps: string[];
  /**
   * The work to run. The runner passes a `report` callback to stream
   * progress, and an `AbortSignal` the work can consult to bail out
   * mid-flight if the user cancels the job via `cancelJob`.
   *
   * Backward compatible: callers written before the signal was added still
   * pass `(report) => Promise<R>` and simply ignore the second argument —
   * TypeScript treats a function with fewer params as assignable to one
   * that accepts more, so no caller has to change.
   */
  run: (report: (r: JobReport) => void, signal?: AbortSignal) => Promise<R>;
  onDone?: (result: R, row: AnalysisJob) => void | Promise<void>;
  onError?: (err: Error, row: AnalysisJob) => void | Promise<void>;
  /** transient-failure retries (backoff). Quota/auth errors are never retried. */
  retries?: number;
  /**
   * Queue priority — higher numbers run sooner. Default 0.
   * Luma (chat) jobs are auto-bumped ahead of long Ankaa work so the
   * companion never stalls behind a draft.
   */
  priority?: number;
}

/** Errors that will never succeed on retry — fail fast instead of burning time. */
function isFatal(e: unknown): boolean {
  return (
    e instanceof Error && /quota|api key|rejected|unavailable/i.test(e.message)
  );
}

async function withRetry<R>(
  fn: () => Promise<R>,
  retries: number,
  onAttempt: (n: number) => void,
  signal?: AbortSignal,
): Promise<R> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Bail before each attempt if cancelled — never resurrect a cancelled job.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Cancellation is not retryable — surface it immediately so the
      // outer catch can label the row "Cancelled by user.".
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (isFatal(e) || attempt === retries) throw e;
      onAttempt(attempt + 1);
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  throw last;
}

interface QueueEntry {
  /** higher = sooner */
  priority: number;
  /** monotonic insertion order — breaks priority ties stably (FIFO). */
  seq: number;
  fn: () => Promise<void>;
}

const queue: QueueEntry[] = [];
let active = 0;
const MAX_ACTIVE = 2;
let recovered = false;
let seqCounter = 0;

/** Luma jobs (chat) get bumped ahead of long Ankaa work so the companion feels instant. */
const LUMA_PRIORITY_BUMP = 10;
/** Threshold for "this job is probably still running in another tab". */
const RECENT_MS = 5 * 60 * 1000;
/** Rolling-average window for the smoothed ETA. */
const ETA_WINDOW = 3;
/** Terminal jobs older than this are auto-deleted to keep the job tray clean.
 *  30 minutes — long enough to see "just finished" status, short enough that
 *  the tray doesn't fill with ancient history. */
const REAP_AFTER_MS = 30 * 60 * 1000;

/** Per-job AbortControllers — `cancelJob(id)` aborts the matching controller. */
const controllers = new Map<string, AbortController>();

/* ────────────────────────────────────────────────────────────
   Job epoch — mass invalidation for destructive data operations.
   Each job captures the epoch at enqueue time. `cancelAllJobs()`
   (used by clear-profile / erase-device) advances the epoch: a job
   whose signal was aborted as part of that mass cancel learns at
   settlement time that its epoch is stale, and drops EVERYTHING —
   terminal row persistence and onDone/onError callbacks — so a
   `run` that ignores the abort signal can never write results back
   over a completed wipe. A single user `cancelJob` does NOT advance
   the epoch (the cancelled row still gets its honest "Cancelled by
   user." state).
   ──────────────────────────────────────────────────────────── */
let jobEpoch = 0;
function currentJobEpoch(): number {
  return jobEpoch;
}

function effectivePriority<R>(spec: JobSpec<R>): number {
  const base = spec.priority ?? 0;
  return spec.bot === "luma" ? Math.max(base, LUMA_PRIORITY_BUMP) : base;
}

/** Stable priority insertion: highest priority first, FIFO within a tier. */
function enqueueEntry<R>(spec: JobSpec<R>, fn: () => Promise<void>): void {
  const entry: QueueEntry = {
    priority: effectivePriority(spec),
    seq: seqCounter++,
    fn,
  };
  let i = queue.length;
  while (
    i > 0 &&
    (queue[i - 1]?.priority ?? Number.NEGATIVE_INFINITY) < entry.priority
  )
    i--;
  queue.splice(i, 0, entry);
}

function pump(): void {
  while (active < MAX_ACTIVE && queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    active++;
    void next.fn().finally(() => {
      active--;
      pump();
    });
  }
}

/** Call once at boot; idempotent.
 *
 *  Identity-scoped: only THIS profile's jobs are examined — another local
 *  profile's running job is none of this tab's business.
 *
 *  Recovery rules:
 *  • With BroadcastChannel (all modern browsers), every non-terminal job
 *    (queued OR running, any age) is probed across tabs; a job no tab
 *    claims within the window is marked interrupted. Queued jobs owned by
 *    a live tab's queue are claimed via `knownJobIds`, so a busy tab's
 *    waiting work is never falsely failed by a booting tab.
 *  • Without BroadcastChannel, fall back to the age heuristic: only
 *    non-terminal jobs untouched for > RECENT_MS are failed. */
export async function recoverStaleJobs(): Promise<void> {
  if (recovered) return;
  recovered = true;
  try {
    const mine = getUserId();
    const rows = (await idbAll<AnalysisJob>("jobs")).filter(
      (j) => j.userId === mine,
    );
    const live: AnalysisJob[] = [];
    for (const j of rows) {
      if (j.status === "running" || j.status === "queued") live.push(j);
    }
    if (!live.length) return;
    let changed = 0;
    if (JOB_CHANNEL) {
      changed = await probeAndRecover(live);
    } else {
      const now = Date.now();
      for (const j of live) {
        if (now - j.updatedAt > RECENT_MS) {
          await idbPut("jobs", {
            ...j,
            status: "failed",
            error: "Interrupted — the app reloaded mid-job.",
            updatedAt: Date.now(),
          });
          changed++;
        }
      }
    }
    if (changed > 0) bump("jobs");
  } catch {
    /* nothing to recover */
  }
}

/* ────────────────────────────────────────────────────────────
   Cross-tab liveness probe for non-terminal jobs.
   
   When the app boots and finds queued/running jobs, we can't always tell
   whether they're owned by another live tab or were abandoned by a
   crashed tab. We use a BroadcastChannel to ask all tabs: "do you own
   job X?" A tab responds `alive` for any job it has ENQUEUED (queued in
   its in-memory queue) or is actively RUNNING. Jobs no tab claims within
   the probe window are presumed abandoned and marked interrupted.
   ──────────────────────────────────────────────────────────── */
const JOB_CHANNEL =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("lemniscate-jobs")
    : null;

/** Job IDs this tab owns: enqueued (queued in our in-memory queue) or
 *  running. Populated by enqueueJob; cleared when the job settles. This is
 *  the fix for the cross-tab false-failure bug: a QUEUED job in a busy tab
 *  was invisible to the old `activeJobIds` (populated only once execution
 *  started), so a booting tab's probe got no response and killed it. */
const knownJobIds = new Set<string>();

// Listen for liveness probes from other tabs.
if (JOB_CHANNEL) {
  JOB_CHANNEL.onmessage = (e: MessageEvent) => {
    const msg = e.data as { type: string; jobId?: string };
    if (msg?.type === "probe" && msg.jobId && knownJobIds.has(msg.jobId)) {
      JOB_CHANNEL.postMessage({ type: "alive", jobId: msg.jobId });
    }
  };
}

/** Probe all tabs for ownership of non-terminal jobs. Any job that gets no
 *  "alive" response within the window is presumed abandoned and marked
 *  interrupted. Returns how many rows were changed. */
async function probeAndRecover(live: AnalysisJob[]): Promise<number> {
  const probeIds = live.map((j) => j.id);
  const aliveIds = new Set<string>();

  // Send a probe for each job and collect "alive" responses.
  const probePromise = new Promise<void>((resolve) => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; jobId?: string };
      if (msg?.type === "alive" && msg.jobId) aliveIds.add(msg.jobId);
    };
    JOB_CHANNEL!.addEventListener("message", handler);
    for (const id of probeIds)
      JOB_CHANNEL!.postMessage({ type: "probe", jobId: id });
    // Wait a short window for responses. 800ms is long enough for an
    // idle tab to respond to a BroadcastChannel message, short enough to
    // not noticeably delay boot.
    setTimeout(() => {
      JOB_CHANNEL!.removeEventListener("message", handler);
      resolve();
    }, 800);
  });

  await probePromise;

  let changed = 0;
  for (const j of live) {
    if (!aliveIds.has(j.id)) {
      // No tab claimed this job — it was abandoned by a crashed/closed tab.
      await idbPut("jobs", {
        ...j,
        status: "failed",
        error: "Interrupted — the app reloaded mid-job.",
        updatedAt: Date.now(),
      });
      changed++;
    }
  }
  return changed;
}

/* ────────────────────────────────────────────────────────────
   Terminal job reaping — keeps the job tray clean.
   
   Jobs that reached a terminal state (done/failed) more than
   REAP_AFTER_MS ago are deleted from IndexedDB. This prevents the
   job tray from filling with ancient history and confusing users
   who see "processing" badges on jobs that finished long ago.
   Runs on boot and every 5 minutes while the app is open.
   ──────────────────────────────────────────────────────────── */
let reaperStarted = false;

export async function reapTerminalJobs(): Promise<void> {
  try {
    const rows = await idbAll<AnalysisJob>("jobs");
    const now = Date.now();
    const doomed: string[] = [];
    for (const j of rows) {
      if (j.status === "done" || j.status === "failed") {
        if (now - j.updatedAt > REAP_AFTER_MS) doomed.push(j.id);
      }
    }
    if (doomed.length > 0) {
      for (const id of doomed) await idbDelete("jobs", id);
      bump("jobs");
    }
  } catch {
    /* reaping is best-effort */
  }
}

/** Start a periodic reaper that cleans up terminal jobs. Called once
 *  on boot; idempotent. */
export function startJobReaper(): void {
  if (reaperStarted) return;
  reaperStarted = true;
  // Initial reap shortly after boot (gives the app time to settle).
  setTimeout(() => void reapTerminalJobs(), 10_000);
  // Then every 5 minutes.
  setInterval(() => void reapTerminalJobs(), 5 * 60 * 1000);
}

export function enqueueJob<R>(spec: JobSpec<R>): {
  id: string;
  row: AnalysisJob;
} {
  const row: AnalysisJob = {
    id: uid("job"),
    documentId: spec.documentId ?? "",
    userId: getUserId(),
    status: "queued",
    step: "Queued",
    progress: 0,
    etaSec: null,
    results: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    label: spec.label,
    bot: spec.bot,
    words: 0,
  };
  const controller = new AbortController();
  const signal = controller.signal;
  controllers.set(row.id, controller);
  const epoch = currentJobEpoch();
  // Own this job from the moment it is enqueued — cross-tab liveness probes
  // must see queued jobs too, not just running ones.
  knownJobIds.add(row.id);

  void idbPut("jobs", row)
    .then(() => bump("jobs"))
    .catch(() => undefined);

  const start = async (): Promise<void> => {
    // If cancelled while queued, the IndexedDB row was already flipped to
    // "failed" by cancelJob — bail before touching state so we don't revive it.
    if (signal.aborted) {
      controllers.delete(row.id);
      knownJobIds.delete(row.id);
      return;
    }
    const startedAt = performance.now();
    let lastPersist = 0;
    let lastSampleAt = 0;
    const samples: { elapsed: number; progress: number }[] = [];
    const state: AnalysisJob = { ...row, status: "running" };
    await idbPut("jobs", state);
    bump("jobs");

    // Heartbeat: a slow model chain can run minutes between report() ticks,
    // which another tab's recoverStaleJobs() would misread as a dead job
    // (and fail + possibly re-run it, double-spending the user's key). A
    // once-a-minute row touch keeps the row observably alive.
    const heartbeat = setInterval(() => {
      if (signal.aborted) return;
      void idbPut("jobs", { ...state, updatedAt: Date.now() }).catch(
        () => undefined,
      );
    }, 60_000);

    const report = (r: JobReport): void => {
      const stepIdx = Math.min(r.step, spec.steps.length - 1);
      const progress = Math.min(
        99,
        Math.round(
          ((stepIdx + Math.min(1, r.fraction)) / spec.steps.length) * 100,
        ),
      );
      const elapsed = (performance.now() - startedAt) / 1000;

      // Smoothed ETA: rolling window of (elapsed, progress) samples.
      // Sampling is throttled to ~2 Hz so the window spans meaningful time,
      // not three adjacent micro-ticks that all fire within the same token.
      const now = performance.now();
      if (now - lastSampleAt > 480) {
        lastSampleAt = now;
        samples.push({ elapsed, progress });
        while (samples.length > ETA_WINDOW) samples.shift();
      }
      let etaSec: number | null = null;
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (first && last) {
          const dProgress = last.progress - first.progress;
          const dElapsed = last.elapsed - first.elapsed;
          if (dElapsed > 0 && dProgress > 0) {
            const rate = dProgress / dElapsed; // progress points / second
            etaSec = Math.max(1, Math.round((100 - progress) / rate));
          }
        }
      }
      // Early single-point fallback so the ETA shows before the window fills.
      if (etaSec === null && progress > 4) {
        etaSec = Math.max(
          1,
          Math.round((elapsed / (progress / 100)) * (1 - progress / 100)),
        );
      }

      state.step = spec.steps[stepIdx] ?? state.step;
      state.progress = progress;
      state.etaSec = etaSec;
      state.words = r.words ?? state.words;
      if (state.words && state.words > 0 && elapsed > 0.5) {
        state.wordsPerMinute = Math.round((state.words / elapsed) * 60);
      }
      state.updatedAt = Date.now();
      // throttle persistence to ~3Hz; final state always persists
      if (now - lastPersist > 320) {
        lastPersist = now;
        void idbPut("jobs", { ...state })
          .then(() => bump("jobs"))
          .catch(() => undefined);
      }
    };

    let terminal: "done" | "failed" = "failed";
    let result: R | undefined;
    let haveResult = false;
    try {
      result = await withRetry(
        () => spec.run(report, signal),
        spec.retries ?? 1,
        (n) => {
          state.step = `Retrying (attempt ${n + 1})…`;
          state.updatedAt = Date.now();
          void idbPut("jobs", { ...state })
            .then(() => bump("jobs"))
            .catch(() => undefined);
        },
        signal,
      );
      state.status = "done";
      state.progress = 100;
      state.step = "Complete";
      state.etaSec = null;
      state.updatedAt = Date.now();
      terminal = "done";
      haveResult = true;
    } catch (e) {
      const cancelled =
        signal.aborted || (e instanceof Error && /abort/i.test(e.message));
      let failure = "Job failed.";
      if (e instanceof Error && e.message) failure = e.message;
      state.status = "failed";
      state.error = cancelled ? "Cancelled by user." : failure;
      state.updatedAt = Date.now();
    } finally {
      clearInterval(heartbeat);
      controllers.delete(row.id);
      knownJobIds.delete(row.id); // release cross-tab ownership
    }

    // Mass-cancel dropout: this job was aborted by a destructive data
    // operation (clear/erase) whose epoch has since moved on. The data it
    // was working on is gone; persisting a terminal row or delivering
    // results would recreate deleted records. Drop out silently.
    if (signal.aborted && epoch !== currentJobEpoch()) return;

    // Terminal persistence + result delivery live OUTSIDE the run's
    // try/catch: a quota error at the moment of completion must not
    // reclassify a finished (paid-for) run as "failed" or discard its
    // result. The row's own write failure is non-fatal; the outcome stands.
    try {
      await idbPut("jobs", { ...state });
      bump("jobs");
    } catch {
      /* the in-memory state is still correct for this session */
    }
    try {
      if (terminal === "done" && spec.onDone && haveResult)
        await spec.onDone(result as R, { ...state });
    } catch {
      /* delivery is best-effort once the row says done */
    }
    try {
      if (terminal === "failed" && spec.onError)
        await spec.onError(new Error(state.error ?? "Job failed."), {
          ...state,
        });
    } catch {
      /* failures are surfaced via the persisted row; the queue keeps pumping */
    }
  };

  enqueueEntry(spec, () => start().catch(() => undefined));
  pump();
  return { id: row.id, row };
}

/**
 * Cancel a queued or running job. Aborts the AbortController passed to
 * `spec.run` and marks the persisted row as "failed" with the message
 * "Cancelled by user.". Returns `true` if a controller was found and
 * signalled, `false` if the job already finished or never existed.
 *
 * If the underlying `spec.run` doesn't consult the signal, the row flip
 * below still reflects the cancel in the UI, but the run's own terminal
 * write wins the race — a well-behaved run MUST observe its signal to
 * guarantee no result lands. (Only the mass-cancel epoch, not a single
 * user cancel, can hard-invalidate a run that ignores its signal.)
 */
export function cancelJob(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  controllers.delete(id);
  // Best-effort row flip — works whether the job was still queued or
  // mid-flight. If the row is already terminal, leave it untouched.
  void (async () => {
    try {
      const j = await idbGet<AnalysisJob>("jobs", id);
      if (j && (j.status === "running" || j.status === "queued")) {
        await idbPut("jobs", {
          ...j,
          status: "failed",
          error: "Cancelled by user.",
          updatedAt: Date.now(),
        });
        bump("jobs");
      }
    } catch {
      /* nothing to do */
    }
  })();
  return true;
}

/** Cancel EVERY job this tab owns — queued and running. Used by the
 *  destructive data operations (clear profile / erase device) so active
 *  work can never write results back over a fresh wipe, and by tests.
 *  Returns the number of jobs signalled. */
export function cancelAllJobs(): number {
  const ids = [...controllers.keys()];
  for (const id of ids) {
    controllers.get(id)?.abort();
    controllers.delete(id);
  }
  // Advance the mass-invalidation epoch: every job aborted above learns at
  // settlement that it must not persist or deliver anything.
  jobEpoch++;
  // Drop everything still waiting in the in-memory queue; their start()
  // functions would bail immediately anyway (signal.aborted), but skipping
  // them outright keeps pump() responsive for post-erase work.
  queue.length = 0;
  return ids.length;
}

/** Whether this tab currently owns the given job (queued in its in-memory
 *  queue or actively running) — i.e. whether it would answer "alive" to
 *  another tab's liveness probe. Exposed for observability and tests. */
export function jobOwnedByThisTab(id: string): boolean {
  return knownJobIds.has(id);
}

/** Reset module state for tests: recovery flag, queue, controllers,
 *  ownership set, and the epoch. Never call from application code. */
export function __resetJobRunnerForTests(): void {
  recovered = false;
  queue.length = 0;
  controllers.clear();
  knownJobIds.clear();
  jobEpoch = 0;
}
