"use client";

/* ---------- line-art book stack (CTA illustration) ---------- */
export function BookStack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 170"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* bottom book */}
      <rect x="28" y="126" width="142" height="22" rx="3" />
      <path d="M42 126v22" />
      <path d="M156 131h9M156 135h9M156 139h9" opacity="0.55" />
      {/* middle book */}
      <rect x="40" y="104" width="128" height="22" rx="3" />
      <path d="M52 104v22" />
      <path d="M150 109h9M150 113h9M150 117h9" opacity="0.55" />
      {/* top book */}
      <rect x="34" y="82" width="120" height="22" rx="3" />
      <path d="M46 82v22" />
      <path d="M138 87h9M138 91h9M138 95h9" opacity="0.55" />
      {/* bookmark ribbon over the edge */}
      <path d="M96 82v16l5-4 5 4v-16" />
      {/* leaning book */}
      <path d="M196 148V46l-16-12v102z" />
      <path d="M188 43v98" opacity="0.55" />
    </svg>
  );
}

/* ---------- instrument diagrams (hairline charts, no ornament) ---------- */

/** Meridian's routing: one question in, the free tier surveyed, the best
 *  model chosen, one answer out. Drawn like a survey chart. */
export function RouteDiagram() {
  return (
    <svg
      viewBox="0 0 280 92"
      className="w-full h-auto"
      fill="none"
      strokeWidth="1.4"
      aria-hidden
    >
      {/* the question enters */}
      <path d="M15 52h44" className="stroke-mist-600" />
      <circle cx="12" cy="52" r="3" className="fill-mist-400" />
      <text x="6" y="72" className="fill-mist-600 font-mono" fontSize="7.5" letterSpacing="1.5">
        ASK
      </text>
      {/* the free tier, surveyed */}
      <path d="M59 52C70 52 76 20 91 20" className="stroke-mist-600" />
      <path d="M59 52h32" className="stroke-mist-700" strokeDasharray="3 3" />
      <path d="M59 52C70 52 76 84 91 84" className="stroke-mist-700" />
      <circle cx="95" cy="52" r="2.5" className="fill-ink-800 stroke-mist-600" />
      <circle cx="95" cy="84" r="2.5" className="fill-ink-800 stroke-mist-600" />
      <text x="104" y="88" className="fill-mist-600 font-mono" fontSize="7.5" letterSpacing="1.5">
        FREE TIER
      </text>
      {/* the best one is chosen */}
      <circle cx="95" cy="20" r="3.4" className="fill-gold-400 stroke-gold-200" />
      <path d="M99 20C132 20 146 52 172 52" className="stroke-gold-500" />
      <text x="104" y="15" className="fill-gold-400 font-mono" fontSize="7.5" letterSpacing="1.5">
        BEST FREE MODEL
      </text>
      {/* one answer out */}
      <path d="M175 52h80" className="stroke-gold-500" />
      <circle cx="268" cy="52" r="3" className="fill-mist-400" />
      <text x="272" y="72" textAnchor="end" className="fill-mist-600 font-mono" fontSize="7.5" letterSpacing="1.5">
        ANSWER
      </text>
    </svg>
  );
}

/** Anchor's promise: the network line breaks, the work line stays —
 *  held by the anchor at the splice. */
export function HeldLineDiagram() {
  return (
    <svg
      viewBox="0 0 280 92"
      className="w-full h-auto"
      fill="none"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
    >
      {/* the network arrives, then breaks */}
      <path d="M12 46h70" className="stroke-mist-600" />
      <text x="8" y="66" className="fill-mist-600 font-mono" fontSize="7.5" letterSpacing="1.5">
        NETWORK
      </text>
      <path d="M96 38l-10 16M108 38l-10 16" className="stroke-danger-400/80" />
      <text x="86" y="24" className="fill-danger-400/80 font-mono" fontSize="7.5" letterSpacing="1.5">
        OFFLINE
      </text>
      {/* the anchor, spliced into the break */}
      <circle cx="118" cy="14" r="5" className="stroke-ok-400" />
      <path d="M118 19v27" className="stroke-ok-400" />
      <path d="M109 24h18" className="stroke-ok-400" />
      <path d="M104 34c3 10 8 14 14 14s11-4 14-14" className="stroke-ok-400" />
      {/* the line continues, held */}
      <path d="M118 46h142" className="stroke-ok-400" />
      <circle cx="268" cy="46" r="3" className="fill-mist-400" />
      <text x="272" y="66" textAnchor="end" className="fill-ok-400/80 font-mono" fontSize="7.5" letterSpacing="1.5">
        WORK CONTINUES
      </text>
    </svg>
  );
}
