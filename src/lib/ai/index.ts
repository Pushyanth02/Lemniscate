/**
 * Companion layer — Luma, Ouro, Ankaa.
 *
 * Architecture (one router, three companions, one offline engine):
 *   - ../meridian is the single authoritative universal router. Every online
 *     request from this module funnels through meridian.route /
 *     meridian.routeStream. Meridian owns provider order (companion pins,
 *     the active provider, cross-provider failover), model chains, retries,
 *     cooldowns, pacing (15/min + daily quota), the usage ledger and model
 *     health.
 *   - ../providers owns the wire: auth headers, SSE parsing, and typed
 *     ProviderError classification. No other module talks to a provider.
 *   - ../loa (the Anchor engine) owns deterministic offline execution. When
 *     Meridian cannot serve a request (no key, auth rejected, rate limit,
 *     network, outage) the companion falls back to Anchor and the result
 *     carries the reason, so the app is fully usable with no key at all.
 *
 * This module keeps only companion behavior: context assembly, prompts,
 * JSON schemas, sampling profiles, rendering and the offline content
 * generators. API keys live only in memory inside ../providers; model and
 * provider choices persist in prefs (../store); every artifact cache key
 * carries a route epoch so a configuration change never serves stale
 * attribution.
 */
export type { RawCatalogModel } from "../meridian";
export {
  // Meridian's public routing surface, re-exported so existing "../lib/ai"
  // importers keep working unchanged. Meridian (../meridian) is the single
  // authority for all of these; the aliases exist for compatibility only.
  activeModelFor,
  aiConfigured,
  autoAssignFreeModels,
  fetchModels,
  fetchModelsWithMeta,
  isRouterPreset,
  rankFreeModels,
  rateInfo,
  routeSummaryFor,
  ROUTER_PRESETS,
} from "../meridian";
export { dedupeSceneTitles } from "../scenes";
export { toRoman, motifIndex } from "../scenes";

/* ────────────────────────────────────────────────────────────
   Re-export the Anchor engine surface so views and other libs that
   import from "../lib/ai" keep working unchanged. The `offline: true`
   field name on returned objects is intentionally kept — only the
   user-facing copy has been renamed from "LOA engine" to "Anchor".
   ──────────────────────────────────────────────────────────── */
export {
  // Multi-provider client surface — direct browser → the active provider.
  hasKey,
  setSessionKey,
  clearSessionKey,
  getKeyMasked,
  validateKey,
} from "../providers";
export {
  // Anchor engine surface.
  STOP,
  sentences,
  wordList,
  freqMap,
  topKeywords,
  extractiveSummary,
  findCharacters,
  moodOf,
  moodKey,
  extractThemes,
  extractVocab,
  clozeQuiz,
  buildFlashcards,
  offlineScenes,
  offlineAnkaaLong,
  offlineAnalysis,
  buildStudy,
  extractAnchors,
  retrievePassages,
  docText,
  chapterText,
  wordCount,
  cap,
  truncateWords,
  type StoryAnchors,
} from "../loa";

/* Companion layer modules (pure moves from the former flat ai.ts):
   core = routed request plumbing + offline-reason taxonomy, consent = the
   architectural AI consent gate, then one module per companion. Siblings
   import each other directly (never through this barrel). */
export {
  AiUnavailable,
  extractJson,
  samplingFor,
  offlineReasonOf,
  offlineReasonText,
  testConnection,
  type OfflineReason,
} from "./core";
export { refinementAllowed, refineStructure } from "./consent";
export {
  LUMA_QUESTIONS,
  compactHistory,
  buildLumaContext,
  askLumaStream,
  type LumaContext,
  type LumaResult,
} from "./luma";
export {
  getOuroArtifact,
  TASK_TITLES,
  type OuroTask,
  type OuroArtifact,
} from "./ouro";
export {
  ANKAA_SECTIONS,
  ankaaSectionsFor,
  detectDepth,
  ankaaSteps,
  runAnkaaLong,
  type AnkaaDepth,
  type AnkaaResult,
} from "./ankaa";
export {
  CINEMA_STEPS,
  cinematizeChapter,
  regenerateScene,
  type CinematizeResult,
} from "./cinema";
export { runDeepAnalysis } from "./analysis";
