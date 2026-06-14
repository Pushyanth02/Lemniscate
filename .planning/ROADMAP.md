# Roadmap: InfinityCN

## Milestone 6: Cinematification Engine v2.0 (v6.0.0)

**Goal:** Implement advanced cinematification features: enhanced metadata, character/location tracking, storage architecture, sync system, and ambience engine.

- [ ] **Phase 14: Enhanced Scene Metadata & Narrative Analysis**
    - Per-scene metadata (mode, POV, sentiment, tension profile, break reason)
    - Narrative mode detection with confidence scoring (normal/flashback/dream/memory)
    - POV character tracking across scenes
    - Scene emotion/tension profiling with per-block scoring
- [ ] **Phase 15: Character & Location Tracking**
    - Character registry with lifecycle (first/last appearance, scene presence, emotional arc)
    - Location registry with hierarchy and atmosphere tags
    - Character relationship inference
    - Dialogue percentage and appearance statistics
- [ ] **Phase 16: Storage Architecture (JSON + SQLite)**
    - JSON storage adapter for human-readable export
    - SQLite schema with normalized tables (documents, scenes, characters, locations, blocks)
    - Full-text search on scenes and blocks
    - Document versioning and incremental savepoints
- [ ] **Phase 17: Synchronization & Offset Mapping**
    - Character-level offset mapping between raw and processed text
    - Paragraph/sentence alignment tracking
    - Change propagation for local edits
    - Minimal reprocessing on update
- [ ] **Phase 18: Ambience Engine, SFX & Performance**
    - Ambience detection and environmental soundscape generation
    - SFX detection with intensity scoring
    - Speaker attribution with scene tracking
    - LRU caching for expensive operations (sentiment, readability, pacing)
    - Performance profiling and benchmarking suite

## Milestone 1: Architecture Baseline (v1.0.0)

**Goal:** Lock in modular pipeline-first system boundaries.

- [x] **Phase 1: Codebase Mapping**
    - Mapped stack, integrations, architecture, structure, conventions, and testing.
- [x] **Phase 2: Planning Set & Initialization**
    - PROJECT, ROADMAP, STATE, and REQUIREMENTS aligned to active system.
- [x] **Phase 3: Pipeline Hardening**
    - Canonical stage ordering reinforced with chapter/full-system pipelines.

## Milestone 2: Reader Backend & Discovery (v1.1.0)

**Goal:** Expand backend-powered reader insights and recommendation depth.

- [x] **Phase 1: Reader Telemetry Backend**
    - Added local telemetry snapshots and pace analytics summaries.
- [x] **Phase 2: Story Discovery APIs**
    - Added novel/manga/manhwa/manhua discovery across Open Library, Google Books, Gutendex, Jikan, and Kitsu.
- [x] **Phase 3: Reader UI Wiring**
    - Added content-type filters, source badges, and richer sidebar recommendation states.

## Milestone 3: Paragraph + Cinematic Elevation (v1.2.0)

**Goal:** Increase readability and cinematic observability without breaking canonical text.

- [x] **Phase 1: Paragraph Breaker APIs**
    - Added strategy-based paragraph APIs (sentence-cluster, dialogue-pivot, scene-cue).
- [x] **Phase 2: Cinematic Depth Metrics**
    - Surfaced chapter-level scene/cue/tension/mood summaries in reader analytics.
- [x] **Phase 3: Extended Validation Sweep**
    - Hardened mixed-format classification and added reader UX regression coverage.
    - Added persistent in-app feedback capture for suggestion tracking.
    - Added release-readiness gates for mobile + filtered discovery workflows.


## Milestone 4: Engine Modernization & Feature Decoupling (v2.0.0)

**Goal:** Modernize core cinematification engine, decouple features, and build NLP offline heuristics.

- [x] **Phase 11: Feature Removal & JSON Pipeline**
    - Removed Ambient Sound and Auto Scroll features.
    - Refactored core pipeline to serialize/parse structured JSON blocks.
- [x] **Phase 12: Offline APIs, Single Chapter Support, & Animation Enhancements**
    - Implemented robust `navigator.onLine` checks for offline API support in `freeApis.ts`, `quotableApi.ts`, and `readerApis.ts`.
    - Fixed single-chapter misdetection caused by duplicate/recap headings.
    - Smoothed cinematic color transitions with extended duration and opacity pulsing in `mood-themes.css`.

## Milestone 5: Codebase Audit & Cleanup (v5.0.0)

**Goal:** Clean up legacy code, remove redundant/duplicate components, fix broken import paths, and perform a full project health sweep.

- [x] **Phase 13: Full Audit, Legacy Removal, Import Wiring, and Documentation Update**
    - Removed duplicate root-level components (`ProcessingOverlay.tsx`, `UploadZone.tsx`) in favor of modular `landing/` versions.
    - Removed unused M3 design-system components and deleted nested clone repositories.
    - Fixed broken import paths referencing `../lib/cinematifier` and aligned them to `../lib/engine/cinematifier`.
    - Sanitized store imports, refactored devtools `require()` to ESM static import matching environment checks, and updated the export pipeline lifecycle.

---

_Roadmap updated: 2026-06-13_

---

## Documentation Map Reference

- Master repository map: [README.md](file:///c:/GitHub/InfinityCN/README.md)
- Planning overview: [PROJECT.md](file:///c:/GitHub/InfinityCN/.planning/PROJECT.md), [ROADMAP.md](file:///c:/GitHub/InfinityCN/.planning/ROADMAP.md), [STATE.md](file:///c:/GitHub/InfinityCN/.planning/STATE.md)
- Codebase map set: [STRUCTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/STRUCTURE.md), [ARCHITECTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/ARCHITECTURE.md), [INTEGRATIONS.md](file:///c:/GitHub/InfinityCN/.planning/codebase/INTEGRATIONS.md)
- Specification set: [SRS.md](file:///c:/GitHub/InfinityCN/.planning/specs/SRS.md), [PRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/PRD.md), [TRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/TRD.md), [UI_UX_DESIGN.md](file:///c:/GitHub/InfinityCN/.planning/specs/UI_UX_DESIGN.md), [APP_FLOW.md](file:///c:/GitHub/InfinityCN/.planning/specs/APP_FLOW.md), [BACKEND_SCHEMA.md](file:///c:/GitHub/InfinityCN/.planning/specs/BACKEND_SCHEMA.md)
