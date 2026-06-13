# Implementation Plan: InfinityCN Codebase Audit & Cleanup

## Overview

Comprehensive audit, cleanup, component wiring, folder organization, and documentation update for the InfinityCN cinematifier application. This is a pure cleanup pass — no new features or logic changes. Every change is a deletion of redundant/unused code, a fix to broken imports, or a documentation update.

## Task Dependency Graph

```json
{
  "waves": [
    ["1", "3", "4", "5", "6"],
    ["2", "8"],
    ["7", "9", "10"],
    ["11"],
    ["12"]
  ]
}
```

## Tasks

- [x] 1. Audit m3 Components for Unused Orphans
  - Searched all `.tsx`/`.ts` files for imports of m3/Button, m3/Card, m3/Input, m3/UploadSection, m3/UploadZone — all confirmed unused orphans
  - Confirmed M3ReaderHeader IS used in src/components/reader/ReaderPage.tsx
  - Result: keep ReaderHeader.tsx + ReaderHeader.css; delete everything else in m3/

- [x] 2. Fix Import Paths in Hooks
  - Updated src/hooks/useReadingProgress.ts: import now from ../lib/engine/cinematifier
  - Updated src/hooks/useProcessingPipeline.ts: import now from ../lib/engine/cinematifier
  - Updated src/hooks/useChapterProcessing.ts: import now from ../lib/engine/cinematifier

- [x] 3. Fix ReaderPage Import Wiring
  - Removed unused `import { ReaderHeader } from './ReaderHeader'` from ReaderPage.tsx
  - Removed `export { ReaderHeader }` from src/components/reader/index.ts barrel

- [x] 4. Fix Store Issues
  - Removed unused `import { StateError, ErrorCodes } from '../lib/errors'`
  - Replaced fragile require() devtools block with static ESM import of devtools from zustand/middleware
  - Replaced process.env.NODE_ENV checks with import.meta.env.DEV / import.meta.env.PROD

- [x] 5. Fix Engine Index Double Export
  - Removed duplicate `export * from './cinematifier/index'` from src/lib/engine/index.ts

- [x] 6. Remove Redundant Root-Level Component Duplicates
  - Deleted src/components/ProcessingOverlay.tsx
  - Deleted src/components/UploadZone.tsx

- [x] 7. Remove Unused Library Directories
  - Deleted src/lib/codegen/index.ts and src/lib/codegen/ directory
  - Deleted src/lib/cinematifier/index.ts and src/lib/cinematifier/ directory

- [x] 8. Remove Unused m3 Components
  - Deleted src/components/m3/Button.tsx + Button.css
  - Deleted src/components/m3/Card.tsx + Card.css
  - Deleted src/components/m3/Input.tsx
  - Deleted src/components/m3/UploadSection.tsx + UploadSection.css
  - Deleted src/components/m3/UploadZone.tsx + UploadZone.css
  - Kept src/components/m3/ReaderHeader.tsx + ReaderHeader.css (actively used)

- [x] 9. Remove Project Root Artifacts
  - Deleted task_progress.md from project root
  - Deleted test_book.txt from project root
  - Deleted entire InfinityCN/ nested subfolder (was a git-repo-within-git-repo)

- [x] 10. Verify VirtualizedContent Export
  - Confirmed VirtualizedContent.tsx exists and is fully implemented (~250 lines)
  - Exports VirtualItem interface and VirtualizedContent named React.FC component
  - Production-ready variable-height virtual scroll renderer — no changes needed

- [x] 11. Run Build and Tests Verification
  - Run `npm run build` from project root and confirm zero TypeScript errors and zero build errors
  - Run `npm test` from project root and confirm all tests pass
  - Fix any failures before marking complete

- [x] 12. Update Documentation
  - Update README.md project structure section to accurately reflect current file layout, removing references to deleted files
  - Verified audioSynth.ts does not exist — removed from README; also removed stale "Ambient Audio" feature mention
  - Updated .planning/STATE.md: added Phase 13 (Codebase Audit & Cleanup) as completed 2026-06-13
  - Updated .planning/PLAN.md: documented the cleanup milestone with full summary
  - Updated .planning/codebase/STRUCTURE.md: full directory layout reflecting post-cleanup reality
  - Updated .planning/codebase/CONCERNS.md: marked all resolved concerns, noted remaining active tech debt

## Notes

- Tasks 2 and 5 must complete before Task 7 (lib/cinematifier deletion depends on hooks being migrated)
- Task 1 must complete before Task 8 (m3 deletion depends on the audit)
- Task 11 (build verification) runs after all code changes; Task 12 (docs) runs last
- The InfinityCN/ nested folder deletion in Task 9 is a filesystem-only operation with no source impact
- M3ReaderHeader must be kept — it is the active reader header component
