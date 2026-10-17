"use client";

import {
  Component,
  useEffect,
  useId,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Toaster, toast as sonnerToast } from "sonner";
import {
  X,
  Warning,
  CheckCircle,
  Info,
  CircleNotch,
  Tray,
  ArrowCounterClockwise,
  House,
} from "@phosphor-icons/react";
import { cx } from "../lib/utils";
import { useToasts, usePrefs, useNav, useShallow } from "../lib/store";
import {
  chunkRecoveryAttempted,
  isChunkLoadError,
  recoverFromChunkError,
  shouldReloadForChunkError,
} from "../lib/lazy";
import { BrandMark, InfinityWriting } from "./brand";
import { useLoaderQuote } from "../lib/quotes";

/* ═══════════════════════════════════════════════════
   Button — gilt-primary, tactile, one accent
   ═══════════════════════════════════════════════════ */

type BtnVariant = "gold" | "outline" | "ghost" | "danger" | "subtle";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const v: Record<BtnVariant, string> = {
    gold: "text-(--acc-ink) border border-gold-600/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--acc-hi)_82%,var(--acc)),var(--acc))] hover:brightness-108 active:brightness-92 shadow-[0_1px_0_0_rgb(255_255_255/0.3)_inset,0_10px_24px_-12px_var(--acc-glow)] font-semibold",
    outline:
      "border border-ink-600 text-mist-200 hover:border-gold-600 hover:text-gold-300 bg-ink-850/60 hover:bg-ink-800/80 shadow-[0_1px_0_0_rgb(244_244_241/0.04)_inset]",
    ghost: "text-mist-300 hover:text-gold-300 hover:bg-ink-750/80",
    danger:
      "border border-danger-500/50 text-danger-400 hover:bg-danger-500/10 hover:border-danger-500/70",
    subtle:
      "bg-ink-750 text-mist-200 hover:bg-ink-700 border border-ink-600/50",
  };
  const s = {
    xs: "text-xs px-3 py-1.5",
    sm: "text-xs px-3.5 py-2",
    md: "text-sm px-5 py-2.5",
    lg: "text-[15px] px-7 py-3",
  }[size];
  /* Same display-conflict guard as IconBtn: a call-site `hidden` must win
     over this component's base `inline-flex` (Tailwind resolves equal-
     specificity display utilities by stylesheet order, not class-attribute
     order). */
  const callerHides = typeof className === "string" && /\bhidden\b/.test(className);
  return (
    <button
      className={cx(
        callerHides ? null : "inline-flex",
        "items-center justify-center gap-2 rounded-full font-body font-medium tracking-[0.01em] transition-all duration-200 select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap press",
        v[variant],
        s,
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <CircleNotch className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  /* A call-site `hidden` (e.g. "hidden sm:inline-flex") must be able to
     hide the button. Tailwind resolves same-layer display conflicts by
     stylesheet order, where this component's base `inline-flex` would
     beat the caller's `hidden` — so the base display class is dropped
     whenever the caller brings a display utility of their own. */
  const callerHides = typeof className === "string" && /\bhidden\b/.test(className);
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        callerHides ? null : "inline-flex",
        "items-center justify-center w-9 h-9 rounded-full transition-all duration-200 press",
        active
          ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
          : "text-mist-400 hover:text-gold-300 hover:bg-ink-750/80 border border-transparent",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   Surfaces
   ═══════════════════════════════════════════════════ */

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("panel", className)}>{children}</div>;
}

export function Badge({
  className,
  children,
  tone = "muted",
  title,
}: {
  className?: string;
  children: ReactNode;
  tone?: "muted" | "gold" | "ok" | "danger" | "ouro" | "ankaa";
  title?: string;
}) {
  const t = {
    muted: "bg-ink-750 text-mist-400 border-ink-600/60",
    gold: "bg-gold-500/10 text-gold-300 border-gold-700/50",
    ok: "bg-ok-500/10 text-ok-400 border-ok-500/30",
    danger: "bg-danger-500/10 text-danger-400 border-danger-500/30",
    ouro: "bg-ouro-500/10 text-ouro-300 border-ouro-500/30",
    ankaa: "bg-ankaa-500/10 text-ankaa-300 border-ankaa-500/30",
  }[tone];
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-body font-medium uppercase tracking-[0.1em]",
        t,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  className,
  tone = "gold",
}: {
  value: number;
  className?: string;
  tone?: "gold" | "ouro" | "ok";
}) {
  const c = { gold: "bg-gold-500", ouro: "bg-ouro-500", ok: "bg-ok-500" }[tone];
  return (
    <div
      className={cx(
        "h-1.5 w-full rounded-full bg-ink-700 overflow-hidden",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          c,
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/** Circular progress — the house way of showing "how far through a book". */
export function ProgressRing({
  value,
  size = 56,
  stroke = 4,
  label,
  tone = "gold",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  tone?: "gold" | "ok" | "ouro";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, value));
  let color = "var(--acc)";
  if (tone === "ok") color = "var(--color-ok-500)";
  else if (tone === "ouro") color = "var(--color-ouro-500)";
  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink-700)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-body tabular-nums text-mist-100"
        style={{ fontSize: size * 0.24 }}
      >
        {label ?? `${Math.round(v)}%`}
      </span>
    </div>
  );
}

/** Small-caps serif running head — the recurring section voice, set like
    a gilt chapter label rather than a sans eyebrow. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "flex items-center gap-2.5 text-[13px] font-display font-medium uppercase tracking-[0.2em] text-gold-400",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-px w-6 bg-gold-700/70"
      />
      {children}
    </p>
  );
}



/* ═══════════════════════════════════════════════════
   Controls
   ═══════════════════════════════════════════════════ */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group py-1">
      <span>
        <span className="block text-sm text-mist-200 group-hover:text-mist-100 transition-colors">
          {label}
        </span>
        {hint && (
          <span className="block text-xs text-mist-500 mt-0.5">{hint}</span>
        )}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cx(
          "relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0 press",
          checked
            ? "bg-gold-500/90 border-gold-400"
            : "bg-ink-750 border-ink-600",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 w-5 h-5 rounded-full bg-mist-100 shadow-sm transition-all duration-200",
            checked ? "left-5.5" : "left-0.75",
          )}
        />
      </button>
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-mist-200">{label}</span>
        <span className="text-xs font-mono text-gold-300 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] font-body font-medium uppercase tracking-[0.12em] text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <select
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-200 hover:border-gold-700 focus:border-gold-600 outline-none transition-colors",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Input({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] font-body font-medium uppercase tracking-[0.12em] text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <input
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 hover:border-gold-800 focus:border-gold-600 outline-none transition-colors",
          className,
        )}
        {...rest}
      />
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] font-body font-medium uppercase tracking-[0.12em] text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <textarea
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 hover:border-gold-800 focus:border-gold-600 outline-none transition-colors resize-y",
          className,
        )}
        {...rest}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-ink-600 bg-ink-875 p-0.5 gap-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-3.5 py-1.5 rounded-full text-xs font-body font-medium tracking-wide transition-all press",
            value === o.value
              ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
              : "text-mist-400 hover:text-mist-200 border border-transparent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: ReactNode; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const lineId = useId();
  return (
    <div
      role="tablist"
      className="flex gap-1 border-b border-ink-700 overflow-x-auto scrollbar-thin"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative px-3.5 py-2.5 text-xs font-body font-medium uppercase tracking-[0.12em] transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
            value === t.id
              ? "text-gold-300"
              : "text-mist-500 hover:text-mist-300",
          )}
        >
          {t.icon}
          {t.label}
          {value === t.id && (
            <motion.span
              layoutId={`tabline-${lineId}`}
              className="absolute left-2 right-2 -bottom-px h-0.5 bg-gold-500 rounded-full"
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function Menu({
  button,
  items,
  align = "right",
}: {
  button: ReactNode;
  items: {
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    onClick: () => void;
  }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    // Capture phase + stopPropagation: Escape closes ONLY this menu, not a
    // Dialog it happens to sit inside (both listen on document).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }
        }}
      >
        {button}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "absolute z-50 mt-1.5 min-w-48 rounded-2xl border border-ink-600 bg-ink-800/95 backdrop-blur-xl shadow-float overflow-hidden p-1.5",
              align === "right" ? "right-0" : "left-0",
            )}
            role="menu"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm rounded-lg transition-colors press",
                  it.danger
                    ? "text-danger-400 hover:bg-danger-500/10"
                    : "text-mist-300 hover:bg-ink-750 hover:text-gold-300",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Overlays
   ═══════════════════════════════════════════════════ */

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Hold onClose in a ref so the keyboard effect keys on [open] alone:
  // callers pass inline closures, and re-keying on every parent re-render
  // (e.g. a background job ticking at 3 Hz) tore the effect down and yanked
  // focus back to the opener mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // focus the panel itself so screen readers land on the dialog and the
    // first Tab moves to the first interactive child rather than the page
    // behind the overlay.
    requestAnimationFrame(() => panelRef.current?.focus?.());
    // The background must not scroll behind a surface announced as modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        // Focus sitting on the panel container itself: wrap to the far end
        // so the trap cannot leak past either edge of the dialog.
        if (active === panelRef.current) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // restore focus to whatever opened the dialog (WCAG 2.4.3)
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-80 flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }
            }
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "relative panel-glass rounded-2xl w-full max-h-[88vh] overflow-y-auto p-5 sm:p-6 shadow-float",
              wide ? "max-w-2xl" : "max-w-md",
            )}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2
                id={titleId}
                className="font-display font-semibold text-xl text-mist-100 leading-snug"
              >
                {title}
              </h2>
              <IconBtn label="Close dialog" onClick={onClose}>
                <X className="w-4 h-4" />
              </IconBtn>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  side = "right",
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // See Dialog: the ref keeps the effect keyed on [open] so inline onClose
  // closures from re-rendering parents cannot yank focus out of the sheet.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panelRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (active === panelRef.current) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-70">
          <motion.div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: side === "right" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "right" ? "100%" : "-100%" }}
            transition={{
              type: "tween",
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cx(
              "absolute top-0 bottom-0 w-full bg-ink-875/95 backdrop-blur-xl border-l border-ink-700 shadow-float flex flex-col safe-top safe-bottom",
              width,
              side === "right" ? "right-0 border-l" : "left-0 border-r",
            )}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700 shrink-0">
              <h2
                id={titleId}
                className="font-display font-medium text-[15px] uppercase tracking-[0.18em] text-gold-300"
              >
                {title}
              </h2>
              <IconBtn label="Close panel" onClick={onClose}>
                <X className="w-4 h-4" />
              </IconBtn>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════
   Feedback
   ═══════════════════════════════════════════════════ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl border border-ink-600 bg-ink-850 flex items-center justify-center text-mist-500 mb-5 shadow-card">
        {icon ?? <Tray className="w-7 h-7" />}
      </div>
      <h3 className="font-display font-semibold text-xl text-mist-200 mb-2">
        {title}
      </h3>
      <p className="text-sm text-mist-500 max-w-sm leading-relaxed mb-6">
        {body}
      </p>
      {action}
    </div>
  );
}

/** Toast row rendered inside Sonner — keeps the house surface, gains
 *  stacking and swipe-to-dismiss from the library. */
function ToastRow({
  kind,
  msg,
  onDismiss,
}: {
  kind: "error" | "success" | "info";
  msg: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cx(
        "panel-glass rounded-xl flex items-start gap-3 px-4 py-3.5 shadow-float w-[min(92vw,380px)]",
        kind === "error" && "border-danger-500/40",
        kind === "success" && "border-gold-700/60",
      )}
      role="status"
    >
      {kind === "error" ? (
        <Warning className="w-4 h-4 text-danger-400 mt-0.5 shrink-0" />
      ) : kind === "success" ? (
        <CheckCircle className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" />
      ) : (
        <Info className="w-4 h-4 text-ouro-400 mt-0.5 shrink-0" />
      )}
      <p className="text-sm text-mist-200 leading-snug flex-1">{msg}</p>
      <button
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="text-mist-600 hover:text-mist-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Sonner-hosted toast layer. The zustand store stays the source of
 *  truth (push/dismiss API unchanged); Sonner supplies stacking,
 *  swipe-to-dismiss and aria semantics. */
export function ToastHost() {
  const { list, dismiss } = useToasts(
    useShallow((s) => ({ list: s.list, dismiss: s.dismiss })),
  );
  const rendered = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of list) {
      if (rendered.current.has(t.id)) continue;
      rendered.current.add(t.id);
      sonnerToast.custom(
        () => <ToastRow kind={t.kind} msg={t.msg} onDismiss={() => dismiss(t.id)} />,
        { id: t.id, duration: Infinity, dismissible: true },
      );
    }
    for (const id of rendered.current) {
      if (!list.some((t) => t.id === id)) {
        sonnerToast.dismiss(id);
        rendered.current.delete(id);
      }
    }
  }, [list, dismiss]);
  return (
    <Toaster
      position="bottom-right"
      offset={20}
      gap={10}
      visibleToasts={4}
      mobileOffset={{ bottom: 20 }}
    />
  );
}

/* ═══════════════════════════════════════════════════
   Motion
   ═══════════════════════════════════════════════════ */

export function Reveal({
  children,
  delay = 0,
  y = 20,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceOs = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  const off = reduceOs || motionOff;
  return (
    <motion.div
      className={className}
      initial={off ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={off ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.7, delay, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function PageFade({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  return (
    <motion.div
      key={id}
      initial={motionOff ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={motionOff ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Resilience
   ═══════════════════════════════════════════════════ */

/** Full-page brand loader for lazy-loaded views — the lemniscate
 *  writing itself on, over a rotating line from the writing-craft
 *  pool. A different author speaks each time a room opens. */
export function PageLoader({
  label = "Opening the reading room…",
}: {
  label?: string;
}) {
  const quote = useLoaderQuote();
  return (
    <div
      className="flex flex-col items-center justify-center py-28 gap-7"
      role="status"
      aria-label={label}
    >
      <InfinityWriting size={92} className="text-gold-500" />
      <p className="text-[12px] font-display uppercase tracking-[0.24em] text-mist-500 animate-pulse-soft">
        {label}
      </p>
      {quote && (
        <figure
          className="max-w-md px-6 text-center"
          style={{ animation: "rise 0.7s cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <blockquote className="font-display italic text-[15px] sm:text-base leading-relaxed text-mist-400">
            &ldquo;{quote.text}&rdquo;
          </blockquote>
          <figcaption className="mt-2.5 text-[10px] font-body tracking-[0.22em] uppercase text-mist-500">
            {quote.source}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Catches render errors so a crash in one view shows a recovery panel
 *  instead of blanking the whole app. Chunk-load failures (stale chunk
 *  manifest after a dev-server restart or redeploy) get exactly one
 *  automatic recovery reload per session — see ./lib/lazy. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "Lemniscate recovered from a view error:",
      error,
      info.componentStack,
    );
    // A lazy view whose chunk 404s lands here (React memoizes the rejected
    // import) — the one-shot reload is the only honest repair, because the
    // rejection is permanent for this page load.
    if (shouldReloadForChunkError(error, chunkRecoveryAttempted())) {
      recoverFromChunkError();
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <BoundaryFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function BoundaryFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  const go = useNav((s) => s.go);
  // A chunk failure that already used its automatic reload needs the human
  // touch — a hard reload re-fetches the fresh manifest.
  const staleChunk = isChunkLoadError(error) && chunkRecoveryAttempted();
  return (
    <div className="max-w-xl mx-auto px-6 py-24">
      <div className="panel rounded-2xl p-8 text-center">
        <BrandMark size={44} className="text-gold-500 mx-auto mb-5" />
        <h2 className="font-display font-semibold text-2xl text-mist-100 mb-2">
          {staleChunk ? "The room has been rearranged" : "The page lost its place"}
        </h2>
        <p className="text-sm text-mist-500 leading-relaxed mb-2">
          {staleChunk
            ? "This part of the app was updated while you were away, and the page is holding an outdated copy. Reload to pick up the current build."
            : "Something went wrong while rendering this view. Your library and reading position are safe — this is only a display fault."}
        </p>
        <p className="text-[11px] font-mono text-mist-600 bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 mb-6 truncate">
          {error.message}
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          {staleChunk ? (
            <Button variant="gold" onClick={() => window.location.reload()}>
              <ArrowCounterClockwise className="w-4 h-4" />
              Reload the room
            </Button>
          ) : (
            <Button variant="gold" onClick={onReset}>
              <ArrowCounterClockwise className="w-4 h-4" />
              Try again
            </Button>
          )}
          <Button variant="outline" onClick={() => go("dashboard")}>
            <House className="w-4 h-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
