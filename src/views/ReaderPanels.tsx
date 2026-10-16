/* ReaderPanels — barrel only.
   The former 2,623-line view was decomposed (Task 7-B) into
   src/views/reader-panels/* as a pure move; the public contract consumed by
   Reader.tsx (`CompanionDrawer`, `ScenesView`, `ReaderSettingsSheet`,
   `ChapterIndexSheet`, `type CompanionTab`) is re-exported unchanged.
   Import graph is acyclic: the drawer imports the three panels; panels never
   import the drawer; rich-text is a leaf shared by Luma and Ouro. */

export {
  CompanionDrawer,
  type CompanionTab,
} from "./reader-panels/companion-drawer";
export { OuroPanel } from "./reader-panels/ouro-panel";
export { AnkaaPanel } from "./reader-panels/ankaa-panel";
export { ScenesView } from "./reader-panels/scenes-view";
export { ReaderSettingsSheet } from "./reader-panels/reader-settings-sheet";
export { ChapterIndexSheet } from "./reader-panels/chapter-index-sheet";
