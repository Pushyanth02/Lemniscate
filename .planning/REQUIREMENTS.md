# Requirements: Milestone 1 (GSD Integration)

## Functional Requirements

- [x] **FR1:** Explicit codebase map (Stack, Architecture, Integrations).
- [x] **FR2:** Reader discovery API coverage for novel, manga, manhwa, and manhua.
- [x] **FR3:** Reader sidebar filtering by content type with clear source attribution.
- [x] **FR4:** Cinematic depth metrics exposed in reader analytics UI.
- [x] **FR5:** Structured planning artifacts (PROJECT, ROADMAP, STATE) maintained.

## Technical Requirements

- [x] **TR1:** React 19 / Vite 8 compatibility.
- [x] **TR2:** Canonical pipeline order preserved: Text Input -> Paragraph Rebuilder -> Scene Segmentation -> Narrative Analysis -> Cinematization -> Renderer.
- [x] **TR3:** Paragraph reconstruction extensibility via deterministic breaker APIs with content-preservation fallback.
- [x] **TR4:** Free public API integrations guarded with timeout + null-safe fallback behavior.

## Current Objective

Harden discovery and reader insights while preserving architecture boundaries:

- Keep business logic in runtime/engine modules.
- Keep components presentation-only.
- Remove conflicting legacy pathways and document the active system clearly.

---

_Requirements updated: 2026-04-13_

---

## Documentation Map Reference

- Master repository map: [README.md](file:///c:/GitHub/InfinityCN/README.md)
- Planning overview: [PROJECT.md](file:///c:/GitHub/InfinityCN/.planning/PROJECT.md), [ROADMAP.md](file:///c:/GitHub/InfinityCN/.planning/ROADMAP.md), [STATE.md](file:///c:/GitHub/InfinityCN/.planning/STATE.md)
- Codebase map set: [STRUCTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/STRUCTURE.md), [ARCHITECTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/ARCHITECTURE.md), [INTEGRATIONS.md](file:///c:/GitHub/InfinityCN/.planning/codebase/INTEGRATIONS.md)
- Specification set: [SRS.md](file:///c:/GitHub/InfinityCN/.planning/specs/SRS.md), [PRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/PRD.md), [TRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/TRD.md), [UI_UX_DESIGN.md](file:///c:/GitHub/InfinityCN/.planning/specs/UI_UX_DESIGN.md), [APP_FLOW.md](file:///c:/GitHub/InfinityCN/.planning/specs/APP_FLOW.md), [BACKEND_SCHEMA.md](file:///c:/GitHub/InfinityCN/.planning/specs/BACKEND_SCHEMA.md)
