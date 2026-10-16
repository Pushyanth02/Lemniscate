import type { DocumentRow } from "./types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function uid(prefix = "id"): string {
  // crypto.randomUUID when available — a collision would silently overwrite
  // an existing row (ids are IndexedDB primary keys). The Math.random scheme
  // remains only as a legacy fallback for environments without Web Crypto.
  const cryptoObj =
    typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------------- deterministic cover gradients ---------------- */

/* Deterministic cover gradients — drawn from actual library cloth bindings:
   moss, ember, umber, rust, pine, oxblood, buckram ochre, viridian. */
const COVER_FAMILIES: [string, string, string][] = [
  ["#0f1a12", "#2e5339", "#cfe3b0"], // moss archive
  ["#241108", "#7a3b1e", "#e0be77"], // ember lamplight
  ["#1a1410", "#4a3020", "#d9b98a"], // umber & vellum
  ["#1f0f0e", "#63312a", "#e5a37c"], // rust candle
  ["#12211a", "#2c4a3a", "#a8c6a4"], // pine library
  ["#251214", "#5c2430", "#d99a9a"], // oxblood binding
  ["#211b10", "#5c4a23", "#ecd9a8"], // buckram ochre
  ["#0f1c1e", "#1f4a48", "#8fc6bd"], // viridian cloth
];

export function coverGradient(seed: string): string {
  const h = hashStr(seed);
  const fam = COVER_FAMILIES[h % COVER_FAMILIES.length];
  const angle = 115 + (h % 90);
  return `linear-gradient(${angle}deg, ${fam?.[0] ?? "#0a1e24"} 0%, ${fam?.[1] ?? "#1e4d5a"} 58%, ${fam?.[2] ?? "#8fd0c6"} 130%)`;
}

export function coverInitial(title: string): string {
  const word =
    title
      .trim()
      .split(/\s+/)
      .find((w) => /[a-zA-Z0-9]/.test(w)) ?? "L";
  return (
    word
      .replace(/^[^a-zA-Z0-9]+/, "")
      .charAt(0)
      .toUpperCase() || "L"
  );
}

/* ---------------- formatting ---------------- */

export function fmtNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtWords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M words`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k words`;
  return `${n} words`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function fmtClock(totalSec: number): string {
  const t = Math.max(0, totalSec);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export function sortDocs(rows: DocumentRow[], mode: string): DocumentRow[] {
  const arr = [...rows];
  const byMode = (a: DocumentRow, b: DocumentRow): number => {
    switch (mode) {
      case "title":
        return a.title.localeCompare(b.title);
      case "size":
        return b.byteSize - a.byteSize;
      case "progress":
        return b.readingProgress - a.readingProgress;
      case "recent":
      default:
        return (b.lastReadAt ?? b.createdAt) - (a.lastReadAt ?? a.createdAt);
    }
  };
  /* starred documents stay pinned at the top of every ordering until unstarred */
  return arr.sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || byMode(a, b),
  );
}

export function download(
  filename: string,
  text: string,
  type = "application/json",
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Filesystem-safe slug for export filenames: "Ada Lovelace!" → "ada-lovelace". */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clamp a number between bounds. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
