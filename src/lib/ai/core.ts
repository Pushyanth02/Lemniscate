import type { BotId } from "../types";
import { isMeridianError, ledgerModel, route } from "../meridian";
import { validateSessionKey } from "../providers";

export class AiUnavailable extends Error {}

export type Msg = { role: "system" | "user" | "assistant"; content: string };

/* ---------- routed execution ----------
   All routing, provider order, model chains, retries, cooldowns, pacing
   and the usage ledger now live in ./meridian (the single authoritative
   router). This module keeps only the companion layer: context assembly,
   prompts, schemas, sampling profiles, rendering and the grounded Anchor
   engines. See ./meridian's header for the responsibility boundaries.
 */
export function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/g, "")
    .trim();
  // Find the first { or [ — the start of the JSON payload.
  const starts = ["{", "["]
    .map((c) => cleaned.indexOf(c))
    .filter((i) => i !== -1);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start === -1) throw new Error("No JSON object found in response");

  // Use bracket-depth matching to find the MATCHING closing bracket, not
  // the last one in the string. This correctly handles trailing prose that
  // contains stray } or ] characters (e.g. `{"x":1} Hope this helps!}`)
  // which the previous lastIndexOf approach would incorrectly include.
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Unterminated JSON in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Task-appropriate sampling profiles (A3): one global temperature served
 * factual extraction and literary generation equally poorly. Pure + exported
 * for tests.
 */
export function samplingFor(kind: string): { temperature: number } {
  if (/repair$/.test(kind)) return { temperature: 0.2 }; // repairs want precision
  if (/^cinema|^section|^outline/.test(kind)) return { temperature: 0.85 };
  if (/^study/.test(kind)) return { temperature: 0.4 };
  if (/^analysis$/.test(kind)) return { temperature: 0.45 };
  if (/^refine/.test(kind)) return { temperature: 0.35 };
  return { temperature: 0.55 }; // chat & everything else
}

/* ---------- routed execution (Meridian) ----------
   Every online request in this module — structured JSON, study artifacts,
   story sections, cinematization — funnels through ONE call: meridian.route.
   Meridian owns the provider order, the chains, retries, cooldowns, pacing
   and the ledger; this wrapper maps its typed failures onto the two error
   shapes callers already understand:
     - AiUnavailable (hard: quota exhausted, saturated queue, user abort) —
       surfaced as a user-visible failure by the views.
     - plain Error (soft: auth / rate / network / timeout / empty / server) —
       callers silently fall back to the grounded Anchor engine.
 */
export function mapRouteError(e: unknown): Error {
  if (isMeridianError(e)) {
    if (e.kind === "quota" || e.kind === "saturated" || e.kind === "aborted") {
      return new AiUnavailable(e.message);
    }
    return new Error(e.message);
  }
  if (e instanceof Error) return e;
  return new Error("The AI request failed.");
}

/** Why the Anchor engine served, when it did — carried on every offline
 *  result so views can tell the user exactly what happened. */
export type OfflineReason =
  | "no-key"
  | "auth"
  | "rate"
  | "network"
  | "timeout"
  | "empty"
  | "server";

export function offlineReasonOf(e: unknown): OfflineReason {
  if (isMeridianError(e)) {
    switch (e.kind) {
      case "offline-plan":
      case "quota":
        return "no-key";
      case "auth":
        return "auth";
      case "rate":
        return "rate";
      case "network":
        return "network";
      case "timeout":
        return "timeout";
      case "empty":
        return "empty";
      default:
        return "server";
    }
  }
  return "server";
}

/** Short human label for an offline reason — appended to "Anchor engine"
 *  copy in the views ("Anchor engine · no key", "… · rate-limited"). */
export function offlineReasonText(reason?: OfflineReason): string {
  switch (reason) {
    case "no-key":
      return "no key";
    case "auth":
      return "key rejected";
    case "rate":
      return "rate-limited";
    case "network":
      return "network";
    case "timeout":
      return "timeout";
    case "empty":
      return "empty answer";
    case "server":
      return "provider error";
    default:
      return "offline";
  }
}

export async function aiRequest(
  bot: BotId,
  kind: string,
  messages: Msg[],
  docId: string | null,
  maxTokens?: number,
  onServed?: (model: string) => void,
): Promise<string> {
  const { temperature } = samplingFor(kind);
  try {
    const out = await route({
      bot,
      kind,
      messages,
      docId,
      maxTokens,
      temperature,
      onServed: (s) => onServed?.(ledgerModel(s.provider, s.model)),
    });
    return out.text;
  } catch (e) {
    throw mapRouteError(e);
  }
}

/**
 * Structured-output request with ONE self-repair round-trip (A2). The first
 * malformed response is fed back to the model together with the validation
 * error and a strict correction instruction — this rescues the common
 * failure modes (prose preamble, truncated tail, wrong field shape) that
 * previously sent every structured task straight to the offline engine.
 *
 * `validate` parses+validates a raw completion and throws on any problem;
 * it is invoked on the original reply and, if needed, on the repair. If the
 * repair also fails, its error propagates and callers fall back to Anchor
 * exactly as before.
 */
export async function requestValidatedJson(
  bot: BotId,
  kind: string,
  msgs: Msg[],
  validate: (raw: string) => unknown,
  docId: string | null,
  maxTokens?: number,
): Promise<{ data: unknown; model: string | undefined }> {
  // The serving model (which may be a fallback deep in the chain, not the
  // configured head) is captured so artifacts can attribute the model that
  // actually answered — matching the usage ledger.
  let served: string | undefined;
  const tap = (m: string): void => {
    served = m;
  };
  const raw = await aiRequest(bot, kind, msgs, docId, maxTokens, tap);
  try {
    return { data: validate(raw), model: served };
  } catch (firstErr) {
    if (firstErr instanceof AiUnavailable) throw firstErr;
    const issue =
      firstErr instanceof Error ? firstErr.message : "invalid JSON output";
    const repair: Msg[] = [
      ...msgs,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          `Your previous reply was not valid output (${issue}). ` +
          "Return ONLY the corrected JSON object in exactly the requested shape — no prose, no markdown fences, no trailing commentary.",
      },
    ];
    const fixed = await aiRequest(
      bot,
      `${kind}:repair`,
      repair,
      docId,
      maxTokens,
      tap,
    );
    return { data: validate(fixed), model: served };
  }
}


export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  // Probe the currently-active session key of the ACTIVE provider (set via
  // `setSessionKey(provider, key)`) — GET /key on OpenRouter, GET /models
  // elsewhere. The session key stays inside ./providers — it is never read
  // here.
  return validateSessionKey();
}
