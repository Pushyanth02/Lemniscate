import { useState } from "react";
import { useNav, useShallow } from "../lib/store";
import { cx } from "../lib/utils";
import { Eyebrow } from "../components/ui";
import { SECTIONS } from "./settings/constants";
import { ProfileSection } from "./settings/sections/profile";
import { AppearanceSection } from "./settings/sections/appearance";
import { TypographySection } from "./settings/sections/typography";
import { AccessSection } from "./settings/sections/access";
import { AiSection } from "./settings/sections/ai";
import { StorageSection } from "./settings/sections/storage";
import { AboutSection } from "./settings/sections/about";
import {
  ClearDialog,
  EraseDialog,
  RestoreDialog,
  ResetDialog,
  RotateDialog,
} from "./settings/dialogs";
import type { RestoreConflict, RestoreFile } from "./settings/types";

/* Settings shell: the section nav grid, routing via #/settings/{section}
   (nav.sub; the legacy "account" view folds to Profile), and dialog
   orchestration. Sections own their own state; the only state kept here
   is what spans a triggering section and its dialog. */
export default function Settings() {
  const nav = useNav(
    useShallow((s) => ({ go: s.go, sub: s.sub, view: s.view })),
  );
  // "account" was folded into Settings as the Profile section — deep links keep working.
  const wanted = nav.view === "account" ? "profile" : nav.sub;
  const section = SECTIONS.some((s) => s.id === wanted)
    ? (wanted as string)
    : "profile";
  const [clearOpen, setClearOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<RestoreFile | null>(null);
  const [conflict, setConflict] = useState<RestoreConflict>("merge");
  // A freshly picked backup always starts from the merge policy.
  const pickRestore = (file: RestoreFile) => {
    setConflict("merge");
    setRestoreFile(file);
  };
  const activeSectionMeta = SECTIONS.find((s) => s.id === section);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
      <Eyebrow className="mb-3">Your room, your rules</Eyebrow>
      <h1 className="font-display font-semibold text-3xl sm:text-4xl text-mist-100 tracking-tight mb-2">
        Settings &amp; profile
      </h1>
      <p className="text-sm text-mist-500 mb-8 sm:mb-10 max-w-xl">
        Tune the room to your hand: typography, motion, AI companions and your
        local identity.
      </p>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6 lg:gap-10 items-start">
        {/* ───────── Section navigation ───────── */}
        <nav
          className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-20 -mx-4 px-4 lg:mx-0 lg:px-0"
          aria-label="Settings sections"
          style={{ scrollbarWidth: "none" }}
        >
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => nav.go("settings", { sub: s.id })}
                aria-current={active ? "true" : undefined}
                className={cx(
                  "group flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-sm font-body font-medium whitespace-nowrap transition-all border shrink-0 lg:w-full",
                  active
                    ? "bg-gold-500/10 text-gold-300 border-gold-700/50 shadow-[0_0_0_3px_var(--acc-soft)]"
                    : "text-mist-400 hover:text-mist-100 hover:bg-ink-750/60 border-transparent",
                )}
              >
                <s.icon
                  className={cx(
                    "w-4 h-4 shrink-0 transition-colors",
                    active
                      ? "text-gold-400"
                      : "text-mist-500 group-hover:text-mist-300",
                  )}
                />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* ───────── Section content ───────── */}
        <div className="space-y-5 min-w-0">
          {/* section header on mobile only */}
          <div className="lg:hidden flex items-center gap-2 text-xs font-body font-medium text-mist-500">
            {activeSectionMeta && (
              <activeSectionMeta.icon className="w-3.5 h-3.5" />
            )}
            {activeSectionMeta?.label}
          </div>

          {section === "profile" && (
            <ProfileSection onStartNewProfile={() => setRotateOpen(true)} />
          )}

          {section === "appearance" && <AppearanceSection />}

          {section === "typography" && <TypographySection />}

          {section === "access" && <AccessSection />}

          {section === "ai" && <AiSection />}

          {section === "storage" && (
            <StorageSection
              onClearData={() => setClearOpen(true)}
              onEraseDevice={() => setEraseOpen(true)}
              onPickRestore={pickRestore}
              onResetPrefs={() => setResetOpen(true)}
            />
          )}

          {section === "about" && <AboutSection />}
        </div>
      </div>

      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} />

      <EraseDialog open={eraseOpen} onClose={() => setEraseOpen(false)} />

      <RestoreDialog
        file={restoreFile}
        onClose={() => setRestoreFile(null)}
        conflict={conflict}
        onConflictChange={setConflict}
      />

      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />

      <RotateDialog open={rotateOpen} onClose={() => setRotateOpen(false)} />
    </div>
  );
}
