import type { ComponentType } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  FileText,
  FilmSlate,
  Crosshair,
  TextAa,
  ChatText,
  Pen,
  Bookmark,
  Highlighter,
} from "@phosphor-icons/react";
import {
  AnchorSigil,
  AnkaaSigil,
  LumaSigil,
  MeridianSigil,
  OuroSigil,
} from "../../components/sigils";

export const FORMATS = ["PDF", "EPUB", "DOCX", "PPTX", "Markdown", "TXT", "HTML"];

/* ── the companions — engraved plates, one hand-drawn sigil each ── */

export interface BotSpec {
  numeral: string;
  Sigil: ComponentType<{ className?: string }>;
  name: string;
  role: string;
  well: string;
  ink: string;
  line: string;
  tags: string[];
  honest: string;
  span: string;
}

export const BOTS: BotSpec[] = [
  {
    numeral: "I",
    Sigil: LumaSigil,
    name: "Luma",
    role: "Reading companion",
    well: "border-gold-700/50 bg-gold-500/10",
    ink: "text-gold-300",
    line: "A warm, fast voice in the margin. Ask about a passage, a word, a character: answers arrive grounded in the chapter you are on.",
    tags: ["Streams answers", "Grounded in text", "Vocabulary & scenes"],
    honest:
      "Meridian selects the best free model; Anchor takes over instantly if the key is missing or the network is down.",
    span: "lg:col-span-3 lg:row-span-2",
  },
  {
    numeral: "II",
    Sigil: OuroSigil,
    name: "Ouro",
    role: "Study companion",
    well: "border-ouro-500/40 bg-ouro-500/10",
    ink: "text-ouro-300",
    line: "A seminar tutor, not a summary bot. Ask for exactly what you need: a summary, a quiz, a study guide, themes, vocabulary or essay prompts.",
    tags: ["Sourced quizzes", "Study guides", "Whole-text vs. chapter"],
    honest:
      "Meridian picks the ideal free model; Anchor delivers grounded study sets offline.",
    span: "lg:col-span-2",
  },
  {
    numeral: "III",
    Sigil: AnkaaSigil,
    name: "Ankaa",
    role: "Long-form writer",
    well: "border-ankaa-500/40 bg-ankaa-500/10",
    ink: "text-ankaa-300",
    line: "Outlines first, then writes section by section with a live word count, and can continue the very book you are reading as a new chapter.",
    tags: ["~2,500-word drafts", "Continues your book", "Background jobs"],
    honest:
      "Meridian routes to the best free creative model; Anchor writes ~1,800 words on-device if the network is down.",
    span: "lg:col-span-2",
  },
];

/* ── the instruments under the floor ── */

export interface InfraSpec {
  Sigil: ComponentType<{ className?: string }>;
  name: string;
  role: string;
  well: string;
  ink: string;
  line: string;
  ledger: [string, string][];
  honest: string;
}

export const INFRA: InfraSpec[] = [
  {
    Sigil: MeridianSigil,
    name: "Meridian",
    role: "AI model orchestrator",
    well: "border-gold-700/50 bg-gold-500/10",
    ink: "text-gold-300",
    line:
      "Selects and coordinates the best available free models from your connected provider without exposing implementation complexity.",
    ledger: [
      ["catalog", "fetched live from your provider"],
      ["filter", "free tier only — nothing paid is ever chosen"],
      ["rank", "speed for Luma, analysis for Ouro, long-context for Ankaa"],
      ["route", "the best available, with transparent fallback"],
    ],
    honest:
      "You never see the model name; you just get the best output the free tier can give.",
  },
  {
    Sigil: AnchorSigil,
    name: "Anchor",
    role: "Offline continuity engine",
    well: "border-ok-500/40 bg-ok-500/10",
    ink: "text-ok-400",
    line: "Keeps the reading room useful on-device when AI or the network is unavailable.",
    ledger: [
      ["summaries", "extractive, assembled in your browser"],
      ["study sets", "sourced quizzes and guides, offline"],
      ["scenes", "dramatized from the text, offline"],
      ["long-form", "about 1,800 words written on-device"],
    ],
    honest: "No key, no network, no problem.",
  },
];

export const FEATURES: {
  icon: Icon;
  title: string;
  body: string;
  span?: string;
  skin?: "tint" | "gilt";
  chip?: "gilt";
}[] = [
  {
    icon: FileText,
    title: "Real document intake",
    body: "PDF, EPUB, DOCX, PPTX, Markdown, TXT and HTML are parsed on-device into clean, chapter-aware text. Boilerplate stripped, dialogue kept on its own lines, headings numbered in Arabic, Roman or 第X章.",
    span: "lg:col-span-2",
    skin: "tint",
  },
  {
    icon: FilmSlate,
    title: "Scene Atlas",
    body: "Each chapter becomes a set of atlas plates — original prose, mood and cast, and the verified passages that prove every image, side by side.",
    chip: "gilt",
  },
  {
    icon: Crosshair,
    title: "Focus mode",
    body: "Dims the surrounding paragraphs into an ambient concentration mode. Nothing is hidden; everything stays readable.",
  },
  {
    icon: TextAa,
    title: "Book-grade typography",
    body: "Literata, Garamond, Spectral, Source Serif, Georgia, Bookerly, Baskerville and Palatino, with size, line-height, tracking and measure you control.",
  },
  {
    icon: Highlighter,
    title: "Annotations",
    body: "Select any passage, attach a note and a colour. Marks persist and stay legible without harming the page.",
  },
  {
    icon: Bookmark,
    title: "Bookmarks & resume",
    body: "Bookmark a passage with a label; progress saves as you read and the reader returns you exactly where you left off.",
  },
  {
    icon: ChatText,
    title: "Ask the text",
    body: "Luma retrieves from the active chapter and its neighbours. It never blindly sends the whole book to a model.",
  },
  {
    icon: Pen,
    title: "Write in the margins",
    body: "Continue the story, draft an alternate ending or world lore, then weave the result back into the book as its next chapter.",
    skin: "gilt",
  },
];
