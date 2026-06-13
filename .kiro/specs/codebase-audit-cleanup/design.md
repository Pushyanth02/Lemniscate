# Design: InfinityCN Codebase Audit & Cleanup

## Approach

This is a pure cleanup pass — no new features, no logic changes. Every change is either:
1. A deletion of a redundant/unused file
2. A fix to a broken or misleading import
3. A documentation update to match reality

## Key Design Decisions

### Canonical Component Locations
- Landing components live in `src/components/landing/`
- Reader components live in `src/components/reader/`  
- The `src/components/m3/` folder holds the active M3-design-system reader header (M3ReaderHeader) and associated CSS
- The root-level `src/components/ProcessingOverlay.tsx` and `src/components/UploadZone.tsx` are dead code — nothing imports them

### Library Path Simplification
- `src/lib/cinematifier/` is a one-line re-export of `src/lib/engine/cinematifier/index`. It exists purely for historical path-compat.
- After fixing the 3 hook files that import `'../lib/cinematifier'`, we can delete the wrapper directory entirely.
- `src/lib/engine/index.ts` will have its duplicate export line removed.

### Store Cleanup
- The `require()` call for devtools is not safe in an ESM/Vite codebase. Replace with `import.meta.env.DEV` guard and a proper devtools import via the official Zustand pattern.
- The unused `StateError`/`ErrorCodes` import in `cinematifierStore.ts` creates a misleading suggestion that state errors are thrown — remove it.

### m3 Component Audit
- `M3ReaderHeader` — KEEP (actively used in ReaderPage.tsx)
- `M3UploadSection` + `M3UploadZone` — REMOVE if not imported anywhere in production code
- `Button`, `Card`, `Input` from m3/ — CHECK imports and remove if unused

### Nested InfinityCN/ Removal
- The `InfinityCN/` subfolder at root is a complete duplicate of the repo, apparently created by cloning into itself. It should be deleted. This is a filesystem operation only — no source changes.

## File Change Summary

### Files to Delete
- `src/components/ProcessingOverlay.tsx`
- `src/components/UploadZone.tsx`
- `src/lib/codegen/index.ts` + directory
- `src/lib/cinematifier/index.ts` + directory
- `task_progress.md`
- `test_book.txt`
- `InfinityCN/` directory (entire nested clone)
- Possibly: `src/components/m3/UploadSection.tsx`, `src/components/m3/UploadSection.css`, `src/components/m3/UploadZone.tsx`, `src/components/m3/UploadZone.css`, `src/components/m3/Button.tsx`, `src/components/m3/Button.css`, `src/components/m3/Card.tsx`, `src/components/m3/Card.css`, `src/components/m3/Input.tsx` (if unused)

### Files to Modify
- `src/components/reader/ReaderPage.tsx` — remove unused `ReaderHeader` import
- `src/components/reader/index.ts` — remove `ReaderHeader` export, ensure `VirtualizedContent` is valid
- `src/lib/engine/index.ts` — remove duplicate export line
- `src/store/cinematifierStore.ts` — remove unused imports, fix devtools pattern
- `src/hooks/useReadingProgress.ts` — update import path
- `src/hooks/useProcessingPipeline.ts` — update import path
- `src/hooks/useChapterProcessing.ts` — update import path
- `README.md` — update project structure section
- `.planning/STATE.md` — add Phase 13 completion
- `.planning/PLAN.md` — document cleanup pass
- `.planning/codebase/STRUCTURE.md` — update directory layout
- `.planning/codebase/CONCERNS.md` — update resolved concerns
