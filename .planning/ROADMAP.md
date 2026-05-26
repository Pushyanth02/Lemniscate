# Roadmap: InfinityCN

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

---

_Roadmap updated: 2026-05-26_

---

## Documentation Map Reference

- Master repository map: [README.md](file:///c:/GitHub/InfinityCN/README.md)
- Planning overview: [PROJECT.md](file:///c:/GitHub/InfinityCN/.planning/PROJECT.md), [ROADMAP.md](file:///c:/GitHub/InfinityCN/.planning/ROADMAP.md), [STATE.md](file:///c:/GitHub/InfinityCN/.planning/STATE.md)
- Codebase map set: [STRUCTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/STRUCTURE.md), [ARCHITECTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/ARCHITECTURE.md), [INTEGRATIONS.md](file:///c:/GitHub/InfinityCN/.planning/codebase/INTEGRATIONS.md)
- Specification set: [SRS.md](file:///c:/GitHub/InfinityCN/.planning/specs/SRS.md), [PRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/PRD.md), [TRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/TRD.md), [UI_UX_DESIGN.md](file:///c:/GitHub/InfinityCN/.planning/specs/UI_UX_DESIGN.md), [APP_FLOW.md](file:///c:/GitHub/InfinityCN/.planning/specs/APP_FLOW.md), [BACKEND_SCHEMA.md](file:///c:/GitHub/InfinityCN/.planning/specs/BACKEND_SCHEMA.md)
