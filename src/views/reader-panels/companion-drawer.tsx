import { ChatCircleDots, Scroll, PenNib } from "@phosphor-icons/react";
import { Sheet, Tabs } from "../../components/ui";
import type { DocWithContent } from "../../lib/types";
import { cx } from "../../lib/utils";
import { LumaChat } from "./luma-chat";
import { OuroPanel } from "./ouro-panel";
import { AnkaaPanel } from "./ankaa-panel";

/* ================= Companion drawer (Luma + Ouro + Ankaa) ================= */

export type CompanionTab = "luma" | "ouro" | "ankaa";

export function CompanionDrawer({
  open,
  onClose,
  doc,
  chapterIndex,
  tab,
  setTab,
  selection,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  doc: DocWithContent;
  chapterIndex: number;
  tab: CompanionTab;
  setTab: (t: CompanionTab) => void;
  selection: string | null;
  /** A question seeded from elsewhere in the app (e.g. the Scene Atlas'
      “Ask Luma”): lands in the composer when its nonce changes. */
  seed?: { question: string; nonce: number } | null;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      width="max-w-lg"
      title={
        <Tabs
          value={tab}
          onChange={(id) => setTab(id as CompanionTab)}
          tabs={[
            {
              id: "luma",
              label: "Luma",
              icon: <ChatCircleDots className="w-3.5 h-3.5" />,
            },
            {
              id: "ouro",
              label: "Ouro",
              icon: <Scroll className="w-3.5 h-3.5" />,
            },
            {
              id: "ankaa",
              label: "Ankaa",
              icon: <PenNib className="w-3.5 h-3.5" />,
            },
          ]}
        />
      }
    >
      {/* All three panels stay MOUNTED and are hidden via CSS when not the
          active tab — this preserves their useState (chat messages, study
          feed, draft prompt, live job state) across tab switches. */}
      <div
        className={cx("flex flex-col h-full", tab !== "luma" && "hidden")}
        aria-hidden={tab !== "luma"}
      >
        <LumaChat
          doc={doc}
          chapterIndex={chapterIndex}
          selection={selection}
          seed={seed}
        />
      </div>
      <div
        className={cx("flex flex-col h-full", tab !== "ouro" && "hidden")}
        aria-hidden={tab !== "ouro"}
      >
        <OuroPanel doc={doc} chapterIndex={chapterIndex} />
      </div>
      <div
        className={cx("flex flex-col h-full", tab !== "ankaa" && "hidden")}
        aria-hidden={tab !== "ankaa"}
      >
        <AnkaaPanel doc={doc} />
      </div>
    </Sheet>
  );
}
