/**
 * The app accent catalog — the single source of truth for the Settings
 * picker, the reader's accent channel and the `data-accent` CSS blocks in
 * globals.css. Every member is a muted, desaturated pigment that belongs
 * to the same room; Gilt is the house color.
 *
 * IDs are the persisted `prefs.accent` / `prefs.reader.accent` keys and the
 * `[data-accent="…"]` selectors. Adding an accent = one entry here + one
 * CSS block in globals.css.
 */
export interface AccentSpec {
  id: string;
  /** Human label shown in pickers and toasts. */
  label: string;
  /** The mid-tone swatch / progress-bar hex (mirrors `--acc` roughly). */
  color: string;
}

export const ACCENTS: readonly AccentSpec[] = [
  { id: "gold", label: "Gilt", color: "#d4a853" },
  { id: "ouro", label: "Jade", color: "#569383" },
  { id: "ankaa", label: "Ember", color: "#d5854f" },
  { id: "ok", label: "Moss", color: "#6cbb81" },
  { id: "rose", label: "Rose", color: "#c4838d" },
  { id: "iris", label: "Iris", color: "#a48cc9" },
  { id: "sand", label: "Sand", color: "#cdb98a" },
  { id: "stone", label: "Stone", color: "#a29e92" },
];

/** Every sanctioned accent id, in catalog order. */
export const ACCENT_IDS: readonly string[] = ACCENTS.map((a) => a.id);

/** Is `id` a known accent? (Used to harden stored prefs.) */
export function isAccentId(id: unknown): id is string {
  return typeof id === "string" && (ACCENT_IDS as readonly string[]).includes(id);
}

/** The house Gilt — the fallback for unknown accent ids. */
export const HOUSE_ACCENT = "#d4a853";

/** The accent hex, falling back to the house Gilt for unknown ids. */
export function accentColor(id: string): string {
  return ACCENTS.find((a) => a.id === id)?.color ?? HOUSE_ACCENT;
}
