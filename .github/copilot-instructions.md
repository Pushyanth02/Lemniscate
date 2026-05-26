# InfinityCN — Global Copilot Rules

You are working on the InfinityCN cinematic reading platform.

Core rules:

- Preserve original text meaning.
- Do not rewrite story content unless a cinematized transformation is explicitly requested.
- Use strict TypeScript.
- Keep UI, AI orchestration, runtime rendering, and storage separate.
- Avoid duplicate logic.
- Prefer small, testable modules.
- Minimize AI calls and token usage.
- Use caching, batching, and fallback providers.
- Never expose API keys in frontend code.

Required architecture:
Text/Input
→ Cleanup
→ Scene Segmentation
→ Narrative Analysis
→ Cinematization
→ Streaming Renderer
→ UI Update

Do not bypass stages.
Do not mix AI logic into UI components.
Always add error handling, retry logic, and safe fallback states.

---

## Documentation Map Reference

- Master repository map: [README.md](file:///c:/GitHub/InfinityCN/README.md)
- Planning overview: [PROJECT.md](file:///c:/GitHub/InfinityCN/.planning/PROJECT.md), [ROADMAP.md](file:///c:/GitHub/InfinityCN/.planning/ROADMAP.md), [STATE.md](file:///c:/GitHub/InfinityCN/.planning/STATE.md)
- Codebase map set: [STRUCTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/STRUCTURE.md), [ARCHITECTURE.md](file:///c:/GitHub/InfinityCN/.planning/codebase/ARCHITECTURE.md), [INTEGRATIONS.md](file:///c:/GitHub/InfinityCN/.planning/codebase/INTEGRATIONS.md)
- Specification set: [SRS.md](file:///c:/GitHub/InfinityCN/.planning/specs/SRS.md), [PRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/PRD.md), [TRD.md](file:///c:/GitHub/InfinityCN/.planning/specs/TRD.md), [UI_UX_DESIGN.md](file:///c:/GitHub/InfinityCN/.planning/specs/UI_UX_DESIGN.md), [APP_FLOW.md](file:///c:/GitHub/InfinityCN/.planning/specs/APP_FLOW.md), [BACKEND_SCHEMA.md](file:///c:/GitHub/InfinityCN/.planning/specs/BACKEND_SCHEMA.md)
