# Requirements: InfinityCN Codebase Audit & Cleanup

## Overview
Comprehensive audit, cleanup, component wiring, folder organization, and documentation update for the InfinityCN cinematifier application.

## Requirements

### REQ-1: Remove Legacy and Redundant Files
- Remove `src/components/ProcessingOverlay.tsx` (root-level duplicate — canonical is `src/components/landing/ProcessingOverlay.tsx`)
- Remove `src/components/UploadZone.tsx` (root-level duplicate — canonical is `src/components/landing/UploadZone.tsx`)
- Remove `src/lib/codegen/index.ts` and the `src/lib/codegen/` directory (unused dev utility, not imported by any production code)
- Remove `src/lib/cinematifier/index.ts` and the `src/lib/cinematifier/` directory (thin re-export wrapper of `src/lib/engine/cinematifier/index.ts` — consolidate into direct engine import)
- Remove the nested `InfinityCN/` subfolder at project root (it is an old nested git clone of the whole repo — completely redundant)
- Remove `task_progress.md` from project root (stale scratch file, not part of the source)
- Remove `test_book.txt` from project root (test artifact, should not be in version control root)

### REQ-2: Fix Component Wiring Issues
- `src/components/reader/ReaderPage.tsx` imports both `ReaderHeader` (from `./ReaderHeader`) AND `M3ReaderHeader` (from `../m3/ReaderHeader`) but only uses `M3ReaderHeader` in JSX. Remove the unused `ReaderHeader` import.
- `src/lib/engine/index.ts` double-exports: `export * from './cinematifier'` AND `export * from './cinematifier/index'` which are the same module. Remove the duplicate re-export.
- `src/store/cinematifierStore.ts` imports `StateError` and `ErrorCodes` from `'../lib/errors'` but never uses them. Remove the unused import.
- `src/store/cinematifierStore.ts` uses a fragile `require()` for devtools in an ES module codebase. Replace with a proper conditional devtools pattern using dynamic import or a type-safe no-op.
- Update `src/hooks/useReadingProgress.ts`, `src/hooks/useProcessingPipeline.ts`, and `src/hooks/useChapterProcessing.ts` which import from `'../lib/cinematifier'` (the thin wrapper being removed) to import directly from `'../lib/engine/cinematifier'`.
- `src/components/reader/index.ts` barrel re-exports `ReaderHeader` which is now superseded by `M3ReaderHeader` — update the barrel to remove `ReaderHeader` export and optionally add `M3ReaderHeader` if it needs to be exported.

### REQ-3: Consolidate the m3 Components
- The `src/components/m3/` directory contains `M3ReaderHeader` (actively used in ReaderPage), `M3UploadSection`, `M3UploadZone`, `Button`, `Card`, `Input` components. Verify each is properly used or flag orphans.
- `M3UploadSection` and `M3UploadZone` from m3/ appear unused — `LandingPage` uses `src/components/landing/UploadSection` and `src/components/landing/UploadZone`. Confirm and remove orphan m3 upload components if confirmed unused.

### REQ-4: Fix the Store's devtools Integration
- Replace the `require()` based devtools pattern in `cinematifierStore.ts` with a proper Vite/ESM-compatible pattern that uses `import.meta.env.DEV` instead of `process.env.NODE_ENV` for consistency with the Vite build system.

### REQ-5: Update Reader Barrel Export
- `src/components/reader/index.ts` exports `VirtualizedContent` — verify it exists and is implemented.
- Remove stale exports from the barrel that no longer exist or have been replaced.

### REQ-6: Update All Documentation
- Update `README.md` to remove references to removed files (`audioSynth.ts`, `cinematifier.ts`, `cinematifierDb.ts` etc. from `src/lib/` root — verify which ones exist).
- Update `README.md` project structure section to accurately reflect current file layout.
- Update `.planning/STATE.md` to mark Phase 13 (Codebase Audit & Cleanup) as completed.
- Update `.planning/PLAN.md` to document this cleanup milestone.
- Update `.planning/codebase/STRUCTURE.md` to reflect accurate post-cleanup directory layout.
- Update `.planning/codebase/CONCERNS.md` to reflect resolved and remaining concerns.

### REQ-7: Verify Build and Tests Pass
- After all changes, run `npm run build` to confirm zero TypeScript and build errors.
- Run `npm test` to confirm all tests pass.
