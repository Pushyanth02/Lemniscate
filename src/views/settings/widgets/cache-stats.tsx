import { useCallback, useEffect, useState } from "react";
import { cacheMetrics, cacheStats } from "../../../lib/cache";

/* ---------------- Storage: cache metrics ---------------- */

export function CacheStats() {
  const [stats, setStats] = useState<{ entries: number; bytes: number } | null>(
    null,
  );
  const [metrics, setMetrics] = useState<ReturnType<
    typeof cacheMetrics
  > | null>(null);
  const refresh = useCallback(() => {
    void cacheStats().then(setStats);
    setMetrics(cacheMetrics());
  }, []);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [refresh]);
  const kb = stats ? (stats.bytes / 1024).toFixed(0) : "—";
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-875 px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13px] font-body text-mist-200">
          Cached AI artifacts
        </p>
        <button
          onClick={refresh}
          className="text-[11px] font-body font-medium text-gold-400 hover:text-gold-300 transition-colors"
        >
          Refresh
        </button>
      </div>
      <p className="text-[11px] text-mist-500 mt-1 leading-relaxed">
        {stats
          ? `${stats.entries} entries · ~${kb} KB · study sets, deep analyses, scene cards and model catalogs, served from cache until their TTL expires.`
          : "Reading the cache…"}
      </p>
      {metrics && (
        <p className="text-[11px] font-mono text-mist-600 mt-1 leading-relaxed">
          this session · {metrics.hits} hits · {metrics.misses} misses
          · {metrics.stores} stored · {metrics.invalidations}{" "}
          invalidated
        </p>
      )}
    </div>
  );
}
