import type { ParsedBackup, RestorePreview } from "../../lib/backup";

/* A backup file picked for restore: named and parsed by the Storage
   section, held by the Settings shell, previewed by the Restore dialog. */
export type RestoreFile = {
  name: string;
  parsed: Extract<ParsedBackup, { ok: true }>;
  preview: RestorePreview;
};

/* Row-level conflict policy for a restore (see lib/backup.ts). */
export type RestoreConflict = "merge" | "replace";
