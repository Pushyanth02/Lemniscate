import {
  Shield,
  DownloadSimple,
  BookOpen,
  Cpu,
  UserCircle,
  Palette,
} from "@phosphor-icons/react";
import type { ReaderFontId } from "../../lib/types";
import { ACCENTS } from "../../lib/accents";

/* Shared Settings constants: the section registry (nav + routing ids),
   the accent catalog (deduplicated here from lib/accents — the same list
   drives the reader's accent picker), and the reader typeface catalog. */
export const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserCircle },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "typography", label: "Typography", icon: BookOpen },
  { id: "access", label: "Accessibility", icon: Shield },
  { id: "ai", label: "AI companions", icon: Cpu },
  { id: "storage", label: "Import & data", icon: DownloadSimple },
  { id: "about", label: "About", icon: BookOpen },
];

/* The app accent picker renders the shared catalog (lib/accents.ts);
   swatch dots mirror the live `--acc` values. */
export const APP_ACCENTS = ACCENTS;

/* Monogram swatches: every accent pigment plus plain mist. */
export const MONOGRAM_COLORS = [...ACCENTS.map((a) => a.color), "#c6c6c1"];

export const FONT_OPTIONS: { value: ReaderFontId; label: string }[] = [
  { value: "literata", label: "Literata" },
  { value: "garamond", label: "EB Garamond" },
  { value: "spectral", label: "Spectral" },
  { value: "sourceserif", label: "Source Serif" },
  { value: "georgia", label: "Georgia" },
  { value: "bookerly", label: "Bookerly / Charter" },
  { value: "baskerville", label: "Baskerville" },
  { value: "palatino", label: "Palatino" },
];
