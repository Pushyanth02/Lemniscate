# UI/UX Design System — InfinityCN

**Document Version:** 1.0.0  
**Project Version:** 15.0.0  
**Status:** Approved  
**Design System:** Velvet Noir

---

## 1. Typography & Readability

Typography in InfinityCN is structured to prioritize reading comfort, cognitive focus, and accessibility.

### Typography Hierarchy:
*   **Hero Headings:** `Outfit` (sans-serif), bold, character tracking set to `-0.02em` for premium cinematic styling.
*   **Body & Reading Prose:** `Inter` (sans-serif) for high legibility, or `OpenDyslexic` when the dyslexia-friendly setting is active.
*   **System UI Elements:** `Inter` (sans-serif) with standard tracking.

### Reading Layout Guidelines:
*   **Prose Container Max-Width:** `720px` (optimized to prevent eye fatigue by limiting line length to 50-75 characters).
*   **Line-Height:** Configurable from `1.5` (default) up to `2.2` (for cognitive readability).
*   **Letter-Spacing:** Standard `0.01em` (increases automatically to `0.05em` when in accessibility mode).

---

## 2. Velvet Noir Design Tokens

All CSS styling must adhere to the Velvet Noir token system. Avoid custom or hardcoded hex colors. Use CSS custom variables directly:

```css
:root {
  /* Color Palette */
  --background: #09090b;       /* Pure dark background */
  --surface: #18181b;          /* Raised dark surfaces */
  --surface-hover: #27272a;    /* Hover interactions */
  --border: #27272a;           /* Clean dividers */
  
  --primary: #8b5cf6;          /* Deep violet accent */
  --primary-hover: #a78bfa;    /* Brightened violet hover */
  --secondary: #10b981;        /* Emerald green success/dialogue */
  --accent: #f59e0b;           /* Amber caution/tension alert */
  
  --on-background: #fafafa;    /* High contrast text */
  --on-surface: #f4f4f5;       /* Card text */
  --on-surface-muted: #a1a1aa; /* Secondary label colors */

  /* Glassmorphism Defaults */
  --glass-backdrop-blur: blur(12px);
  --glass-bg: rgba(24, 24, 27, 0.75);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);

  /* Spacing System */
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-3: 0.75rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --spacing-12: 3rem;
}
```

---

## 3. Motion & Micro-Animations

Animations are applied with restraint to enhance pacing and emotion without causing visual distraction.

*   **Page Transitions:** Horizontal slide/fade transitions driven by Framer Motion.
    *   *Curve:* `[0.4, 0, 0.2, 1]` (standard ease-in-out).
    *   *Duration:* `300ms`.
*   **Cinematified Text Pacing:** In Theater Mode, paragraphs fade in sequentially.
    *   *Delay:* Calculated dynamically based on word count and tension score (average reading speed: 250 WPM).
*   **Button Hover States:** Subtle scale-up (`scale: 1.02`) and color transition.
    *   *Duration:* `150ms` linear ease.

---

## 4. Layout Templates & Themes

### 4.1 Theater Mode (Dark Theme)
*   **Background:** `--background` (`#09090b`).
*   **Atmosphere:** Glassmorphic sidebars and reading controls overlaying a dynamic ambient canvas.
*   **Layout:** Centered reader container with responsive sidebar widgets.

### 4.2 Library Mode (System-Aware Theme)
*   **Atmosphere:** Structured grid displaying book cards, statistics, and metadata.
*   **Layout:** Top navigation bar with multi-source search filters and grid/list toggles.

---

## 5. Accessibility Implementation

*   **Keyboard Traps:** Focus traps implemented inside modals (e.g. settings overlay) to ensure full keyboard navigation.
*   **Dyslexia Option:** Toggles typography style to `OpenDyslexic` and increases word-spacing by 15%.
*   **Screen Readers:** Use semantic HTML5 landmarks (`<main>`, `<article>`, `<nav>`, `<aside>`) with explicit `aria-label` tags for status messages.
