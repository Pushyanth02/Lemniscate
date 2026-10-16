/**
 * Backup export + restore — the full local-first safety net.
 *
 * Export format (v3, produced by buildBackup):
 *   { app: "lemniscate", version: 3, scope: "full"|"library"|"prefs",
 *     exportedAt, profile: {id, createdAt, name},
 *     preferences?: {...},            // present unless scope === "library"
 *     data: { documents: [...], docContent: [...], bookmarks: [...], ... } }
 * Compact JSON (no pretty-print): backups of large libraries stay small
 * and serialize fast. Scopes scale the request from the whole room down
 * to settings alone:
 *   full     — every user-owned store + preferences (exact continuity)
 *   library  — documents, content, bookmarks, annotations, scenes,
 *              scene notes and stories (no history ledgers, no prefs)
 *   prefs    — preferences only (a tiny file; data is empty)
 * Legacy v1 exports (no `version`, chapter content inline on each document
 * row's `contentJson`) and v2 exports (split content, no preferences) are
 * still accepted: v1 content is split exactly like the DB v5 migration,
 * and a missing preferences section simply restores nothing pref-shaped.
 *
 * Safety model, in order:
 *   1. The ENTIRE input is validated (shape, size, record count, per-store
 *      row minimums, duplicate ids) BEFORE anything is written. A malformed
 *      backup never touches storage.
 *   2. Restore is profile-scoped: every row is re-stamped with the CURRENT
 *      local identity, so a backup restores into the profile you are using
 *      (the preview says so explicitly). It never merges into another
 *      profile.
 *   3. Conflict policy is explicit: "merge" keeps existing rows that share
 *      an id (the backup's copy is skipped); "replace" overwrites them.
 *      Rows that don't collide are always written.
 *   4. Each store commits in a single IndexedDB transaction (idbBulkPut),
 *      so a store is all-or-nothing. IndexedDB cannot make the whole
 *      multi-store restore atomic; restores are idempotent (stable ids),
 *      so retrying after a partial failure is safe. The result reports
 *      per-store counts honestly.
 *   5. Preferences ride along only when the backup carries them and the
 *      user leaves the "also restore preferences" choice on: they are
 *      sanitized through the same funnel as a storage read (sanitizePrefs)
 *      before being applied, so a backup can never inject an invalid or
 *      future-schema preference.
 */
import { z } from "zod";
import {
  idbBulkPut,
  idbAll,
  idbGet,
  getUserId,
  listProfiles,
  STORES,
  type StoreName,
} from "./db";
import { bump } from "./data";
import { getPrefs, sanitizePrefs } from "./store";
import type { Prefs } from "./types";
import { download, slugify } from "./utils";

export const BACKUP_VERSION = 3;

/** Hard limits: a backup larger than this is rejected before parsing work. */
export const BACKUP_MAX_BYTES = 150 * 1024 * 1024; // 150 MB
export const BACKUP_MAX_ROWS = 60_000;

/* ───────────────────────── export ───────────────────────── */

export type ExportScope = "full" | "library" | "prefs";

/** Content stores — the user's actual reading material and work. History
 *  ledgers (activity, usage) and the transient job queue are excluded from
 *  the library scope; the full scope carries them for exact continuity. */
export const LIBRARY_STORES: readonly StoreName[] = [
  "documents",
  "docContent",
  "bookmarks",
  "annotations",
  "scenes",
  "sceneNotes",
  "stories",
];

/** Every store a profile owns rows in (the shared aiCache is derived
 *  output, never exported). */
const USER_STORES: readonly StoreName[] = STORES.filter(
  (s) => s !== "aiCache",
) as StoreName[];

export interface BuiltBackup {
  /** The complete JSON file text (compact — no pretty-print). */
  text: string;
  scope: ExportScope;
  /** Records included (0 for a prefs-only backup). */
  rows: number;
  /** Exact payload size in bytes. */
  bytes: number;
  includesPreferences: boolean;
}

/** Serialize the current profile's data at the requested scope. Reads each
 *  store sequentially with a yield between them, so even large libraries
 *  never block the interface; the single JSON.stringify at the end is the
 *  only synchronous stretch. */
export async function buildBackup(scope: ExportScope): Promise<BuiltBackup> {
  const mine = getUserId();
  const stores: readonly StoreName[] =
    scope === "full"
      ? USER_STORES
      : scope === "library"
        ? LIBRARY_STORES
        : [];
  const out: Record<string, unknown[]> = {};
  let rows = 0;
  for (const s of stores) {
    // Only export rows owned by the current identity — never another
    // local profile's documents, bookmarks, annotations or history.
    const mineRows = (await idbAll(s)).filter(
      (r) =>
        (r as { userId?: string }).userId === undefined ||
        (r as { userId?: string }).userId === mine,
    );
    if (mineRows.length) {
      out[s] = mineRows;
      rows += mineRows.length;
    }
    // Yield to the event loop between stores: progress spinners keep
    // spinning and the page stays responsive on big libraries.
    await new Promise((r) => setTimeout(r, 0));
  }
  const includesPreferences = scope !== "library";
  const prefs = getPrefs();
  const identity = listProfiles().find((p) => p.id === mine);
  const payload: Record<string, unknown> = {
    app: "lemniscate",
    version: BACKUP_VERSION,
    scope,
    exportedAt: new Date().toISOString(),
    profile: {
      id: mine,
      createdAt: identity?.createdAt ?? Date.now(),
      name: prefs.profile.name,
    },
    data: out,
  };
  if (includesPreferences) payload.preferences = prefs;
  const text = JSON.stringify(payload);
  return {
    text,
    scope,
    rows,
    bytes: new Blob([text]).size,
    includesPreferences,
  };
}

/** Build + download one scoped backup in a single step. The filename
 *  carries the profile name, the scope and the date, e.g.
 *  lemniscate-ada-full-2026-10-16.json. */
export async function downloadBackup(
  scope: ExportScope,
): Promise<BuiltBackup & { filename: string }> {
  const b = await buildBackup(scope);
  const name = slugify(getPrefs().profile.name);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `lemniscate-${name ? `${name}-` : ""}${scope}-${date}.json`;
  download(filename, b.text);
  return { ...b, filename };
}

export interface RestorePreview {
  version: 1 | 2 | 3;
  exportedAt: string | null;
  backupProfileId: string | null;
  /** store → row count, only non-empty stores */
  stores: { store: StoreName; count: number }[];
  /** up to 12 document titles, for the human preview */
  sampleTitles: string[];
  totalRows: number;
  /** true when the backup carries a preferences section. */
  hasPreferences: boolean;
  /** the declared scope, when the backup states one (v3+). */
  scope: ExportScope | null;
  warnings: string[];
}

export type ParsedBackup =
  | { ok: true; rows: Map<StoreName, Record<string, unknown>[]>; preview: RestorePreview; preferences: Prefs | null }
  | { ok: false; error: string };

/* ---------------- validation ---------------- */

const chapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  startChunk: z.number(),
  chunks: z.array(
    z.object({ id: z.string(), kind: z.enum(["p", "h"]), text: z.string() }),
  ),
});

const documentSchema = z.object({
  id: z.string().min(1),
  userId: z.string(),
  title: z.string(),
  chapterCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const contentRowSchema = z.object({
  id: z.string().min(1),
  userId: z.string(),
  chapters: z.array(chapterSchema).min(1),
});

/** Stores where rows must carry a userId (everything except aiCache). */
const OWNED = new Set<StoreName>(STORES.filter((s) => s !== "aiCache") as StoreName[]);

const rowBase = z.object({ id: z.string().min(1) }).passthrough();

function isStoreName(v: unknown): v is StoreName {
  return typeof v === "string" && (STORES as readonly string[]).includes(v);
}

/** Validate + normalize a backup file's text. Never writes anything. */
export function parseBackup(text: string): ParsedBackup {
  if (typeof text !== "string" || text.length === 0)
    return { ok: false, error: "The backup file is empty." };
  if (text.length > BACKUP_MAX_BYTES)
    return {
      ok: false,
      error: `The backup is larger than the ${Math.round(BACKUP_MAX_BYTES / 1024 / 1024)} MB restore limit.`,
    };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "The backup is not a valid Lemniscate export." };
  const obj = raw as Record<string, unknown>;
  if (obj.app !== "lemniscate")
    return {
      ok: false,
      error: "This file was not exported by Lemniscate.",
    };
  /* Version contract: 1 (legacy, inline content), 2 (split content) and
     3 (scoped, optional preferences) are restorable. A FUTURE version (4+)
     is rejected loudly — silently parsing it as an older shape would
     restore a partial or corrupted library instead of telling the user
     their app is out of date. */
  if (
    obj.version !== undefined &&
    (typeof obj.version !== "number" || obj.version > BACKUP_VERSION)
  ) {
    return {
      ok: false,
      error:
        "This backup was written by a newer version of Lemniscate. Update the app before restoring.",
    };
  }
  const version = obj.version === 3 ? 3 : obj.version === 2 ? 2 : 1;
  const data = obj.data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { ok: false, error: "The backup has no data section." };

  const warnings: string[] = [];
  const rows = new Map<StoreName, Record<string, unknown>[]>();
  const seenIds = new Set<string>();
  let totalRows = 0;

  /* Preferences section (v3+): sanitize immediately through the same
     funnel as a storage read, so the preview and the eventual apply can
     never carry an invalid or future-schema preference. A malformed
     section is skipped with a warning rather than failing the file. */
  let preferences: Prefs | null = null;
  if (obj.preferences !== undefined) {
    if (
      obj.preferences &&
      typeof obj.preferences === "object" &&
      !Array.isArray(obj.preferences)
    ) {
      preferences = sanitizePrefs(obj.preferences);
    } else {
      warnings.push("Skipped a malformed preferences section.");
    }
  }

  for (const [store, value] of Object.entries(data as Record<string, unknown>)) {
    if (!isStoreName(store)) {
      warnings.push(`Skipped unknown section “${store}”.`);
      continue;
    }
    if (!Array.isArray(value))
      return { ok: false, error: `Backup section “${store}” is malformed.` };
    const out: Record<string, unknown>[] = [];
    for (const el of value) {
      const base = rowBase.safeParse(el);
      if (!base.success)
        return {
          ok: false,
          error: `A row in “${store}” has no valid id — the backup is malformed.`,
        };
      const row = base.data;
      if (seenIds.has(`${store}:${row.id}`))
        return {
          ok: false,
          error: `Duplicate id “${row.id}” in “${store}” — the backup is malformed.`,
        };
      seenIds.add(`${store}:${row.id}`);
      if (OWNED.has(store as StoreName) && typeof row.userId !== "string")
        return {
          ok: false,
          error: `A row in “${store}” is missing its owner field.`,
        };
      out.push(row);
    }
    totalRows += out.length;
    if (out.length) rows.set(store as StoreName, out);
  }
  if (totalRows === 0 && !preferences)
    return {
      ok: false,
      error: "The backup contains no records.",
    };
  if (totalRows > BACKUP_MAX_ROWS)
    return {
      ok: false,
      error: `The backup has ${totalRows.toLocaleString()} rows; the restore limit is ${BACKUP_MAX_ROWS.toLocaleString()}.`,
    };

  // Documents: strict minimums + (v1) inline content split.
  const docs = rows.get("documents");
  const sampleTitles: string[] = [];
  if (docs) {
    const splitContent: Record<string, unknown>[] = [];
    for (const d of docs) {
      const check = documentSchema.safeParse(d);
      if (!check.success)
        return {
          ok: false,
          error: `A document row (“${String(d.title ?? d.id)}”) is malformed.`,
        };
      sampleTitles.push(check.data.title);
      const inline = (d as { contentJson?: { chapters?: unknown } }).contentJson;
      if (inline && Array.isArray(inline.chapters)) {
        // v1 backup: move chapters into a docContent row (DB v5 shape).
        const contentCheck = contentRowSchema.safeParse({
          id: d.id,
          userId: d.userId,
          chapters: inline.chapters,
        });
        if (!contentCheck.success)
          return {
            ok: false,
            error: `The chapter content of “${check.data.title}” is malformed.`,
          };
        splitContent.push({
          id: d.id,
          userId: d.userId,
          chapters: inline.chapters,
        });
        const { contentJson: _drop, ...rest } = d as Record<string, unknown>;
        void _drop;
        // Replace the array entry in place (iterate over a copy below).
        docs[docs.indexOf(d)] = rest;
      }
    }
    if (splitContent.length) {
      warnings.push(
        "Legacy backup: chapter content was moved to the modern content store during validation.",
      );
      const existing = rows.get("docContent") ?? [];
      // v2 rows win over the v1 split (should not co-occur; be deterministic).
      const ids = new Set(existing.map((r) => r.id));
      for (const r of splitContent) if (!ids.has(String(r.id))) existing.push(r);
      rows.set("docContent", existing);
    }
    // Content rows: strict validation.
    const contents = rows.get("docContent");
    if (contents) {
      for (const c of contents) {
        const check = contentRowSchema.safeParse(c);
        if (!check.success)
          return {
            ok: false,
            error: "A chapter-content row in the backup is malformed.",
          };
      }
    }
  }

  const profileRaw = (obj as { profile?: { id?: unknown } }).profile;
  return {
    ok: true,
    rows,
    preview: {
      version,
      exportedAt:
        typeof obj.exportedAt === "string" ? obj.exportedAt : null,
      backupProfileId:
        profileRaw && typeof (profileRaw as { id?: unknown }).id === "string"
          ? (profileRaw as { id: string }).id
          : null,
      stores: [...rows.entries()].map(([store, list]) => ({
        store,
        count: list.length,
      })),
      sampleTitles: sampleTitles.slice(0, 12),
      totalRows,
      hasPreferences: preferences !== null,
      scope:
        obj.scope === "full" || obj.scope === "library" || obj.scope === "prefs"
          ? obj.scope
          : null,
      warnings,
    },
    preferences,
  };
}

/* ---------------- restore ---------------- */

export interface RestoreResult {
  /** store → rows actually written */
  written: { store: StoreName; count: number }[];
  /** store → rows skipped because an id already existed (merge policy) */
  skipped: { store: StoreName; count: number }[];
}

export interface RestoreOptions {
  /** "merge" keeps existing rows that share an id; "replace" overwrites. */
  conflict: "merge" | "replace";
  /** The current local identity rows are stamped with. */
  userId: string;
}

/** Apply a validated backup. Throws with an honest message on the first
 *  store that fails; already-committed stores stay committed (restores are
 *  idempotent, so retrying is safe). */
export async function restoreBackup(
  parsed: Extract<ParsedBackup, { ok: true }>,
  opts: RestoreOptions,
): Promise<RestoreResult> {
  const result: RestoreResult = { written: [], skipped: [] };
  for (const [store, list] of parsed.rows) {
    let toWrite: Record<string, unknown>[] = list;
    if (opts.conflict === "merge") {
      const fresh: Record<string, unknown>[] = [];
      for (const row of list) {
        const existing = await idbGet(store, String(row.id));
        if (existing) continue;
        fresh.push(row);
      }
      toWrite = fresh;
    }
    if (toWrite.length === 0) {
      result.skipped.push({
        store,
        count: list.length,
      });
      continue;
    }
    // Re-stamp ownership: a backup restores into the CURRENT profile.
    const stamped = toWrite.map((row) => ({
      ...row,
      id: String(row.id),
      userId: opts.userId,
    }));
    try {
      await idbBulkPut(store, stamped);
    } catch (e) {
      throw new Error(
        `Restoring “${store}” failed: ${e instanceof Error ? e.message : "storage error"}. Already-restored stores are kept; it is safe to retry.`,
      );
    }
    result.written.push({ store, count: stamped.length });
    if (toWrite.length < list.length) {
      result.skipped.push({ store, count: list.length - toWrite.length });
    }
  }
  bump();
  return result;
}
