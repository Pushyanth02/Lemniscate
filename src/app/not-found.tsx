import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you requested is not in the Lemniscate library. Return to the reading room.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-ink-950"
      aria-label="Page not found"
    >
      {/* Lemniscate mark: a hand-drawn infinity in champagne */}
      <svg
        viewBox="0 0 64 64"
        className="w-16 h-16 text-gold-500"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M16 32c0-6.6 4.9-12 11-12 9 0 11 24 20 24 6.1 0 11-5.4 11-12s-4.9-12-11-12c-9 0-11 24-20 24-6.1 0-11-5.4-11-12z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="drop-shadow-[0_0_12px_rgba(211,166,81,0.35)]"
        />
      </svg>

      <div className="flex flex-col items-center gap-3 text-center max-w-md">
        <h1 className="font-display text-4xl text-mist-100 font-semibold">
          Page not found
        </h1>
        <p className="text-mist-400 leading-relaxed">
          This page is not in the library. It may have been moved, or the
          address mistyped. Your books, notes, and companions are safe.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-full bg-gold-500 text-(--acc-ink) px-7 py-3 font-medium text-sm transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
      >
        Open the reading room
      </Link>

      <p className="text-[11px] text-mist-500">
        404 · Lemniscate keeps everything on your device
      </p>
    </div>
  );
}
