import { useCallback, useRef, useState } from "react";
import { toast } from "../../lib/store";
import { downloadBackup, type ExportScope } from "../../lib/backup";
import { fmtBytes, fmtNumber } from "../../lib/utils";

/* Shared backup-export runner for the Settings sections: builds, downloads
   and reports one scoped backup, with an honest busy flag so buttons can
   spin while large libraries serialize. One export at a time — a second
   click while one is running is ignored. */
export function useBackupExport() {
  const [exporting, setExporting] = useState<ExportScope | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (scope: ExportScope) => {
    if (busy.current) return;
    busy.current = true;
    setExporting(scope);
    try {
      const b = await downloadBackup(scope);
      // Honest per-scope report: what landed in the file, and what a
      // zero-record backup actually contains.
      let msg: string;
      if (b.rows > 0) {
        msg = `Backed up ${fmtNumber(b.rows)} records · ${fmtBytes(b.bytes)}.`;
      } else if (scope === "prefs") {
        msg = `Preferences backed up · ${fmtBytes(b.bytes)}.`;
      } else if (scope === "library") {
        msg = `Library backup saved · ${fmtBytes(b.bytes)}. The library is empty.`;
      } else {
        msg = `Full backup saved · ${fmtBytes(b.bytes)}. No records yet — preferences only.`;
      }
      toast("success", msg);
    } catch (e) {
      toast(
        "error",
        e instanceof Error ? `Backup failed: ${e.message}` : "Backup failed.",
      );
    } finally {
      busy.current = false;
      setExporting(null);
    }
  }, []);

  return { exporting, run };
}
