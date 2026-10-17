import { useRef } from "react";
import {
  ArrowCounterClockwise,
  DownloadSimple,
  Trash,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { usePrefs, useShallow, toast } from "../../../lib/store";
import { parseBackup, BACKUP_MAX_BYTES, type ExportScope } from "../../../lib/backup";
import { Button, Panel, Slider } from "../../../components/ui";
import { CacheStats } from "../widgets/cache-stats";
import { useBackupExport } from "../use-backup-export";
import type { RestoreFile } from "../types";

/* Import & data: upload limit, storage stats, the backup ladder (scoped
   exports → restore → preference reset) and the guarded destructive ops.
   A picked backup file is handed up to the shell, which owns the restore
   dialog; the reset choice opens the shell's reset dialog. */

const EXPORT_OPTIONS: {
  scope: ExportScope;
  icon: typeof DownloadSimple;
  label: string;
  note: string;
}[] = [
  {
    scope: "full",
    icon: DownloadSimple,
    label: "Full backup",
    note: "Everything: library, history and preferences — the complete room",
  },
  {
    scope: "library",
    icon: DownloadSimple,
    label: "Library only",
    note: "Documents, annotations, bookmarks, scenes and stories — no history",
  },
  {
    scope: "prefs",
    icon: DownloadSimple,
    label: "Preferences only",
    note: "A small file: theme, typeface, accent, accessibility",
  },
];

export function StorageSection({
  onClearData,
  onEraseDevice,
  onPickRestore,
  onResetPrefs,
}: {
  onClearData: () => void;
  onEraseDevice: () => void;
  onPickRestore: (file: RestoreFile) => void;
  onResetPrefs: () => void;
}) {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { exporting, run } = useBackupExport();

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-4">Import</h2>
        <Slider
          label="Maximum upload size"
          value={prefs.maxUploadMB}
          min={5}
          max={100}
          step={5}
          unit=" MB"
          onChange={(v) => setPrefs({ maxUploadMB: v })}
        />
        <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
          Files are validated by extension, MIME type and content
          signature before parsing.
        </p>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
          Local data
        </h2>
        <p className="text-xs text-mist-500 mb-5 leading-relaxed">
          Everything lives in this browser’s IndexedDB: documents,
          bookmarks, annotations, scenes, activity and usage.
        </p>
        <CacheStats />
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
          Backup &amp; restore
        </h2>
        <p className="text-xs text-mist-500 mb-5 leading-relaxed">
          Backups are plain JSON files you own. Scale the request to the
          task: the whole room, the library alone, or settings only —
          and bring any of them back through the same door.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORT_OPTIONS.map((opt) => (
            <Button
              key={opt.scope}
              variant="outline"
              loading={exporting === opt.scope}
              onClick={() => run(opt.scope)}
              className="justify-start"
            >
              <opt.icon className="w-4 h-4" />
              <span className="text-left whitespace-normal">
                <span className="block">{opt.label}</span>
                <span className="block text-[10px] font-body opacity-60 -mb-0.5">
                  {opt.note}
                </span>
              </span>
            </Button>
          ))}
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="justify-start"
          >
            <UploadSimple className="w-4 h-4" />
            <span className="text-left whitespace-normal">
              <span className="block">Restore a backup</span>
              <span className="block text-[10px] font-body opacity-60 -mb-0.5">
                Validated before anything is written — data, preferences,
                or both
              </span>
            </span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Backup JSON file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-picking the same file
              if (!file) return;
              if (file.size > BACKUP_MAX_BYTES) {
                toast(
                  "error",
                  `That file is larger than the ${Math.round(BACKUP_MAX_BYTES / 1024 / 1024)} MB restore limit.`,
                );
                return;
              }
              try {
                const text = await file.text();
                const parsed = parseBackup(text);
                if (!parsed.ok) {
                  toast("error", parsed.error);
                  return;
                }
                onPickRestore({
                  name: file.name,
                  parsed,
                  preview: parsed.preview,
                });
              } catch {
                toast("error", "The backup file could not be read.");
              }
            }}
          />
          <Button
            variant="outline"
            onClick={onResetPrefs}
            className="justify-start"
          >
            <ArrowCounterClockwise className="w-4 h-4" />
            <span className="text-left whitespace-normal">
              <span className="block">Reset preferences</span>
              <span className="block text-[10px] font-body opacity-60 -mb-0.5">
                Choose the scope: one area, or everything at once
              </span>
            </span>
          </Button>
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
          Starting over
        </h2>
        <p className="text-xs text-mist-500 mb-5 leading-relaxed">
          The destructive end of the ladder, in order of scale. Both ask
          for confirmation first.
        </p>
        <div className="space-y-3">
          <Button
            variant="danger"
            onClick={onClearData}
            className="w-full justify-start"
          >
            <Trash className="w-4 h-4" />
            <span className="text-left whitespace-normal">
              <span className="block">Clear this profile’s data</span>
              <span className="block text-[10px] font-body opacity-70 -mb-0.5">
                Your documents, bookmarks, scenes — other profiles stay
              </span>
            </span>
          </Button>
          <Button
            variant="danger"
            onClick={onEraseDevice}
            className="w-full justify-start"
          >
            <Warning className="w-4 h-4" />
            <span className="text-left whitespace-normal">
              <span className="block">Erase ALL app data on this device</span>
              <span className="block text-[10px] font-body opacity-70 -mb-0.5">
                Every profile, every record, preferences — nothing survives
              </span>
            </span>
          </Button>
        </div>
      </Panel>
    </>
  );
}
