# Codebase Concerns

**Analysis Date:** 2026-06-13

## Resolved Concerns (Phase 13 Audit)

**~~Duplicate root-level components~~** ✅ Resolved
- `src/components/ProcessingOverlay.tsx` and `UploadZone.tsx` were identical copies of the canonical `landing/` versions. Both deleted.

**~~Unused lib/cinematifier wrapper~~** ✅ Resolved
- `src/lib/cinematifier/index.ts` was a one-line re-export. Deleted; all consumers now import directly from `src/lib/engine/cinematifier`.

**~~require() devtools in ESM codebase~~** ✅ Resolved
- Replaced with static `import { devtools } from 'zustand/middleware'` + `import.meta.env.DEV` guard.

**~~Orphan m3 components~~** ✅ Resolved
- Button, Card, Input, UploadSection, UploadZone from `src/components/m3/` had zero imports. All deleted. Only `M3ReaderHeader` remains (actively used in ReaderPage).

**~~Nested InfinityCN/ git clone~~** ✅ Resolved
- The `InfinityCN/` subfolder was a full repository clone nested inside itself. Deleted entirely.

**~~Dead ReaderHeader import in ReaderPage~~** ✅ Resolved
- `ReaderPage.tsx` imported both `ReaderHeader` and `M3ReaderHeader` but only used the latter. Dead import removed.

---

## Active Tech Debt

**Core Pipeline File Complexity:**
- `src/lib/rendering/renderBridge.ts` (~31k chars) and `src/lib/engine/cinematifier/corePipeline.ts` are large single-file modules.
- Impact: Harder to trace execution paths, risk of entanglement on future changes.
- Recommended: Evaluate splitting into smaller stage-isolated files if further work is planned in these areas.

## Performance Considerations

**On-Device ML Models:**
- `@xenova/transformers` (embeddings) and `tesseract.js` (OCR) are CPU-heavy. `pdfWorker.ts` offloads PDF parsing to a worker.
- Current state: Main thread processing risk remains if chunk inference doesn't stay fully in Web Workers.
- Watch for: Frame drops during large book processing on low-end devices.

## Security

**Appwrite Scoping:**
- `src/lib/runtime/appwrite.ts` uses an initial ping check for connectivity.
- Recommendation: Confirm all Appwrite bucket operations are user-scoped and don't expose cross-user data paths.

---

*Concerns audit: 2026-06-13*
