/**
 * Meridian catalog & routing hardening tests.
 *
 * Locks in three invariants that keep the free tier honest and requests
 * bounded:
 *
 * 1. CATALOG VALIDITY — every default and every fallback is a `:free` id
 *    AND exists in the live OpenRouter `:free` catalog as fetched on
 *    2026-10-14. A default that 404s (or silently bills) is the single
 *    worst failure a BYOK free-tier app can ship.
 * 2. DEADLINE PROFILES — every operation class maps to exactly the
 *    connect/idle/max window designed for it (the stagnant-request fix:
 *    generous only where slow output is real work).
 * 3. ROUTE BUDGETS — the whole multi-provider walk terminates in
 *    bounded time per class.
 * Plus ranking sanity on the live catalog: the creative writer should
 * surface for Ankaa, the fast generalist for Luma, and code-only models
 * should sink.
 */
import { describe, expect, test } from "bun:test";
import type { AiModelInfo } from "../src/lib/types";
import {
  DEFAULT_MODELS,
  FALLBACKS,
  rankFreeModels,
  routeBudgetFor,
  streamProfileFor,
} from "../src/lib/meridian";

/* Snapshot of GET https://openrouter.ai/api/v1/models, filtered to `:free`,
 * taken 2026-10-14 (the day the registry was refreshed). Context lengths
 * are the catalog's own numbers. */
const LIVE_FREE_IDS = [
  "cohere/north-mini-code:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "liquid/lfm-2.5-2.6b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "nvidia/nemotron-3.5-lightning:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "thinkingmachines/inkling-small:free",
  "thinkingmachines/inkling:free",
] as const;

const LIVE_CONTEXT: Record<string, number> = {
  "cohere/north-mini-code:free": 256000,
  "dots-studio/dots-3-note-preview:free": 512000,
  "google/gemma-4-26b-a4b-it:free": 262144,
  "google/gemma-4-31b-it:free": 262144,
  "liquid/lfm-2.5-2.6b:free": 65536,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 256000,
  "nvidia/nemotron-3-super-120b-a12b:free": 262144,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 1000000,
  "nvidia/nemotron-3.5-content-safety:free": 128000,
  "nvidia/nemotron-3.5-lightning:free": 1000000,
  "poolside/laguna-s-2.1:free": 262144,
  "poolside/laguna-xs-2.1:free": 262144,
  "thinkingmachines/inkling-small:free": 1048576,
  "thinkingmachines/inkling:free": 1048576,
};

const liveModels: AiModelInfo[] = LIVE_FREE_IDS.map((id) => ({
  id,
  name: id,
  context: LIVE_CONTEXT[id] ?? 0,
  inPerM: 0,
  outPerM: 0,
  free: true,
  tier: "free",
}));

describe("catalog validity (free-tier invariants)", () => {
  test("every fallback is a :free variant", () => {
    for (const id of FALLBACKS) {
      expect(id.endsWith(":free")).toBe(true);
    }
  });

  test("every fallback exists in the live :free catalog", () => {
    for (const id of FALLBACKS) {
      expect(LIVE_FREE_IDS).toContain(id);
    }
  });

  test("every per-bot default exists in the live :free catalog", () => {
    for (const [bot, id] of Object.entries(DEFAULT_MODELS)) {
      expect(LIVE_FREE_IDS).toContain(id);
      expect(id.endsWith(":free")).toBe(true);
      expect(["luma", "ouro", "ankaa"]).toContain(bot);
    }
  });

  test("the three defaults differ by task profile", () => {
    // conversation speed / structured study / long-form creative — if any
    // two collapse onto the same model, the task-profile routing regressed.
    const ids = Object.values(DEFAULT_MODELS);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("deadline profiles (stagnation fix)", () => {
  test("conversation is tight: 20s connect / 45s idle / 3min max", () => {
    const p = streamProfileFor("chat");
    expect(p.connectMs).toBe(20_000);
    expect(p.idleMs).toBe(45_000);
    expect(p.maxMs).toBe(180_000);
  });

  test("creative generation is the widest: 30s / 150s idle / 15min max", () => {
    for (const kind of [
      "cinema:2:1",
      "section:1",
      "outline",
      "longform",
      "draft",
    ]) {
      const p = streamProfileFor(kind);
      expect(p.connectMs).toBe(30_000);
      expect(p.idleMs).toBe(150_000);
      expect(p.maxMs).toBe(900_000);
    }
  });

  test("structured study sits between: 25s / 75s / 8min", () => {
    for (const kind of ["study:quiz", "study:full", "analysis", "refine"]) {
      const p = streamProfileFor(kind);
      expect(p.connectMs).toBe(25_000);
      expect(p.idleMs).toBe(75_000);
      expect(p.maxMs).toBe(480_000);
    }
  });

  test("repairs are quick and precise: 25s / 60s / 4min", () => {
    const p = streamProfileFor("study:quiz:repair");
    expect(p.connectMs).toBe(25_000);
    expect(p.idleMs).toBe(60_000);
    expect(p.maxMs).toBe(240_000);
  });

  test("unknown kinds fall back to the chat profile", () => {
    const p = streamProfileFor("something-new");
    expect(p.connectMs).toBe(20_000);
    expect(p.idleMs).toBe(45_000);
    expect(p.maxMs).toBe(180_000);
  });

  test("the creative idle window outlasts the chat window 3.3x", () => {
    // the point of the fix: extra time ONLY where it buys quality
    const chat = streamProfileFor("chat");
    const cinema = streamProfileFor("cinema:0:0");
    expect((cinema.idleMs ?? 0) / (chat.idleMs ?? 1)).toBeGreaterThan(3);
  });
});

describe("route budgets (bounded walks)", () => {
  test("chat terminates within 2 minutes across every provider", () => {
    expect(routeBudgetFor("chat")).toBe(120_000);
  });
  test("study/analysis walks cap at 6 minutes", () => {
    expect(routeBudgetFor("study:full")).toBe(360_000);
    expect(routeBudgetFor("analysis")).toBe(360_000);
  });
  test("creative walks cap at 12 minutes", () => {
    expect(routeBudgetFor("cinema:0:0")).toBe(720_000);
    expect(routeBudgetFor("section:2")).toBe(720_000);
  });
  test("repair walks cap at 3 minutes", () => {
    expect(routeBudgetFor("study:quiz:repair")).toBe(180_000);
  });
});

describe("ranking on the live catalog", () => {
  test("ankaa surfaces the creative heavyweights first", () => {
    const ranked = rankFreeModels(liveModels, "ankaa");
    // the dedicated writing family leads, the 550B ultra second — both
    // must beat every fast/generalist model, and the canonical inkling
    // (not inkling-small) is the one that surfaces.
    expect(ranked[0]?.id).toBe("thinkingmachines/inkling:free");
    expect(ranked[1]?.id).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(ranked.slice(0, 3).map((m) => m.id)).not.toContain(
      "nvidia/nemotron-3.5-lightning:free",
    );
  });

  test("luma surfaces the fast generalists first", () => {
    const ranked = rankFreeModels(liveModels, "luma");
    // the two fast generalists (lightning, gemma-4-26b) own the top spots;
    // conversation never waits on a creative heavyweight.
    expect(ranked[0]?.id).toBe("nvidia/nemotron-3.5-lightning:free");
    expect(ranked[1]?.id).toBe("google/gemma-4-26b-a4b-it:free");
    expect(ranked.slice(0, 2).map((m) => m.id)).not.toContain(
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    );
  });

  test("code-only and moderation-only models sink to the bottom half", () => {
    const ranked = rankFreeModels(liveModels, "luma");
    const at = (id: string) => ranked.findIndex((m) => m.id === id);
    const half = ranked.length / 2;
    expect(at("cohere/north-mini-code:free")).toBeGreaterThan(half);
    expect(at("poolside/laguna-s-2.1:free")).toBeGreaterThan(half);
    expect(at("poolside/laguna-xs-2.1:free")).toBeGreaterThan(half);
  });
});
