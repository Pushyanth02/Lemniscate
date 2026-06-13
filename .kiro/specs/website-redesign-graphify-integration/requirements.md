# Requirements Document

## Introduction

This feature covers two related tracks for InfinityCN:

**Track A — Website Redesign:** Refine the existing Velvet Noir / Material Design 3 hybrid design system across all surfaces (LandingPage, ReaderPage, AppSettings, LibraryView). The goal is tightened typography, a more intentional color palette, cohesive glassmorphic surface treatment, and targeted UX improvements — all without touching the cinematification engine. The UI must continue to "disappear" into the narrative.

**Track B — Graphify Integration:** Surface Graphify's dependency graph output (`graphify-out/graph.json`, `graph.html`) alongside the `.planning/` markdown documentation system inside a developer-facing panel in AppSettings. This gives contributors real-time codebase awareness without leaving the app, linking graph communities to their corresponding planning documents.

Both tracks are strictly additive to the UI layer. No pipeline logic, store structure, or TypeScript types may be altered unless required to support a new developer-tool component.

---

## Glossary

- **Design_System**: The combined Velvet Noir / M3 token set defined in `src/css/variables.css`.
- **Token**: A CSS custom property (e.g. `--primary`, `--surface`, `--on-surface`) from the Design_System.
- **LandingPage**: The `src/components/landing/LandingPage.tsx` component and its sub-components.
- **ReaderPage**: The `src/components/reader/ReaderPage.tsx` component and all reader sub-components.
- **AppSettings**: The `src/features/settings/components/` settings overlay.
- **LibraryView**: The book-grid / discovery surface rendered within AppSettings or a dedicated route.
- **Glassmorphism**: The surface treatment using `--glass-bg`, `--glass-blur`, and `--ghost-border` tokens.
- **Typography_Scale**: The M3 type-scale tokens defined in `variables.css` (`--md-sys-type-*`).
- **Graphify**: The external CLI tool that writes `graphify-out/graph.json`, `graphify-out/graph.html`, and `graphify-out/GRAPH_REPORT.md`.
- **Graph_Panel**: The new developer-facing UI component that renders Graphify output inside AppSettings.
- **Planning_Doc**: Any markdown file under `.planning/` (PROJECT.md, ROADMAP.md, ARCHITECTURE.md, etc.).
- **Community**: A named node cluster in the Graphify graph, as reported in GRAPH_REPORT.md.
- **God_Node**: A node with the highest edge count in the Graphify graph, used as navigation shortcuts.
- **Framer_Motion**: The animation library (`framer-motion`) used for all transitions and micro-animations.

---

## Requirements

### Requirement 1: Token Purity Enforcement

**User Story:** As a developer, I want all styled components to exclusively use Design_System tokens, so that no raw hex values or legacy `--cine-*` names exist anywhere in the stylesheet.

#### Acceptance Criteria

1. THE Design_System SHALL define all color, typography, spacing, and shadow values as named tokens in `src/css/variables.css`.
2. WHEN a CSS rule references a color, spacing, or shadow value, THE Design_System SHALL resolve that value through a token variable rather than a hardcoded literal.
3. IF a `--cine-*` prefixed token is detected in any CSS file, THEN THE Design_System SHALL treat that reference as a violation and it SHALL be replaced with the equivalent core token.
4. THE Design_System SHALL maintain backward-compatibility aliases so that any token renamed during this migration maps to its new token via a CSS `var()` chain.

---

### Requirement 2: Typography Hierarchy Refinement

**User Story:** As a reader, I want clear visual hierarchy across headings, body text, and UI labels, so that I can navigate and read without cognitive friction.

#### Acceptance Criteria

1. THE Typography_Scale SHALL assign `Manrope` (via `--font-headline`) to all display and headline roles.
2. THE Typography_Scale SHALL assign `Newsreader` (via `--font-body` / `--font-serif-reader`) to all prose reading containers.
3. THE Typography_Scale SHALL assign `Inter` (via `--font-label`) to all UI control labels, captions, and system messages.
4. WHERE the dyslexia accessibility setting is active, THE Typography_Scale SHALL assign `Lexend` (via `--font-dyslexia`) to all prose and UI text.
5. THE ReaderPage SHALL constrain prose containers to a maximum width of `720px`.
6. THE ReaderPage SHALL set default body line-height to `1.6` and SHALL allow user adjustment between `1.5` and `2.2` via the reader settings panel.
7. WHEN the accessibility mode is toggled, THE Typography_Scale SHALL increase letter-spacing from the default `0.01em` to `0.05em` across all prose text within `200ms` using a CSS transition.

---

### Requirement 3: Velvet Noir Color Palette Cohesion

**User Story:** As a user, I want a consistent dark-mode visual atmosphere across every screen, so that the app feels like a single cinematic experience rather than disconnected pages.

#### Acceptance Criteria

1. THE Design_System SHALL designate `--md-sys-color-surface` (`#131313`) as the base background for all full-screen views in dark mode.
2. THE Design_System SHALL designate `--md-sys-color-primary` (`#ffb3b1` in dark, `#bb152c` in light) as the single interactive accent used for focused controls, active states, and key CTAs.
3. WHILE dark mode is active, THE Design_System SHALL apply `--glass-bg` (`rgba(32, 31, 31, 0.7)`) and `--glass-blur` (`blur(20px)`) to all elevated card and panel surfaces.
4. WHILE light mode is active (`[data-theme='light']`), THE Design_System SHALL apply `--glass-bg` (`rgba(244, 240, 239, 0.85)`) to elevated surfaces while preserving the same blur token.
5. THE Design_System SHALL reserve `--md-sys-color-secondary` for success and dialogue-indicator states only.
6. THE Design_System SHALL reserve `--md-sys-color-tertiary` for informational and link states only.
7. IF a component requires a hover state color, THEN THE Design_System SHALL derive it from `--md-sys-color-primary-variant` rather than a new raw hex value.

---

### Requirement 4: Glassmorphism Surface Treatment

**User Story:** As a user, I want panels, cards, and sidebars to feel elevated above the narrative canvas without obscuring it, so that UI controls remain accessible without breaking immersion.

#### Acceptance Criteria

1. THE LandingPage SHALL render all feature-showcase cards with Glassmorphism using `--glass-bg`, `--glass-blur`, and `--ghost-border` tokens.
2. THE ReaderPage SHALL render all sidebar panels (chapter list, characters, settings) with Glassmorphism at the defined token values.
3. THE AppSettings SHALL render the settings overlay using Glassmorphism with a `--glass-blur` of `blur(20px)`.
4. WHEN a glassmorphic surface is in focus or hovered, THE surface SHALL transition border opacity from `--ghost-border` to `rgba(255,255,255,0.15)` over `150ms`.
5. IF a browser does not support `backdrop-filter`, THEN THE surface SHALL fall back to `background-color: var(--surface-container)` without visual breakage.

---

### Requirement 5: Landing Page UX Enhancement

**User Story:** As a first-time visitor, I want the landing page to communicate InfinityCN's cinematic value clearly and efficiently, so that I understand the product and feel invited to upload my first book.

#### Acceptance Criteria

1. THE LandingPage SHALL render a hero section with a single primary CTA button styled with `--primary-gradient` and `--shadow-cinema`.
2. THE LandingPage SHALL animate hero headline text into view using Framer_Motion with a fade-up entry (`y: 24` to `y: 0`, `opacity: 0` to `opacity: 1`) over `500ms` with a `cubic-bezier(0.4, 0, 0.2, 1)` easing curve.
3. THE LandingPage SHALL render feature-showcase items with staggered Framer_Motion entry animations, each item delayed by `80ms` from the previous.
4. WHEN a user hovers over an interactive card, THE LandingPage SHALL scale the card to `1.02` over `150ms` linear.
5. THE LandingPage SHALL include a skip-to-content landmark link as the first focusable element for keyboard and screen-reader users.
6. THE UploadZone SHALL provide a drag-active visual state using `--primary` border color and `--glow-primary` background tint.

---

### Requirement 6: Reader Page UX Refinement

**User Story:** As a reader, I want the reader interface to be visually calm and distraction-free so that I stay immersed in the story.

#### Acceptance Criteria

1. THE ReaderPage SHALL render the cinematic content area centered with `max-width: 720px` and horizontal auto margins.
2. THE ReaderPage SHALL transition between cinematic blocks using Framer_Motion with a `opacity: 0 → 1` fade over `300ms`.
3. WHEN a chapter change occurs, THE ReaderPage SHALL execute a horizontal slide transition (`x: 40px → 0`) using Framer_Motion over `300ms` with `cubic-bezier(0.4, 0, 0.2, 1)`.
4. THE ReaderHeader SHALL remain sticky, rendered with Glassmorphism, and SHALL collapse to a minimal height of `48px` when the user scrolls down more than `80px`.
5. THE ReaderFooter SHALL display reading-progress percentage and estimated minutes remaining, rendered in `--on-surface-variant` using `--md-sys-type-label-medium` scale tokens.
6. WHEN Theater Mode is active, THE CinematicRenderer SHALL fade in each paragraph sequentially, with delay calculated as `(wordCount / 250) * 60 * 1000 / 4` milliseconds (quarter reading-speed pacing), capped at `4000ms` per block.

---

### Requirement 7: AppSettings UX Cohesion

**User Story:** As a user configuring API keys and preferences, I want a settings overlay that is well-organized, readable, and consistent with the rest of the app's visual language.

#### Acceptance Criteria

1. THE AppSettings SHALL organize settings into named sections: AI Providers, Reading Preferences, Accessibility, and About.
2. WHEN a section is expanded, THE AppSettings SHALL animate section content entry with a height-based Framer_Motion expand (`height: 0 → auto`) over `200ms`.
3. THE AppSettings SHALL render each provider card using Glassmorphism, displaying provider name, connection status indicator, and API key input field.
4. WHEN an API key is successfully validated, THE AppSettings SHALL display a status badge using `--md-sys-color-secondary` (success state).
5. IF an API key fails validation, THEN THE AppSettings SHALL display the error using `--error` token and a descriptive inline message.
6. THE PreferencesSection SHALL expose font-family selection, line-height slider, and dyslexia toggle, each using semantic form controls with explicit `aria-label` attributes.

---

### Requirement 8: Responsive Layout Compliance

**User Story:** As a mobile user, I want all views to reflow gracefully on narrow viewports, so that I can read and configure the app on any device.

#### Acceptance Criteria

1. THE LandingPage SHALL reflow to a single-column layout at viewport widths below `768px`.
2. THE ReaderPage SHALL hide sidebar panels by default at viewport widths below `1024px` and SHALL expose them via a toggle button.
3. THE AppSettings SHALL render as a full-screen overlay at viewport widths below `768px` rather than a centered modal.
4. THE Design_System SHALL provide responsive spacing overrides in `src/css/responsive.css` using `min()` and `clamp()` functions rather than fixed breakpoint overrides where applicable.
5. WHEN the viewport width is below `480px`, THE Typography_Scale SHALL reduce display-large font-size to `clamp(32px, 8vw, 57px)` using a CSS `clamp()` expression.

---

### Requirement 9: Accessibility Baseline

**User Story:** As a user with accessibility needs, I want the redesigned UI to meet WCAG 2.1 AA contrast and keyboard navigation standards, so that InfinityCN is usable regardless of my abilities.

#### Acceptance Criteria

1. THE Design_System SHALL ensure text rendered on `--background` achieves a minimum contrast ratio of 4.5:1 against `--on-background`.
2. THE Design_System SHALL ensure interactive control labels achieve a minimum contrast ratio of 3:1 against their backgrounds.
3. THE ReaderPage, LandingPage, and AppSettings SHALL implement focus-visible outlines using `outline: 2px solid var(--primary)` on all keyboard-focused elements.
4. THE AppSettings SHALL trap focus within the modal overlay when it is open, returning focus to the triggering element on close.
5. WHEN the dyslexia mode is enabled, THE Typography_Scale SHALL increase word-spacing by `0.15em` across all prose containers.
6. THE LandingPage SHALL include ARIA landmark roles (`<main>`, `<nav>`, `<section>`) with descriptive `aria-label` attributes on each landmark.

---

### Requirement 10: Graphify Graph Panel — Core Display

**User Story:** As a developer, I want to view the Graphify dependency graph and its community breakdown inside the app, so that I can navigate the codebase structure without switching tools.

#### Acceptance Criteria

1. THE Graph_Panel SHALL be rendered as a named section within AppSettings, visible only when `import.meta.env.DEV` is `true`.
2. THE Graph_Panel SHALL read and parse `graphify-out/graph.json` at module load time and SHALL display a summary: total node count, edge count, and community count.
3. WHEN `graphify-out/graph.json` is absent or malformed, THE Graph_Panel SHALL display a fallback message directing the developer to run `graphify update .` rather than throwing an unhandled error.
4. THE Graph_Panel SHALL list all non-thin Communities by name with their cohesion score and node count, sorted by cohesion score descending.
5. THE Graph_Panel SHALL highlight the top 10 God_Nodes by edge count, rendering each as a clickable chip styled with `--primary-gradient`.
6. WHEN a God_Node chip is clicked, THE Graph_Panel SHALL expand an inline detail view listing the node's top 5 connected communities and their edge types.

---

### Requirement 11: Graphify Integration with Planning Docs

**User Story:** As a developer, I want Graphify communities to be linked to relevant Planning_Docs, so that I can navigate from a graph cluster directly to the corresponding architecture or spec document.

#### Acceptance Criteria

1. THE Graph_Panel SHALL maintain a static mapping between Graphify Community labels and Planning_Doc file paths (e.g., the engine communities map to ARCHITECTURE.md; the UI communities map to UI_UX_DESIGN.md).
2. WHEN a Community card is expanded, THE Graph_Panel SHALL display a list of linked Planning_Docs as clickable references.
3. WHEN a Planning_Doc reference is clicked, THE Graph_Panel SHALL open the file path in the user's default system handler via an `<a href>` with `target="_blank" rel="noopener noreferrer"`.
4. THE Graph_Panel SHALL parse `graphify-out/GRAPH_REPORT.md` to extract the "Suggested Questions" section and render each question as an expandable FAQ item.
5. WHEN the graph data is stale (the `Built from commit` hash in GRAPH_REPORT.md does not match the current `git rev-parse HEAD` output), THE Graph_Panel SHALL display a staleness banner using `--accent` token color.

---

### Requirement 12: Graphify Panel — Graph Freshness Check

**User Story:** As a developer, I want to know when the Graphify graph is out of date relative to the current commit, so that I trust the data I am navigating.

#### Acceptance Criteria

1. WHEN the Graph_Panel mounts, THE Graph_Panel SHALL compare the commit hash embedded in `graphify-out/GRAPH_REPORT.md` against the HEAD commit hash exposed via a build-time `import.meta.env.VITE_GIT_COMMIT` variable.
2. WHEN the hashes match, THE Graph_Panel SHALL display a "Graph is current" badge using `--md-sys-color-secondary`.
3. WHEN the hashes differ, THE Graph_Panel SHALL display a "Graph may be stale — run `graphify update .`" warning banner using `--md-sys-color-tertiary`.
4. IF `VITE_GIT_COMMIT` is undefined (e.g. in CI preview builds), THEN THE Graph_Panel SHALL suppress the staleness check and display a neutral "Commit unknown" label rather than a false warning.
5. THE Graph_Panel SHALL expose a manual "Refresh" trigger that re-reads `graph.json` from the filesystem without requiring a full page reload, using a dynamic `import()` or `fetch()` of the local file URL.

---

### Requirement 13: Framer Motion Animation Consistency

**User Story:** As a developer, I want all animations across the redesigned UI to use a consistent easing curve and duration vocabulary, so that the app feels unified rather than piecemeal.

#### Acceptance Criteria

1. THE Design_System SHALL define three named transition durations as tokens: `--transition-fast` (`100ms`), `--transition-normal` (`200ms`), and `--transition-slow` (`350ms`), each using `cubic-bezier(0.4, 0, 0.2, 1)`.
2. THE Framer_Motion entry animations on LandingPage SHALL use `duration: 0.5` and `ease: [0.4, 0, 0.2, 1]` as their base.
3. THE Framer_Motion page transition in AppRouter SHALL use `duration: 0.3` with `ease: [0.4, 0, 0.2, 1]`.
4. WHEN `prefers-reduced-motion` media query is matched, THE Framer_Motion animations SHALL set `duration: 0` and `opacity` SHALL remain at `1` to prevent flicker for motion-sensitive users.
5. THE Graph_Panel entry animation SHALL use Framer_Motion with `duration: 0.2` and `ease: [0.4, 0, 0.2, 1]`, consistent with the AppSettings section expand pattern.
