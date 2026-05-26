# Technical Requirements Document (TRD) — InfinityCN

**Document Version:** 1.0.0  
**Project Version:** 15.0.0  
**Status:** Approved  
**Target Architecture:** React 19 / Vite 8 / Dexie / Web Workers / WASM

---

## 1. Modular Processing Pipeline

The core engine implements a strict 7-stage pipeline. Execution must pass sequentially through these stages without skipping steps or mixing concerns.

```mermaid
flowchart LR
    Input[Text/File Input] --> S1[1. Structural Scan]
    S1 --> S2[2. Scene Segmentation]
    S2 --> S3[3. Narrative Analysis]
    S3 --> S4[4. Emotion + Tension Mapping]
    S4 --> S5[5. Character Tracking]
    S5 --> S6[6. Cinematization]
    S6 --> S7[7. Runtime Rendering]
    S7 --> UI[React Viewport]
```

### Pipeline Phase Technical Details:

1.  **Structural Scan:** Parses file headers and patterns to index chapter outlines and heading indices.
2.  **Scene Segmentation:** Analyzes scene breaks using typographic markers (e.g., `***`, `---`, empty lines) combined with temporal/spatial transition heuristics.
3.  **Narrative Analysis:** Computes readability (Flesch-Kincaid), pacing scores, vocabulary diversity, and reading duration estimates.
4.  **Emotion + Tension Mapping:** Scores sentence-level emotional vectors (joy, fear, sadness, suspense, anger, surprise) using an AFINN-inspired lexicon. Computes rolling tension averages.
5.  **Character Tracking:** Extracts entity names using capital letter clusters, tracks dialogue tags, and identifies character context groupings.
6.  **Cinematization:** Compiles screenplay metadata annotations including camera placement (`[CAMERA: ...]`), sound effects (`[SFX: ...]`), ambient backdrops (`[AMBIENCE: ...]`), and transition cuts (`[TRANSITION: ...]`).
7.  **Runtime Rendering:** Streamer processes structured segments and renders dynamically based on the active transition delays and visual settings.

---

## 2. AI Provider Orchestration

InfinityCN integrates with seven distinct external AI providers and one local execution fallback.

### Supported Providers:
*   **Gemini 2.5 Flash** (Remote API)
*   **OpenAI GPT-4o-mini** (Remote API)
*   **Claude 3.5 Sonnet** (Remote API)
*   **Groq Llama 3.3 70B** (Remote API)
*   **DeepSeek** (Remote API)
*   **Ollama** (Local Network Endpoint)
*   **Chrome AI** (Local Gemini Nano API)

### Management, Rate-Limiting & Retries:
*   **Managed Client Wrapper:** All AI calls must route through `src/lib/ai/index.ts` utilizing `callAIManaged()` or `callByTask()`.
*   **Cache Policy:** Prompts and outputs are stored locally in the Dexie-based cache. Duplicate requests return immediately from storage.
*   **Retry Logic:** Failed requests trigger an exponential backoff retry loop (maximum of 3 retries: 500ms, 1500ms, 4500ms).
*   **Fallback Sequence:** If all retries fail, or if no API keys/network connections are available, the orchestrator redirects to the **Local Offline Heuristic Processor**.

---

## 3. Local Machine Learning & Embeddings

To support semantic search and content continuity offline, InfinityCN embeds a client-side vector search engine.

*   **WASM Model Engine:** `@xenova/transformers` runs in-browser utilizing the ONNX Runtime Web configuration.
*   **Embedding Model:** `all-MiniLM-L6-v2` (quantized format, ~23MB download size).
*   **Lifecycle Control:** The model is lazy-loaded upon the first reader session or semantic search. Memory is managed to prevent runtime crashes by cleaning up embedding tensors immediately post-calculation.
*   **Dexie Vector Storage:** Calculated float arrays are saved inside Dexie index maps and queried using cosine similarity search.

---

## 4. Offline Fallback Heuristics

When AI connections are unavailable, a fast programmatic parser maintains basic functionality:
*   **Chapter/Heading Regex:** Pattern matching for numeric and roman headings (e.g. `/^(chapter|part|section)\s+\w+/i`).
*   **Lexicon-based Emotion/Sentiment:** Uses the built-in AFINN lexicon mapped into memory, supporting negation lookahead (e.g., "not bad") and intensifiers (e.g., "very angry").
*   **Sentence-Length Tension Arc:** Approximates tension based on sentence length variance; shorter sentences indicate higher suspense.

---

## 5. Background Operations & Memory Safety

To maintain 60fps UI performance, heavy computations are offloaded:
*   **Web Workers:** PDF text parsing (`pdfjs-dist`) and OCR calculations (`Tesseract.js`) execute in background worker threads.
*   **Dynamic Chunks:** Dependencies are dynamically loaded via ES dynamic imports:
    ```typescript
    const pdfjs = await import('pdfjs-dist');
    const tesseract = await import('tesseract.js');
    ```
*   **Memory Release:** Clean up local Object URLs and revoke Blob objects immediately when the current file processing flow finishes.
