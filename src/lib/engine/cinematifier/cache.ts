/**
 * cache.ts — Shared LRU Cache Factory for Engine Modules
 *
 * Provides a global cache factory used by readability, sentiment, and other
 * engine modules to avoid redundant computation on repeated text analysis.
 */

interface CacheOptions {
    maxSize?: number;
    ttlMs?: number;
}

interface CacheEntry<V> {
    value: V;
    expiresAt: number;
}

export function getGlobalCache<V>(namespace: string, options: CacheOptions = {}): {
    get: (key: string) => V | undefined;
    set: (key: string, value: V) => void;
    clear: () => void;
} {
    const maxSize = options.maxSize ?? 100;
    const ttlMs = options.ttlMs ?? 30 * 60 * 1000; // 30 min default
    const store = new Map<string, CacheEntry<V>>();

    return {
        get(key: string): V | undefined {
            const entry = store.get(`${namespace}:${key}`);
            if (!entry) return undefined;
            if (Date.now() > entry.expiresAt) {
                store.delete(`${namespace}:${key}`);
                return undefined;
            }
            return entry.value;
        },
        set(key: string, value: V): void {
            if (store.size >= maxSize) {
                // Evict oldest entry
                const firstKey = store.keys().next().value;
                if (firstKey !== undefined) store.delete(firstKey);
            }
            store.set(`${namespace}:${key}`, {
                value,
                expiresAt: Date.now() + ttlMs,
            });
        },
        clear(): void {
            for (const key of store.keys()) {
                if (key.startsWith(`${namespace}:`)) store.delete(key);
            }
        },
    };
}
