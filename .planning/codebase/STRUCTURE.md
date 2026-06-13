# Codebase Structure

**Analysis Date:** 2026-06-13

## Directory Layout

```
src/
├── components/
│   ├── landing/          # Landing page components (LandingPage, HeroSection, UploadSection,
│   │                     #   UploadZone, ProcessingOverlay, FeatureShowcase, LandingFooter)
│   ├── layout/           # App shell, router, page transitions (AppShell, AppRouter, PageTransition)
│   ├── m3/               # M3-design-system reader header (ReaderHeader, ReaderHeader.css)
│   ├── reader/           # All reader components (ReaderPage, CinematicRenderer, CinematicBlockView,
│   │                     #   OriginalTextView, ReaderHeader, ReaderFooter, ReaderChapterSidebar,
│   │                     #   ReaderCharactersPanel, ReaderSettingsPanel, EmotionHeatmap,
│   │                     #   ChapterNav, VirtualizedContent, index.ts)
│   └── ui/               # Shared UI primitives (ErrorBoundary, Scrubber)
├── css/                  # Global CSS modules (variables, reader, blocks, landing, upload,
│                         #   processing, buttons, forms, effects, responsive, mood-themes)
├── features/
│   └── settings/
│       └── components/   # Settings feature components (ProviderSection, ProviderCard,
│                         #   ApiKeyInput, PreferencesSection)
├── hooks/                # React custom hooks (13 hooks + index.ts barrel)
├── lib/
│   ├── engine/
│   │   ├── cinematifier/ # Core cinematification engine modules (chapterEngine, corePipeline,
│   │   │                 #   fullSystemPipeline, pipeline, textProcessing, sceneDetection,
│   │   │                 #   paragraphBreakers, entities, metadata, moodLexicon, pacingAnalyzer,
│   │   │                 #   offlineEngine, sentimentTracker, entityExtractor, readability,
│   │   │                 #   regexPatterns, chapterSegmentation, textProcessingEngine, index)
│   │   └── offline/      # Offline speaker tracking (speakerTracker)
│   ├── export/           # Export pipeline (exportPipeline, index)
│   ├── ml/               # ML utilities (chapterDetector)
│   ├── processing/       # Document processing (pdfWorker, bookAsyncProcessor, documentIngestion,
│   │                     #   pdfJobs, jobQueue, textStatistics, index)
│   ├── rendering/        # Render bridge + cinematic stream adapter (renderBridge,
│   │                     #   cinematicStreamAdapter, index)
│   ├── runtime/          # Runtime layer (appwrite, bookManager, cinematifierDb,
│   │                     #   cinematifiedCache, feedbackStore, freeApis, quotableApi,
│   │                     #   readerApis, readerBackend, renderer, index)
│   ├── cinematifier.ts   # Engine facade re-export (points to engine/cinematifier/)
│   ├── constants.ts
│   ├── errors.ts
│   ├── lru-cache.ts
│   └── typescript-utils.ts
├── store/                # Zustand stores (cinematifierStore, bookStore, readerStore,
│                         #   processingStore, moodStore, index)
├── test/                 # Vitest setup (setup.ts)
├── types/                # Global TypeScript types (book, chapter, cinematic, cinematifier,
│                         #   emotion, index, processing, reader, rendering)
├── cinematifier.css      # CSS entry: imports all css/ modules
├── main.tsx              # App entry point
└── styles.css            # Global app styles
```

## Directory Purposes

**`src/lib/engine/cinematifier/`:**
- The canonical cinematification engine. All hooks and pipelines import from here directly.
- The `src/lib/cinematifier.ts` facade at lib root re-exports this for backward compatibility.

**`src/components/m3/`:**
- Contains only `ReaderHeader.tsx` + `ReaderHeader.css` — the active M3-design-system reader header used in `ReaderPage.tsx`.
- All other m3 components (Button, Card, Input, UploadSection, UploadZone) were removed as unused orphans.

**`src/components/landing/`:**
- Canonical location for ProcessingOverlay and UploadZone. Root-level duplicates were removed.

**`src/store/`:**
- `cinematifierStore.ts` is the unified Zustand store using ESM-safe devtools (`import.meta.env.DEV`).
- Domain slices: `bookStore`, `readerStore`, `processingStore`. Separate `moodStore` for real-time mood.

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Web DOM app registration, Appwrite connectivity check, analytics lazy loading.

**Configuration:**
- `vite.config.ts`: Chunk splitting, PWA config, path aliases, test config.
- `eslint.config.js`: Flat ESLint config with TypeScript and React hooks plugins.
- `tsconfig.app.json`: TypeScript strict config for app source.

## Naming Conventions

**Files:**
- PascalCase: `ReaderPage.tsx` (React components)
- camelCase: `pdfWorker.ts`, `renderBridge.ts` (logic/utilities)

**Directories:**
- lowercase/kebab-case

## Where to Add New Code

**New Visual Feature:**
- `src/features/[feature]/` with co-located `__tests__/`

**New Engine Module / Pipeline Stage:**
- `src/lib/engine/cinematifier/[stage].ts` with tests in `src/lib/__tests__/`

**New Runtime Integration:**
- `src/lib/runtime/[module].ts`, export via `src/lib/runtime/index.ts`

---

*Structure analysis: 2026-06-13*
