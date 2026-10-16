import { useState } from "react";
import {
  ArrowsClockwise,
  DownloadSimple,
  UserCircle,
  Warning,
} from "@phosphor-icons/react";
import { usePrefs, useShallow, toast } from "../../../lib/store";
import {
  getUserIdentity,
  listProfiles,
  switchProfile,
  localStorageBlocked,
} from "../../../lib/db";
import { deleteProfileData } from "../../../lib/data";
import { cx, timeAgo } from "../../../lib/utils";
import { Button, Input, Panel } from "../../../components/ui";
import { MONOGRAM_COLORS } from "../constants";
import { useBackupExport } from "../use-backup-export";

/* Profile: identity (name + monogram), the desk's chair registry
   (switch / remove / back up) and the new-profile trigger. The registry is
   read during render; profileTick is what invalidates those reads after
   mutations. */
export function ProfileSection({
  onStartNewProfile,
}: {
  onStartNewProfile: () => void;
}) {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );
  const [profileTick, setProfileTick] = useState(0);
  const { exporting, run } = useBackupExport();
  const others = listProfiles().filter(
    (p) => p.id !== getUserIdentity().id,
  );

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <UserCircle className="w-4 h-4 text-gold-400" />
          <h2 className="font-display text-xl font-medium text-mist-100">
            How the room addresses you
          </h2>
        </div>
        <p className="text-xs text-mist-500 mb-5 leading-relaxed">
          A name and a mark, used in the dashboard greeting and on your
          monogram. Stored only on this device.
        </p>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div
              aria-hidden
              className="w-20 h-20 rounded-2xl flex items-center justify-center font-display italic text-3xl text-ink-950 shadow-glow-gold transition-all hover:scale-105"
              style={{ background: prefs.profile.color }}
            >
              {(prefs.profile.name.trim()[0] ?? "∞").toUpperCase()}
            </div>
            <span className="text-[11px] font-body text-mist-600">
              Monogram
            </span>
          </div>
          <div className="flex-1 space-y-4 w-full">
            <Input
              label="Display name"
              placeholder="e.g. Ada"
              value={prefs.profile.name}
              maxLength={24}
              onChange={(e) =>
                setPrefs({
                  profile: { ...prefs.profile, name: e.target.value },
                })
              }
            />
            <div>
              <span className="block text-xs font-body font-medium text-mist-500 mb-2">
                Monogram color
              </span>
              <div
                className="flex gap-2.5 flex-wrap"
                role="radiogroup"
                aria-label="Monogram color"
              >
                {MONOGRAM_COLORS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={prefs.profile.color === c}
                    aria-label={`Monogram color ${c}`}
                    onClick={() =>
                      setPrefs({
                        profile: { ...prefs.profile, color: c },
                      })
                    }
                    className={cx(
                      "w-9 h-9 rounded-full border-2 transition-transform press",
                      prefs.profile.color === c
                        ? "border-mist-100 scale-110 shadow-[0_0_12px_var(--acc-glow)]"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-mist-100 mb-1.5">
          Chairs at this desk
        </h2>
        <p className="text-xs text-mist-500 mb-4 leading-relaxed">
          Lemniscate is local-first: there is no server account. Every record
          is stamped with an anonymous profile — one chair at this desk — so
          nothing can be reached from another browser profile. Starting a
          new chair never orphans the old one: every chair stays listed here
          and can be returned to.
        </p>
        {localStorageBlocked() && (
          <div className="mb-4 rounded-lg border border-gold-700/50 bg-gold-500/10 px-4 py-3 flex items-start gap-2.5">
            <Warning className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-mist-300 leading-relaxed">
              Browser storage is blocked (private mode or a privacy
              setting), so identity and preferences cannot be saved and
              will reset when this tab closes. Your library still works
              for this session. Enabling site storage restores
              persistence.
            </p>
          </div>
        )}
        <div className="rounded-lg bg-ink-800 border border-ink-700 p-3">
          <p className="text-[11px] font-body font-medium text-mist-600 mb-1.5">
            Your chair
          </p>
          <p className="text-[11px] font-mono text-mist-300 break-all leading-relaxed">
            {getUserIdentity().id}
          </p>
          <p className="text-[11px] text-mist-600 mt-1.5">
            Created {timeAgo(getUserIdentity().createdAt)}
          </p>
        </div>
        {/* Other registered chairs: switch back or remove their data. */}
        {others.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-body font-medium text-mist-600">
              The other chairs
            </p>
            {others.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-mist-300 break-all">
                    {p.id}
                  </p>
                  <p className="text-[11px] text-mist-600">
                    Created {timeAgo(p.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (switchProfile(p.id)) {
                        toast("info", "Switching profile…");
                        setTimeout(() => location.reload(), 400);
                      } else {
                        toast("error", "That profile could not be found.");
                        setProfileTick((t) => t + 1);
                      }
                    }}
                  >
                    Switch to it
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      try {
                        await deleteProfileData(p.id);
                        toast(
                          "info",
                          "That profile’s data was removed from this device.",
                        );
                        setProfileTick((t) => t + 1);
                      } catch (e) {
                        toast(
                          "error",
                          e instanceof Error ? e.message : "Removal failed.",
                        );
                      }
                    }}
                  >
                    Remove data
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            loading={exporting === "full"}
            onClick={() => run("full")}
          >
            <DownloadSimple className="w-4 h-4" />
            Back up this chair
          </Button>
          <Button variant="danger" onClick={onStartNewProfile}>
            <ArrowsClockwise className="w-4 h-4" />
            Start a new profile
          </Button>
        </div>
        <p className="text-[11px] text-mist-600 mt-3 leading-relaxed">
          A full backup saves this chair’s documents, annotations, history
          and preferences as one JSON file. A new profile starts empty; this
          one stays registered above, so you can always switch back.
          Removing a profile deletes its documents, annotations and history
          from this device.
        </p>
        {/* profileTick keeps the registry read fresh after mutations */}
        <span className="hidden" aria-hidden>{profileTick}</span>
      </Panel>
    </>
  );
}
