import { useEffect, useState } from "react";
import {
  ArrowsClockwise,
  ArrowCounterClockwise,
  Shield,
  Trash,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import {
  useNav,
  usePrefs,
  useShallow,
  toast,
  defaultPrefs,
  defaultReader,
  emptyModelsByProvider,
} from "../../lib/store";
import { createAndSwitchProfile, getUserIdentity } from "../../lib/db";
import { clearCurrentProfileData, eraseAllDeviceData } from "../../lib/data";
import { restoreBackup } from "../../lib/backup";
import { ACCENTS } from "../../lib/accents";
import type { Prefs } from "../../lib/types";
import { Button, Dialog } from "../../components/ui";
import { FONT_OPTIONS } from "./constants";
import type { RestoreConflict, RestoreFile } from "./types";

/* Settings confirmation surfaces: clear-profile, erase-device, restore-
   backup (data + preferences), reset-preferences and new-profile. The
   shell renders them (so they stay mounted regardless of the active
   section); each owns only its own busy flag. */

export function ClearDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const nav = useNav(useShallow((s) => ({ go: s.go })));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Clear this profile’s data?"
    >
      <p className="text-sm text-mist-400 leading-relaxed">
        This deletes the current profile’s documents, bookmarks, annotations,
        scenes, stories, activity and usage records from this browser. Active
        background work is cancelled first so nothing can write results back.
        Preferences stay, and other profiles on this device are untouched.
        This cannot be undone.
      </p>
      <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
        <Button
          variant="ghost"
          onClick={onClose}
          className="w-full sm:w-auto"
        >
          Keep my library
        </Button>
        <Button
          variant="danger"
          loading={clearing}
          onClick={async () => {
            setClearing(true);
            try {
              await clearCurrentProfileData();
              onClose();
              toast("info", "This profile’s data is cleared. The room is fresh.");
              nav.go("dashboard");
            } catch (e) {
              toast(
                "error",
                e instanceof Error
                  ? `Clearing failed: ${e.message} Nothing was reported as cleared — it is safe to retry.`
                  : "Clearing failed. It is safe to retry.",
              );
            } finally {
              setClearing(false);
            }
          }}
          className="w-full sm:w-auto"
        >
          <Trash className="w-4 h-4" />
          Clear this profile
        </Button>
      </div>
    </Dialog>
  );
}

export function EraseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [erasing, setErasing] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Erase ALL app data on this device?"
    >
      <p className="text-sm text-mist-400 leading-relaxed">
        This removes every record of every profile on this device — documents,
        bookmarks, annotations, scenes, stories, activity, usage and cached AI
        artifacts — plus the app’s local preferences and the profile registry
        itself. Other open Lemniscate tabs are coordinated and reload. A fresh
        anonymous profile starts immediately. This cannot be undone.
      </p>
      <div className="mt-4 rounded-lg border border-gold-700/40 bg-gold-500/5 px-4 py-3 flex items-start gap-2.5">
        <Warning className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
        <p className="text-[12px] text-mist-400 leading-relaxed">
          If you want a copy of anything first, back it up now — after this,
          the only recovery is re-importing files you saved elsewhere.
        </p>
      </div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
        <Button
          variant="ghost"
          onClick={onClose}
          className="w-full sm:w-auto"
        >
          Keep everything
        </Button>
        <Button
          variant="danger"
          loading={erasing}
          onClick={async () => {
            setErasing(true);
            try {
              await eraseAllDeviceData();
              onClose();
              toast("info", "All app data on this device was erased.");
              setTimeout(() => location.reload(), 600);
            } catch (e) {
              toast(
                "error",
                e instanceof Error
                  ? `Erasure failed: ${e.message} Retry is safe — deletion resumes where it stopped.`
                  : "Erasure failed. Retry is safe.",
              );
            } finally {
              setErasing(false);
            }
          }}
          className="w-full sm:w-auto"
        >
          <Warning className="w-4 h-4" />
          Erase everything
        </Button>
      </div>
    </Dialog>
  );
}

/* Reader-theme labels for the restore preview's preference summary. */
const THEME_LABELS: Record<string, string> = {
  light: "paper",
  dark: "dark",
  sepia: "sepia",
};

export function RestoreDialog({
  file,
  onClose,
  conflict,
  onConflictChange,
}: {
  file: RestoreFile | null;
  onClose: () => void;
  conflict: RestoreConflict;
  onConflictChange: (c: RestoreConflict) => void;
}) {
  const [restoring, setRestoring] = useState(false);
  // A freshly picked backup starts with preferences ON (the point of a
  // full backup is seamless restoration) — but the choice is always shown.
  const [withPrefs, setWithPrefs] = useState(true);
  const nav = useNav(useShallow((s) => ({ go: s.go })));
  const { setPrefs } = usePrefs(useShallow((s) => ({ setPrefs: s.setPrefs })));

  useEffect(() => {
    if (file) setWithPrefs(true);
  }, [file]);

  const prefs = file?.parsed.preferences ?? null;
  const prefsOnly = !!file && file.preview.totalRows === 0 && !!prefs;

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      title={file ? `Restore “${file.name}”?` : "Restore"}
    >
      {file && (
        <div className="space-y-4">
          <p className="text-sm text-mist-400 leading-relaxed">
            Backup from{" "}
            {file.preview.exportedAt
              ? new Date(file.preview.exportedAt).toLocaleString()
              : "an earlier date"}
            {file.preview.totalRows > 0 && (
              <>
                {" "}· {file.preview.totalRows.toLocaleString()} records ·
                {" "}format v{file.preview.version}
              </>
            )}
            {file.preview.scope && (
              <> · a {file.preview.scope === "prefs" ? "preferences-only" : file.preview.scope} export</>
            )}
            .{" "}
            {prefsOnly
              ? "The preferences in it will be applied to this profile — exactly as if you had set them here."
              : "Everything in it will be imported into your current profile — exactly as if you had owned it here all along."}
          </p>
          {file.preview.stores.length > 0 && (
            <div className="rounded-lg bg-ink-800 border border-ink-700 p-3 space-y-1.5">
              {file.preview.stores.map((st) => (
                <div
                  key={st.store}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="font-mono text-mist-400">{st.store}</span>
                  <span className="text-mist-300">
                    {st.count.toLocaleString()} record{st.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {file.preview.sampleTitles.length > 0 && (
            <p className="text-[12px] text-mist-500 leading-relaxed">
              Includes:{" "}
              {file.preview.sampleTitles
                .slice(0, 6)
                .map((t) => `“${t}”`)
                .join(", ")}
              {file.preview.sampleTitles.length > 6
                ? ` and ${file.preview.sampleTitles.length - 6} more`
                : ""}
              .
            </p>
          )}
          {prefs && (
            <div
              className={`rounded-lg border p-3.5 transition-colors ${
                withPrefs
                  ? "border-gold-700/50 bg-gold-500/5"
                  : "border-ink-700 bg-ink-850"
              }`}
            >
              <label className="flex items-start justify-between gap-3 cursor-pointer group">
                <span>
                  <span className="block text-[13px] font-display font-medium text-mist-200">
                    Also restore preferences
                  </span>
                  <span className="block text-[11px] text-mist-500 mt-1 leading-relaxed">
                    {prefs.reader.fontFamily &&
                      `${
                        FONT_OPTIONS.find(
                          (f) => f.value === prefs.reader.fontFamily,
                        )?.label ?? "the default typeface"
                      } type, `}
                    the{" "}
                    {THEME_LABELS[prefs.reader.theme] ?? prefs.reader.theme}{" "}
                    reader theme, the{" "}
                    {ACCENTS.find((a) => a.id === prefs.accent)?.label.toLowerCase() ??
                      "gilt"}{" "}
                    accent, accessibility and AI settings
                    {prefs.profile.name.trim()
                      ? ` — and the display name “${prefs.profile.name.trim()}”`
                      : ""}
                    . API keys are never stored, so there is nothing to lose.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={withPrefs}
                  onChange={(e) => setWithPrefs(e.target.checked)}
                  className="mt-1 w-4 h-4 shrink-0 accent-[var(--acc)] cursor-pointer"
                />
              </label>
            </div>
          )}
          {file.preview.warnings.map((w) => (
            <p key={w} className="text-[11px] text-gold-400/90 leading-relaxed">
              {w}
            </p>
          ))}
          {file.preview.totalRows > 0 && (
            <div>
              <p className="text-xs font-body font-medium text-mist-500 mb-2">
                If a record already exists here
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    ["merge", "Keep mine", "Existing records win; the backup’s copies are skipped"],
                    ["replace", "Use the backup", "The backup’s records overwrite mine"],
                  ] as const
                ).map(([id, label, note]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onConflictChange(id)}
                    aria-pressed={conflict === id}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-gold-500 ${
                      conflict === id
                        ? "border-gold-600 bg-gold-500/10"
                        : "border-ink-600 bg-ink-850 hover:border-ink-500"
                    }`}
                  >
                    <span className="block text-[13px] font-display font-medium text-mist-200">
                      {label}
                    </span>
                    <span className="block text-[10.5px] text-mist-500 mt-0.5">
                      {note}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Not now
            </Button>
            <Button
              variant="gold"
              loading={restoring}
              onClick={async () => {
                setRestoring(true);
                try {
                  const result =
                    file.preview.totalRows > 0
                      ? await restoreBackup(file.parsed, {
                          conflict,
                          userId: getUserIdentity().id,
                        })
                      : null;
                  if (withPrefs && prefs) setPrefs(prefs);
                  const appliedPrefs = withPrefs && !!prefs;
                  const written =
                    result?.written.reduce((a, w) => a + w.count, 0) ?? 0;
                  const skipped =
                    result?.skipped.reduce((a, w) => a + w.count, 0) ?? 0;
                  onClose();
                  toast(
                    "success",
                    written === 0 && appliedPrefs
                      ? "Preferences restored."
                      : appliedPrefs
                        ? `Restored ${written.toLocaleString()} record${written === 1 ? "" : "s"} and your preferences.`
                        : `Restored ${written.toLocaleString()} record${written === 1 ? "" : "s"}${
                            skipped ? ` · ${skipped.toLocaleString()} kept as-is` : ""
                          }.`,
                  );
                  // Records restored → show the library. A preferences-only
                  // restore stays here so the change is visible immediately.
                  if (written > 0) nav.go("library");
                } catch (e) {
                  toast(
                    "error",
                    e instanceof Error ? e.message : "Restore failed.",
                  );
                } finally {
                  setRestoring(false);
                }
              }}
              className="w-full sm:w-auto"
            >
              <UploadSimple className="w-4 h-4" />
              {prefsOnly ? "Restore preferences" : "Restore into this profile"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ───────────────────────── preference reset ───────────────────────── */

type ResetAreaId =
  | "everything"
  | "appearance"
  | "typography"
  | "accessibility"
  | "ai";

const RESET_AREAS: { id: ResetAreaId; label: string; note: string }[] = [
  {
    id: "everything",
    label: "Everything",
    note: "All of the below at once — your name, monogram, library and chairs stay",
  },
  {
    id: "appearance",
    label: "Appearance & accent",
    note: "App accent, focus ring and the reader’s accent",
  },
  {
    id: "typography",
    label: "Typography",
    note: "Typeface, size, spacing, measure, reader theme and focus mode",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    note: "UI scale, touch targets, underlined links, contrast and motion",
  },
  {
    id: "ai",
    label: "AI companions",
    note: "Provider, model pins, failover, daily quota and refine consent",
  },
];

/** The preference patch each reset area applies. Scopes are deliberately
 *  narrow: a reset never touches the profile identity (name / monogram),
 *  the library, or the seeded flag — only the settings it names. */
function resetPatch(area: ResetAreaId, current: Prefs): Partial<Prefs> {
  switch (area) {
    case "everything":
      return {
        ...defaultPrefs,
        profile: current.profile,
        seeded: current.seeded,
      };
    case "appearance":
      return {
        accent: defaultPrefs.accent,
        ring: defaultPrefs.ring,
        reader: { ...current.reader, accent: defaultReader.accent },
      };
    case "typography":
      return {
        reader: {
          ...current.reader,
          fontFamily: defaultReader.fontFamily,
          fontSize: defaultReader.fontSize,
          lineHeight: defaultReader.lineHeight,
          letterSpacing: defaultReader.letterSpacing,
          width: defaultReader.width,
          theme: defaultReader.theme,
          focusMode: defaultReader.focusMode,
        },
      };
    case "accessibility":
      return {
        uiScale: defaultPrefs.uiScale,
        touchTargets: defaultPrefs.touchTargets,
        underlineLinks: defaultPrefs.underlineLinks,
        reader: {
          ...current.reader,
          contrast: defaultReader.contrast,
          motion: defaultReader.motion,
          animSpeed: defaultReader.animSpeed,
        },
      };
    case "ai":
      return {
        provider: defaultPrefs.provider,
        aiModelsByProvider: emptyModelsByProvider(),
        aiProviderByBot: {},
        aiFailover: defaultPrefs.aiFailover,
        dailyQuota: defaultPrefs.dailyQuota,
        aiRefine: defaultPrefs.aiRefine,
        aiRefineConsent: defaultPrefs.aiRefineConsent,
      };
  }
}

const RESET_TOASTS: Record<ResetAreaId, string> = {
  everything: "All preferences reset — your name and library stay.",
  appearance: "Appearance preferences reset.",
  typography: "Typography preferences reset.",
  accessibility: "Accessibility preferences reset.",
  ai: "AI companion preferences reset.",
};

export function ResetDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [area, setArea] = useState<ResetAreaId>("everything");
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );

  return (
    <Dialog open={open} onClose={onClose} title="Reset preferences?">
      <div className="space-y-4">
        <p className="text-sm text-mist-400 leading-relaxed">
          Preferences only — documents, chairs and reading history are never
          touched, and API keys are never stored anywhere. Choose how much
          returns to its default:
        </p>
        <div
          role="radiogroup"
          aria-label="Reset scope"
          className="space-y-2"
        >
          {RESET_AREAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={area === a.id}
              onClick={() => setArea(a.id)}
              className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-gold-500 ${
                area === a.id
                  ? "border-gold-600 bg-gold-500/10"
                  : "border-ink-600 bg-ink-850 hover:border-ink-500"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-display font-medium text-mist-200">
                  {a.label}
                </span>
                <span
                  aria-hidden
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                    area === a.id
                      ? "bg-gold-400 shadow-[0_0_8px_var(--acc-glow)]"
                      : "bg-ink-600"
                  }`}
                />
              </span>
              <span className="block text-[11px] text-mist-500 mt-0.5 leading-relaxed">
                {a.note}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Keep my settings
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setPrefs(resetPatch(area, prefs));
              toast("info", RESET_TOASTS[area]);
              onClose();
            }}
            className="w-full sm:w-auto"
          >
            <ArrowCounterClockwise className="w-4 h-4" />
            Reset {RESET_AREAS.find((a) => a.id === area)?.label.toLowerCase()}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function RotateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // New-profile confirmation — the old profile stays registered and
  // switchable, so this can never orphan data.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start a new profile?"
    >
      <div className="space-y-4">
        <p className="text-sm text-mist-400 leading-relaxed">
          This creates a fresh anonymous profile and switches to it — an
          empty reading room. Your current profile{" "}
          <span className="text-mist-200">stays on this device</span> and
          remains listed among the chairs at this desk (Settings → Profile),
          so you can switch back to it at any time.
        </p>
        <div className="rounded-lg border border-gold-700/40 bg-gold-500/5 px-4 py-3 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-mist-400 leading-relaxed">
            Useful when you share this browser and want a clean separation.
            Nothing is deleted by starting a profile; removal is a separate,
            explicit action.
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Stay in this profile
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              createAndSwitchProfile();
              toast("info", "New profile created. Starting a fresh room…");
              setTimeout(() => location.reload(), 600);
            }}
            className="w-full sm:w-auto"
          >
            <ArrowsClockwise className="w-4 h-4" />
            Start &amp; reload
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
