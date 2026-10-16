import { useEffect, useState } from "react";
import { rateInfo } from "../../../lib/ai";
import { cx } from "../../../lib/utils";

/* ---------------- AI: rate meter ---------------- */

export function RateMeter() {
  const [info, setInfo] = useState(rateInfo());
  useEffect(() => {
    const t = window.setInterval(() => setInfo(rateInfo()), 4000);
    return () => window.clearInterval(t);
  }, []);
  const pctUsed = Math.round((info.used / info.limit) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-mist-500 mb-1.5">
        <span>Rolling minute</span>
        <span className="font-mono tabular-nums text-mist-300">
          {info.used}/{info.limit} calls
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
        <div
          className={cx(
            "h-full rounded-full transition-all duration-500",
            pctUsed > 80 ? "bg-danger-500" : "bg-gold-500",
          )}
          style={{ width: `${pctUsed}%` }}
        />
      </div>
      <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
        When the window fills, new requests queue briefly instead of failing.
      </p>
    </div>
  );
}
