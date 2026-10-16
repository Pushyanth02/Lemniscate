"use client";

import { useEffect, useState } from "react";
import { getUserId } from "./db";

/* ════════════════════════════════════════════════════════════════
   The commonplace pools — verified lines from renowned authors and
   acclaimed figures on reading, books, attention and the writing
   craft. Rendered wherever the app borrows a voice: the landing
   hero card, the dashboard's floating page, the empty marginalia
   surfaces, and the loading screen.
   ════════════════════════════════════════════════════════════════ */

export interface Quote {
  /** The line itself, verbatim. Verse quotes keep their line breaks. */
  text: string;
  /** The person it belongs to. */
  source: string;
  /** True when the line breaks are part of the work. */
  verse?: boolean;
}

/** Reading, books, attention, the life of the mind. */
export const READING_QUOTES: Quote[] = [
  { text: "Reading is a form of attention.", source: "Susan Sontag" },
  {
    text: "A room without books is like a body without a soul.",
    source: "Cicero",
  },
  {
    text: "Attention is the rarest and purest form of generosity.",
    source: "Simone Weil",
  },
  {
    text: "A book must be the axe for the frozen sea inside us.",
    source: "Franz Kafka",
  },
  {
    text: "I have always imagined that Paradise will be a kind of library.",
    source: "Jorge Luis Borges",
  },
  {
    text: "There is no Frigate like a Book\nTo take us Lands away —",
    source: "Emily Dickinson",
    verse: true,
  },
  {
    text: "Reading furnishes the mind only with materials of knowledge; it is thinking that makes what we read ours.",
    source: "John Locke",
  },
  {
    text: "Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.",
    source: "Francis Bacon",
  },
  {
    text: "It is not that we have a short time to live, but that we waste a lot of it.",
    source: "Seneca",
  },
  {
    text: "The happiness of your life depends upon the quality of your thoughts.",
    source: "Marcus Aurelius",
  },
  {
    text: "It is a serious thing just to be alive on this fresh morning.",
    source: "Mary Oliver",
  },
  {
    text: "A reader lives a thousand lives before he dies. The man who never reads lives only one.",
    source: "George R. R. Martin",
  },
  {
    text: "Until I feared I would lose it, I never loved to read. One does not love breathing.",
    source: "Harper Lee",
  },
  {
    text: "Books are a uniquely portable magic.",
    source: "Stephen King",
  },
  { text: "I cannot live without books.", source: "Thomas Jefferson" },
  { text: "So many books, so little time.", source: "Frank Zappa" },
  {
    text: "The reading of all good books is like a conversation with the finest minds of past centuries.",
    source: "René Descartes",
  },
  {
    text: "That's the thing about books. They let you travel without moving your feet.",
    source: "Jhumpa Lahiri",
  },
  {
    text: "Once you learn to read, you will be forever free.",
    source: "Frederick Douglass",
  },
  {
    text: "The more that you read, the more things you will know.",
    source: "Dr. Seuss",
  },
  {
    text: "When you reread a classic you do not see more in the book than you did before; you see more in you than was there before.",
    source: "Clifton Fadiman",
  },
  {
    text: "The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.",
    source: "Jane Austen",
  },
  {
    text: "There is no friend as loyal as a book.",
    source: "Ernest Hemingway",
  },
  { text: "Books may well be the only true magic.", source: "Alice Hoffman" },
  {
    text: "The book to read is not the one that thinks for you but the one which makes you think.",
    source: "James McCosh",
  },
  {
    text: "You can never get a cup of tea large enough or a book long enough to suit me.",
    source: "C. S. Lewis",
  },
  {
    text: "If one cannot enjoy reading a book over and over again, there is no use in reading it at all.",
    source: "Oscar Wilde",
  },
  {
    text: "Sleep is good, and books are better.",
    source: "George R. R. Martin",
  },
  {
    text: "Where is human nature so weak as in the bookstore?",
    source: "Henry Ward Beecher",
  },
  {
    text: "I do things like get in a taxi and say, 'The library, and step on it.'",
    source: "David Foster Wallace",
  },
];

/** The writing craft — patience, first drafts, the axe work. Shown on
 *  the loading screen while a room is being opened. */
export const WRITING_QUOTES: Quote[] = [
  {
    text: "We write to taste life twice, in the moment and in retrospect.",
    source: "Anaïs Nin",
  },
  { text: "You can make anything by writing.", source: "C. S. Lewis" },
  {
    text: "The scariest moment is always just before you start.",
    source: "Stephen King",
  },
  {
    text: "Fill your paper with the breathings of your heart.",
    source: "William Wordsworth",
  },
  {
    text: "Almost all good writing begins with terrible first efforts.",
    source: "Anne Lamott",
  },
  {
    text: "Don't tell me the moon is shining; show me the glint of light on broken glass.",
    source: "Anton Chekhov",
  },
  {
    text: "Everything in life is writable about if you have the outgoing guts to do it.",
    source: "Sylvia Plath",
  },
  {
    text: "We are all apprentices in a craft where no one ever becomes a master.",
    source: "Ernest Hemingway",
  },
  {
    text: "You must stay drunk on writing so reality cannot destroy you.",
    source: "Ray Bradbury",
  },
  { text: "Writing is thinking on paper.", source: "William Zinsser" },
  {
    text: "A word after a word after a word is power.",
    source: "Margaret Atwood",
  },
  {
    text: "The purpose of a writer is to keep civilization from destroying itself.",
    source: "Albert Camus",
  },
  {
    text: "One day I will find the right words, and they will be simple.",
    source: "Jack Kerouac",
  },
  {
    text: "No tears in the writer, no tears in the reader.",
    source: "Robert Frost",
  },
  {
    text: "There is no greater agony than bearing an untold story inside you.",
    source: "Maya Angelou",
  },
  {
    text: "How do I know what I think until I see what I say?",
    source: "E. M. Forster",
  },
  { text: "Immature poets imitate; mature poets steal.", source: "T. S. Eliot" },
  {
    text: "To produce a mighty book, you must choose a mighty theme.",
    source: "Herman Melville",
  },
  {
    text: "I can shake off everything as I write; my sorrows disappear, my courage is reborn.",
    source: "Anne Frank",
  },
  {
    text: "Books are the bees which carry the quickening pollen from one to another mind.",
    source: "James Russell Lowell",
  },
];

/** Single-line quotes sized for the small floating cards (the landing
 *  hero page and the dashboard's cream aside). Verse and long lines
 *  are reserved for the wider wall surfaces. */
export const CARD_QUOTES: Quote[] = READING_QUOTES.filter(
  (q) => !q.verse && q.text.length <= 72,
);

/* ════════════════════════════════════════════════════════════════
   Session-stable randomness
   ────────────────────────────────────────────────────────────────
   Quotes vary per user and per session, but never flicker mid-view:
   the shuffle is seeded once from the local identity and a single
   random draw persisted in sessionStorage, then memoised. A visitor
   sees the same picks for the whole sitting and different ones the
   next time they open the room.
   ════════════════════════════════════════════════════════════════ */

const SEED_KEY = "lemniscate:quote-seed";

function hashString(s: string): number {
  /* FNV-1a — small, fast, good enough to scatter identities. */
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sessionRand(): number {
  if (typeof window === "undefined") return 1;
  try {
    let s = window.sessionStorage.getItem(SEED_KEY);
    if (!s) {
      s = String(Math.floor(Math.random() * 0x7fffffff));
      window.sessionStorage.setItem(SEED_KEY, s);
    }
    return parseInt(s, 10) || 1;
  } catch {
    return 1; // storage blocked — the day-seed still varies things
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates over a copy, seeded per user + session. */
function shuffle<T>(pool: readonly T[]): T[] {
  const out = [...pool];
  let seed = sessionRand();
  try {
    seed ^= hashString(getUserId());
  } catch {
    /* identity not reachable yet — session seed alone is fine */
  }
  const rng = mulberry32(seed || 1);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Memoised session order per pool — pools are module constants, so
 *  the WeakMap keys live as long as the app does. */
const orderCache = new WeakMap<readonly unknown[], unknown[]>();
function sessionOrder<T>(pool: readonly T[]): T[] {
  const hit = orderCache.get(pool) as T[] | undefined;
  if (hit) return hit;
  const out = shuffle(pool);
  orderCache.set(pool, out);
  return out;
}

/**
 * Session-stable picks from a pool. Returns `null` until mounted so
 * server-rendered markup and the first client render agree — the
 * picks arrive a frame later and stay put for the whole session.
 * The pool MUST be a module-level constant (stable reference).
 * `offset` slides the window so two surfaces sharing a pool never
 * show the same line in one sitting (hero takes 0, the dashboard's
 * floating page 1, its empty drawer 2).
 */
export function useSessionPicks<T>(
  pool: readonly T[],
  count: number,
  offset = 0,
): T[] | null {
  const [picks, setPicks] = useState<T[] | null>(null);
  useEffect(() => {
    setPicks(sessionOrder(pool).slice(offset, offset + count));
  }, [pool, count, offset]);
  return picks;
}

/* ── the loading screen ──────────────────────────────────────────
   Each time a lazy view opens, the loader shows the NEXT quote in
   the session-shuffled writing pool — every loading screen differs,
   nothing repeats back-to-back, and the order is stable enough that
   a fast back-and-forth never shows the same line twice. */

let loaderOrder: Quote[] | null = null;
let loaderCursor = -1;

export function nextLoaderQuote(): Quote {
  if (!loaderOrder) loaderOrder = sessionOrder(WRITING_QUOTES);
  loaderCursor = (loaderCursor + 1) % loaderOrder.length;
  return loaderOrder[loaderCursor] as Quote;
}

/** The quote for one mounting of the loading screen. */
export function useLoaderQuote(): Quote | null {
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    setQuote(nextLoaderQuote());
  }, []);
  return quote;
}
