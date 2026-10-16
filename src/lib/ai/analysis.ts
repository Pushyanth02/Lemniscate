import { z } from "zod";
import type { DeepAnalysis, DocWithContent } from "../types";
import { logUsage, patchDocument } from "../data";
import {
  aiConfiguredFor,
  routeEpoch,
} from "../meridian";
import { cacheSwrGet, cacheSet, cachePeek, analysisKey, DAY } from "../cache";
import { docText } from "../loa/doc-utils";
import { offlineAnalysis } from "../loa/analysis";
import { SWR_GRACE_MS } from "./ouro";
import {
  AiUnavailable,
  extractJson,
  offlineReasonOf,
  requestValidatedJson,
  type Msg,
  type OfflineReason,
} from "./core";

/* ================= Deep analysis ================= */

const ANALYSIS_STEPS = [
  { label: "Denoising & refining", pct: 18 },
  { label: "Summarizing", pct: 42 },
  { label: "Extracting themes", pct: 62 },
  { label: "Mapping characters", pct: 82 },
  { label: "Writing criticism", pct: 100 },
];

export async function runDeepAnalysis(
  doc: DocWithContent,
  onStep: (label: string, pct: number) => void,
  opts?: { revalidate?: boolean },
): Promise<{ data: DeepAnalysis; offline: boolean; reason?: OfflineReason }> {
  // Background revalidation (SWR): quiet — the progress rail is owned by
  // whichever call is actually on screen. Revalidation SKIPS the cache
  // read: reading the stale row back would return it instead of
  // regenerating and spawn another revalidation from the stale branch —
  // a self-sustaining chain that never regenerates (audit 2-b).
  if (opts?.revalidate) onStep = () => {};
  const key = `${analysisKey(doc.id, doc.updatedAt)}:${routeEpoch("ouro")}`;
  const hit = opts?.revalidate
    ? null
    : await cacheSwrGet<{ data: DeepAnalysis; offline: boolean }>(
        key,
        SWR_GRACE_MS,
      );
  if (hit) {
    if (hit.stale)
      void runDeepAnalysis(doc, () => {}, { revalidate: true }).catch(
        () => {},
      );
    onStep("Recalled from cache", 100);
    return hit.value;
  }
  /* Downgrade guard (audit 2-b #2): a transient provider failure during
     background revalidation must not overwrite an existing ONLINE
     analysis with the offline fallback. */
  let keepOnlineRow = false;
  if (opts?.revalidate) {
    const prior = await cachePeek<{ data: DeepAnalysis; offline: boolean }>(
      key,
    );
    keepOnlineRow = !!prior && prior.offline === false;
  }
  const t0 = performance.now();
  for (const s of ANALYSIS_STEPS.slice(0, 2)) {
    onStep(s.label, s.pct);
    await new Promise((r) => setTimeout(r, 420));
  }
  let data: DeepAnalysis | null = null;
  let offline = true;
  let reason: OfflineReason = "no-key";
  if (aiConfiguredFor("ouro")) {
    try {
      const step2 = ANALYSIS_STEPS[2];
      if (step2) onStep(step2.label, step2.pct);
      const text = docText(doc).slice(0, 10000);
      const analysisMsgs: Msg[] = [
        {
          role: "system",
          content: `You are a literary analyst in Lemniscate. Respond ONLY with JSON: {"summary": string, "themes": [{name,note}], "characters": [{name,note}], "criticism": string}. Criticism should be 150-250 words of substantive close reading.`,
        },
        { role: "user", content: `Analyze:\n<<<${text}>>>` },
      ];
      const analysisRes = await requestValidatedJson(
        "ouro",
        "analysis",
        analysisMsgs,
        (r) =>
          z
            .object({
              summary: z.string(),
              themes: z.array(
                z.object({ name: z.string(), note: z.string() }),
              ),
              characters: z.array(
                z.object({ name: z.string(), note: z.string() }),
              ),
              criticism: z.string(),
            })
            .parse(extractJson(r)),
        doc.id,
        1600,
      );
      // The validate callback already ran the schema — one parse, and the
      // duplicated inline schema block above it is gone.
      data = analysisRes.data as DeepAnalysis;
      offline = false;
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      data = null;
      reason = offlineReasonOf(e);
    }
  }
  if (!data) {
    for (const s of ANALYSIS_STEPS.slice(2)) {
      onStep(s.label, s.pct);
      await new Promise((r) => setTimeout(r, 430));
    }
    data = offlineAnalysis(doc);
    void logUsage(
      "ouro",
      "analysis",
      Math.round(data.summary.length / 4) + 400,
      Math.round(performance.now() - t0),
      "offline",
      doc.id,
    );
  } else {
    const step4 = ANALYSIS_STEPS[4];
    if (step4) onStep(step4.label, 100);
  }
  if (!doc.summary) void patchDocument(doc.id, { summary: data.summary });
  const result = { data, offline, reason };
  if (!(offline && keepOnlineRow)) {
    await cacheSet(key, result, 7 * DAY);
  }
  return result;
}

