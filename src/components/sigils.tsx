"use client";

import { cx } from "../lib/utils";

/* Hand-drawn line-art sigils for the room's residents.
   All marks share one pen: 1.5px strokes, round caps, currentColor —
   engraved-plate style, never filled blobs, never clip-art.
   (Tiny eye / stone / sun accents are the one deliberate exception:
   a filled point reads as ink, not as a shape.) */

type SigilProps = { className?: string };

function Sigil({
  className,
  children,
  viewBox = "0 0 24 24",
}: SigilProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* Luma — the reading lamp: a hanging lamp drawn down by its cord,
   shedding two rays onto an open book below. The light that sits
   over whoever reads late. */
export function LumaSigil({ className }: SigilProps) {
  return (
    <Sigil className={className}>
      {/* cord */}
      <path d="M12 1.6v2.4" />
      {/* shade dome + rim */}
      <path d="M6.7 9a5.3 5.3 0 0 1 10.6 0" />
      <path d="M6.7 9h10.6" />
      {/* lit bulb */}
      <circle cx="12" cy="10.7" r="1.2" fill="currentColor" stroke="none" />
      {/* rays onto the page */}
      <path d="M8.7 12.6l-1.8 1.8" />
      <path d="M15.3 12.6l1.8 1.8" />
      {/* the open book beneath */}
      <path d="M4.3 19.7c2.7-2.5 5-2.5 7.7 0" />
      <path d="M12 19.7c2.7-2.5 5-2.5 7.7 0" />
      <path d="M12 18.2v1.5" />
    </Sigil>
  );
}

/* Ouro — the circle serpent: a full loop with the head meeting the
   tail at the crown, and the studied text held at the center as a
   small stone. Each pass around, another understanding. */
export function OuroSigil({ className }: SigilProps) {
  return (
    <Sigil className={className}>
      {/* the loop — one long arc leaving a gap at the crown */}
      <path d="M9.7 4.6a8.3 8.3 0 1 0 4.6 0" />
      {/* open jaw at the head (right end of the gap) */}
      <path d="M14.3 4.6l2-.9" />
      <path d="M14.3 4.6l1.4 1.7" />
      {/* eye */}
      <circle cx="15.2" cy="5.1" r="0.55" fill="currentColor" stroke="none" />
      {/* tail flick across the gap (left end) */}
      <path d="M9.7 4.6l-1.8-.7" />
      {/* the stone at the heart of the loop */}
      <rect
        x="10.6"
        y="10.6"
        width="2.8"
        height="2.8"
        transform="rotate(45 12 12)"
        fill="currentColor"
        stroke="none"
      />
    </Sigil>
  );
}

/* Ankaa — the quill and the inkwell: a feather that was once a wing,
   now taking dictation, leaning over the well it writes from. */
export function AnkaaSigil({ className }: SigilProps) {
  return (
    <Sigil className={className}>
      {/* shaft — a long diagonal lean toward the well */}
      <path d="M16.9 3.7C13.5 7.1 10.3 11.3 7.7 16" />
      {/* barbs */}
      <path d="M12.4 10.2l-2.3-.5" />
      <path d="M14.3 8.1l-2.3-.5" />
      <path d="M16.2 6l-2.3-.5" />
      {/* nib flare, hovering at the well's mouth */}
      <path d="M7.7 16l-1.8-.7" />
      <path d="M7.7 16l-.3 1.8" />
      {/* the inkwell */}
      <path d="M12 17.9h5.6" />
      <path d="M12 17.9l.9 3.4" />
      <path d="M17.6 17.9l-.9 3.4" />
      <path d="M12.9 21.3h3.8" />
    </Sigil>
  );
}

/* Meridian — the measured sphere: a globe ruled by two great
   circles, cut by the horizon, the sun standing at the apex of the
   meridian ring — the line the router measures every model against. */
export function MeridianSigil({ className }: SigilProps) {
  return (
    <Sigil className={className}>
      {/* the sphere */}
      <circle cx="12" cy="12" r="8.6" />
      {/* the meridian ring (vertical great circle) */}
      <ellipse cx="12" cy="12" rx="3.3" ry="8.6" />
      {/* the equatorial ring */}
      <ellipse cx="12" cy="12" rx="8.6" ry="3.3" />
      {/* horizon, carried past the sphere's edge */}
      <path d="M2.1 12h19.8" />
      {/* the sun at the apex of the meridian */}
      <circle cx="12" cy="3.4" r="1.3" fill="currentColor" stroke="none" />
    </Sigil>
  );
}

/* Anchor — holds when the line breaks: the offline engine that keeps
   the room lit with no network at all. A stock, a ring, a diamond
   stopper on the shank, and arms sweeping into barbed flukes. */
export function AnchorSigil({ className }: SigilProps) {
  return (
    <Sigil className={className}>
      {/* ring */}
      <circle cx="12" cy="4.7" r="2" />
      {/* shank */}
      <path d="M12 6.7v12.4" />
      {/* stock */}
      <path d="M7.2 9.2h9.6" />
      {/* diamond stopper on the shank — the hold point */}
      <rect
        x="10.8"
        y="10.9"
        width="2.4"
        height="2.4"
        transform="rotate(45 12 12.1)"
        fill="currentColor"
        stroke="none"
      />
      {/* arms */}
      <path d="M4.7 14.3c.7 4.1 3.6 6.3 7.3 6.3s6.6-2.2 7.3-6.3" />
      {/* flukes */}
      <path d="M4.7 14.3 3 12.6" />
      <path d="M4.7 14.3l2.2-.5" />
      <path d="M19.3 14.3l1.7-1.7" />
      <path d="M19.3 14.3l-2.2-.5" />
    </Sigil>
  );
}

/* A hairline with a small diamond at its center — the rule
   stamped under a spine title, reused as a section ornament. */
export function DiamondRule({ className }: SigilProps) {
  return (
    <span className={cx("flex items-center gap-2", className)} aria-hidden>
      <span className="h-px flex-1 bg-current opacity-30" />
      <svg viewBox="0 0 8 8" className="h-1.5 w-1.5 shrink-0" aria-hidden>
        <rect
          x="1.7"
          y="1.7"
          width="4.6"
          height="4.6"
          transform="rotate(45 4 4)"
          fill="currentColor"
        />
      </svg>
      <span className="h-px flex-1 bg-current opacity-30" />
    </span>
  );
}
