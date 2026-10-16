"use client";

import { useEffect, useRef } from "react";
import { cx } from "../lib/utils";
import { usePrefs } from "../lib/store";

export interface BrandMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
  strokeWidth?: number;
  variant?: "default" | "gold" | "glow" | "ribbon";
}

/**
 * The Lemniscate mark — a mathematically smooth Bernoulli infinity traced
 * in gilt. Solid antique stroke (the color arrives via `currentColor`),
 * C1-continuous bezier geometry, and a draw-on trace animation. The mark
 * is the one orchestrated brand moment; everything around it stays quiet.
 */
export function BrandMark({
  size = 28,
  animated = false,
  className,
  strokeWidth = 2.75,
  variant = "default",
}: BrandMarkProps) {
  const pathD =
    "M 32 16 C 38.5 8.8 47.5 6.2 54 10 C 60.5 13.8 60.5 20.2 54 24 C 47.5 27.8 38.5 25.2 32 16 C 25.5 6.8 16.5 4.2 10 8 C 3.5 11.8 3.5 18.2 10 22 C 16.5 25.8 25.5 23.2 32 16 Z";

  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 64 32"
      fill="none"
      className={cx("overflow-visible select-none shrink-0", className)}
      aria-hidden
    >
      {/* Soft halo underlay for the glow variant — kept faint, like
          lamplight behind the mark. */}
      {(variant === "glow" || animated) && (
        <path
          d={pathD}
          stroke="currentColor"
          strokeWidth={strokeWidth + 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.18}
          className="blur-[2px]"
        />
      )}

      {/* Primary Lemniscate stroke */}
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={340}
        strokeDasharray={animated ? 340 : undefined}
        style={animated ? { animation: "trace 7s linear infinite" } : undefined}
      />
    </svg>
  );
}

/**
 * The lemniscate, written and re-written — the loading-screen mark.
 * A faint guide line holds the shape; a gilt stroke draws itself on;
 * and a bright nib rides exactly at the writing tip (the same
 * dash-offset math, offset by one nib length so the ink seems to
 * bleed just ahead of the pen). The stroke holds a beat once the
 * loop closes, then lifts and begins again. Rests fully drawn —
 * no motion — under reduced motion and motion-off, which collapse
 * the keyframes to their end state.
 */
export function InfinityWriting({
  size = 96,
  strokeWidth = 2.75,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const pathD =
    "M 32 16 C 38.5 8.8 47.5 6.2 54 10 C 60.5 13.8 60.5 20.2 54 24 C 47.5 27.8 38.5 25.2 32 16 C 25.5 6.8 16.5 4.2 10 8 C 3.5 11.8 3.5 18.2 10 22 C 16.5 25.8 25.5 23.2 32 16 Z";
  const WRITE = "4.8s cubic-bezier(0.42, 0, 0.36, 1) infinite";
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 64 32"
      fill="none"
      className={cx("overflow-visible select-none shrink-0", className)}
      aria-hidden
    >
      {/* the unwritten line, faint */}
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.14}
      />
      {/* the writing — draws on, holds, begins again */}
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={340}
        style={{
          strokeDasharray: 340,
          strokeDashoffset: 0,
          animation: `write-draw ${WRITE}`,
        }}
      />
      {/* the nib — a bright segment travelling with the tip, lifting
          off as the loop closes */}
      <path
        d={pathD}
        strokeWidth={strokeWidth + 0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={340}
        className="blur-[0.4px]"
        style={{
          stroke: "var(--color-gold-200)",
          strokeDasharray: "16 324",
          strokeDashoffset: 0,
          opacity: 0,
          animation: `write-nib ${WRITE}`,
        }}
      />
    </svg>
  );
}

/** Ambient drifting dust — motes in the reading lamp. Respects reduced motion. */
export function ParticleField({
  className,
  density = 55,
  tint = "mixed",
}: {
  className?: string;
  density?: number;
  tint?: "gold" | "mixed";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduceOs = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (motionOff || reduceOs) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      a: number;
      c: string;
      tw: number;
    }
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* champagne motes, jade motes, silver motes — dust in lamplight */
      const colors =
        tint === "gold"
          ? ["211,166,81"]
          : ["211,166,81", "125,181,164", "228,228,225"];
      parts = Array.from({ length: density }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.04 - Math.random() * 0.14,
        r: 0.6 + Math.random() * 1.6,
        a: 0.12 + Math.random() * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)] ?? "211,166,81",
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.012;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        const alpha = p.a * (0.65 + 0.35 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},${alpha.toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, tint, motionOff]);

  return (
    <canvas
      ref={ref}
      className={cx(
        "absolute inset-0 w-full h-full pointer-events-none",
        className,
      )}
      aria-hidden
    />
  );
}

/** Persistent atmosphere for interior views — one reading lamp wash,
 *  sparse dust and paper grain, fixed behind everything. Quiet on
 *  reduced motion. */
export function AppAmbient() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      {/* the reading lamp, top right */}
      <div
        className="absolute -top-40 right-[-12%] w-210 h-155 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, color-mix(in srgb, var(--acc) 8%, transparent), transparent 65%)",
        }}
      />
      {/* deep corner of the room, bottom left */}
      <div
        className="absolute bottom-[-20%] left-[-14%] w-170 h-140 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgb(10 9 7 / 0.5), transparent 65%)",
        }}
      />
      <ParticleField density={18} tint="mixed" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "url(/noise.svg)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, transparent 55%, rgb(10 9 7 / 0.55) 100%)",
        }}
      />
    </div>
  );
}

/** Soft cinematic washes used behind hero & dashboard surfaces. */
export function GlowLayer({
  variant = "landing",
}: {
  variant?: "landing" | "noir";
}) {
  if (variant === "landing") {
    return (
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div
          className="absolute -top-40 right-[-10%] w-180 h-180 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgb(86 147 131 / 0.08), transparent 65%)",
          }}
        />
        <div
          className="absolute top-[30%] left-[-14%] w-155 h-155 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--acc) 8%, transparent), transparent 62%)",
          }}
        />
        <div
          className="absolute bottom-[-30%] right-[20%] w-140 h-140 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgb(213 133 79 / 0.06), transparent 60%)",
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <div
        className="absolute -top-32 left-[8%] w-160 h-105 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, color-mix(in srgb, var(--acc) 6%, transparent), transparent 65%)",
        }}
      />
      <div
        className="absolute top-[10%] right-[-8%] w-140 h-115 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgb(86 147 131 / 0.07), transparent 62%)",
        }}
      />
    </div>
  );
}
