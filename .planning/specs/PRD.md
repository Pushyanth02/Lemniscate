# Product Requirements Document (PRD) — InfinityCN

**Document Version:** 1.0.0  
**Project Version:** 15.0.0  
**Status:** Approved  
**Author:** Product Architect

---

## 1. Product Vision & Value Proposition

Traditional digital reading apps treat books as static digital paper. **InfinityCN** treats books as living cinematic experiences. By analyzing narrative pace, emotional shifts, and scene structures, InfinityCN automatically converts static prose into a screenplay-style flow with synchronized visual effects, pacing cues, and adaptive ambient audio.

### Core Value Pillars:
*   **The Story is All That Remains:** The UI should dissolve during reading, leaving only the narrative.
*   **Zero-friction Entry:** Immersive reading should work out-of-the-box, with no mandatory cloud accounts or paid API keys.
*   **Empowered Writers & Readers:** Writers gain diagnostic pacing tools (tension arcs, readability metrics); readers gain immersive entertainment.

---

## 2. User Personas

### 2.1 The Cinematic Reader (Aria)
*   **Bio:** 22-year-old student who struggles to stay focused during long novels.
*   **Needs:** Visual pacing cues, dramatic spacing, ambient audio, and dyslexia-friendly typography.
*   **Goals:** Read longer, feel more emotionally connected to the plot, and easily discover new titles.

### 2.2 The Analytical Creator (Devon)
*   **Bio:** Independent fiction author looking to improve the pacing of their draft manuscript.
*   **Needs:** Detailed text diagnostics, tension arc visualization, dialogue ratios, and scene-break checkers.
*   **Goals:** Upload raw drafts, inspect where the narrative drags (flat zones), and refine pacing.

### 2.3 The Offline Traveler (Kenji)
*   **Bio:** Professional who reads during daily commutes and flights without internet access.
*   **Needs:** Reliable offline capability, low power consumption, and full local parsing.
*   **Goals:** Import books, analyze them entirely offline, and sync reading progress later when network returns.

---

## 3. Product Features & Requirements

### 3.1 Feature Group A: Document Processing & Intake
*   **FR-A1: Multi-format Upload.** The app must process PDF, EPUB, DOCX, PPTX, and TXT files.
*   **FR-A2: Zero-Key Heuristic Engine.** Users can choose to run the extraction and structural scan with free local algorithms instead of requiring external AI.
*   **FR-A3: Scanned Document OCR.** If a PDF is scanned, the app must run local WASM OCR for the first 5 pages, alerting the user of the page limit.

### 3.2 Feature Group B: The Cinematic Reader UI (Theater Mode)
*   **FR-B1: Dual Presentation.** The user can toggle between the "Original" text flow and the "Cinematified" screenplay layout.
*   **FR-B2: Pacing Adjustments.** The reader must support adjustable transitions, font-sizes, and custom line heights.
*   **FR-B3: Audio Immersion.** Procedural audio soundscapes synthesized directly in the browser based on emotion scores.
*   **FR-B4: Cinematic Depth Indicators.** Live stats showing active scene markers, tension indicators, and dominant emotions.

### 3.3 Feature Group C: Library & Discovery
*   **FR-C1: Library Workspace.** Display a shelf of processed books with progress bars and quick-jump bookmark links.
*   **FR-C2: Universal Discovery.** A search drawer aggregating titles across novels, manga, manhwa, and manhua with content filtering tags.
*   **FR-C3: In-app Feedback.** A feedback overlay that captures user suggestions and logs them to a reviewable local history.

---

## 4. Success Metrics

To ensure InfinityCN delivers on its value proposition, we monitor the following metrics:

| Metric | Target | Verification Method |
| :--- | :--- | :--- |
| **Pacing Engagement** | +25% reading session duration compared to static text | Telemetry snapshots |
| **Pipeline Success Rate** | > 98% successful parse rate for files under 50MB | Local error reporting |
| **WASM Startup Speed** | < 2.0 seconds initialization of tesseract/onnx | Performance analytics |
| **Offline Retention** | 100% reading capability when offline | Offline automated tests |

---

## 5. Release Gates

A feature release is considered production-ready only when it meets the following gates:

1.  **Strict Type Check:** TypeScript compile completes with zero warnings or errors. No instances of `any`.
2.  **Vitest Integrity:** The full unit test suite (800+ test cases) passes successfully.
3.  **Mobile UX Performance:** Frame rates do not dip below 55fps during reader transitions on simulated mobile viewports.
4.  **Zero API Key Guarantee:** The entire pipeline must complete successfully without configured API keys by utilizing offline heuristics.
5.  **Aesthetics Audit:** Consistently uses Velvet Noir styling variables; no raw unstyled layout shifts or legacy CSS namespaces.
