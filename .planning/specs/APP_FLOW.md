# Application Flow Map — InfinityCN

**Document Version:** 1.0.0  
**Project Version:** 15.0.0  
**Status:** Approved

---

## 1. File Import & Processing Flow

This flow handles document ingest, format validation, and pipeline tracking.

```mermaid
sequenceDiagram
    actor User
    participant UI as Upload Interface
    participant VAL as Validator / Loader
    participant PP as Processing Pipeline
    participant DB as IndexedDB (Dexie)
    participant RD as Reader View

    User->>UI: Drop/Select File (PDF, EPUB, DOCX, TXT)
    UI->>VAL: Validate File Size (<50MB)
    alt Size > 50MB
        VAL-->>UI: Reject with size limit error message
    else Valid File
        VAL->>UI: Show Processing Overlay (Lock Interface)
        UI->>VAL: Lazy-load parser (pdfjs-dist/fflate)
        VAL->>PP: Run 7-stage processing pipeline
        loop Progress Updates
            PP-->>UI: Dispatch pipeline status metrics
        end
        PP->>DB: Save processed book, chapters, and metadata
        DB-->>RD: Load saved book ID
        UI->>RD: Redirect to active Reader View (Unlock Interface)
    end
```

### Key States:
*   **Intake State:** File selection active; options for heuristic vs. AI-assisted models displayed.
*   **Processing Overlay:** Full-screen blocking modal tracking the 7 processing stages with spinner and stage completion badges.
*   **Success Route:** Seamless slide transition into the reader.

---

## 2. Interactive Reading Modes

Once inside the Reader, the user controls how the narrative is delivered.

```mermaid
graph TD
    RV[Reader View] --> ModeToggle{Mode Selection}
    ModeToggle -->|Original| OL[Original Layout]
    ModeToggle -->|Cinematified| CL[Cinematified Layout]

    OL --> Scroll[Standard Scroll View]
    
    CL --> ImLevel{Immersion Level}
    ImLevel -->|Minimal| MinR[Fade-in Paragraphs only]
    ImLevel -->|Balanced| BalR[Pacing animations + Camera cues]
    ImLevel -->|Cinematic| CinR[Audio Soundscapes + Full Visual SFX + Camera Transitions]
```

### Action Controls:
*   **Original / Cinematified Toggle:** Switches the DOM rendering engine from standard text lists to chronological animators.
*   **Immersion Panel:** Quick drawer overlay adjusting animations, sounds, and accessibility variables.

---

## 3. Sidebar Widgets & Navigation

The Reader View houses interactive drawers that slide in without disrupting reading progress.

```mermaid
graph LR
    Reader[Active Reader] <--> SB{Sidebar Drawer Toggle}
    SB <--> Depth[Cinematic Depth Panel]
    SB <--> Discover[Story Discovery Search]
    SB <--> History[Reading History & Bookmarks]

    Depth --> Metrics[Live Tension Arc & Sentiment Flow]
    Discover --> API[Multi-source API Search Kitsu/MAL/OL]
    History --> Jump[Direct Bookmark Jump Hooks]
```

*   **Cinematic Depth Panel:** Instantly pulls active rendering statistics from the Zustand store.
*   **Story Discovery Drawer:** Renders recommendations with media badges (e.g. Manga, Novel, Manhwa). Filters search queries locally or remotely.

---

## 4. User Feedback Submission

Allows readers to report issues or suggest improvements without leaving their reading page.

*   **Trigger:** Reader footer or panel menu contains a "Feedback" button.
*   **Modal Form:** Collects user feedback text, categorization tags, and rating scores.
*   **Persistence:** Writes to local IndexedDB `feedback` table. Updates the "Feedback History" view in settings instantly.
