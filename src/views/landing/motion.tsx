"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePrefs } from "../../lib/store";

/* The house motion signature: a confident deceleration that settles late. */
export const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/* ---------- magnetic CTA ---------- */
export function Magnetic({
  children,
  strength = 0.16,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  return (
    <motion.div
      ref={ref}
      className="inline-block"
      onMouseMove={(e) => {
        if (reduce || motionOff || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        ref.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "translate(0,0)";
      }}
      style={{
        transition: "transform 0.45s cubic-bezier(0.32,0.72,0,1)",
        willChange: "transform",
      }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- hero entrance: heavier blur-up for above-the-fold copy ---------- */
export function HeroReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  const off = reduce || motionOff;
  return (
    <motion.div
      className={className}
      initial={off ? false : { opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={off ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export const scrollTo = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

export const SECTION_IDS = ["bots", "features", "demo"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
