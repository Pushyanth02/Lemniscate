/**
 * lru-cache.ts — LRU (Least Recently Used) Cache for Expensive Operations
 *
 * Provides an in-memory cache with configurable TTL and max size.
 * Optimised for caching text analysis results (readability, sentiment, etc.)
 * where the same text may be processed multiple times.
 *
 * @example
 * ```ts
 * const sentimentCache = new LRUCache<string, { score: number }>({
 *   maxSize: 100,
 *   ttlMs: 5 * 60 * 1000, // 5 minutes
 * });
 *
 * function analyze(text: string) {
 *   const cached = sentimentCache.get(text);
 *   if (cached) return cached;
 *   const result = expensiveAnalysis(text);
 *   sentimentCache.set(text, result);
 *   return result;
 * }
 * ```
 */

export interface LRUCacheOptions {
    /** Maximum number of entries (default: 100). */
    maxSize?: number;
    /** Time-to-live in milliseconds (default: 5 minutes). */
    ttlMs?: number;
    /** Optional name for debug logging. */
    name?: string;
}

interface CacheEntry<V> {
    value: V;
    expiresAt: number;
    hits: number;
}

/**
 * Simple yet efficient LRU cache with TTL support.
 *
 * Uses a `Map` (which preserves insertion order) for O(1) get/set/delete.
 * When the cache exceeds `maxSize`, the oldest entries are evicted.
 */
export class LRUCache<K, V> {
    private readonly _map = new Map<K, CacheEntry<V>>();
    private readonly _maxSize: number;
    private readonly _ttlMs: number;
    private readonly _name: string;
    private _evictions = 0;
    private _hits = 0;
    private _misses = 0;

    constructor(options: LRUCacheOptions = {}) {
        this._maxSize = options.maxSize ?? 100;
        this._ttlMs = options.ttlMs ?? 5 * 60 * 1000;
        this._name = options.name ?? 'LRUCache';
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Retrieves a value from the cache.
     * Returns `undefined` if the key doesn't exist or has expired.
     * On access, the entry is moved to the end (most recently used).
     */
    get(key: K): V | undefined {
        const entry = this._map.get(key);
        if (!entry) {
            this._misses++;
            return undefined;
        }

        // Check expiration
        if (Date.now() > entry.expiresAt) {
            this._map.delete(key);
            this._misses++;
            return undefined;
        }

        // Move to end (most recently used)
        this._map.delete(key);
        this._map.set(key, entry);
        entry.hits++;
        this._hits++;
        return entry.value;
    }

    /**
     * Stores a value in the cache.
     * If the key already exists, it's updated and moved to the end.
     * If the cache is full, the least recently used entry is evicted.
     */
    set(key: K, value: V, ttlMs?: number): this {
        // If key exists, delete it first to update insertion order
        if (this._map.has(key)) {
            this._map.delete(key);
        }

        // Evict oldest entries if at capacity
        while (this._map.size >= this._maxSize) {
            const oldestKey = this._map.keys().next().value;
            if (oldestKey !== undefined) {
                this._map.delete(oldestKey);
                this._evictions++;
            } else {
                break;
            }
        }

        const expiresAt = Date.now() + (ttlMs ?? this._ttlMs);
        this._map.set(key, { value, expiresAt, hits: 0 });
        return this;
    }

    /**
     * Checks if a key exists and hasn't expired.
     */
    has(key: K): boolean {
        const entry = this._map.get(key);
        if (!entry) return false;
        if (Date.now() > entry.expiresAt) {
            this._map.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Deletes a specific key from the cache.
     */
    delete(key: K): boolean {
        return this._map.delete(key);
    }

    /**
     * Removes all expired entries from the cache.
     */
    prune(): number {
        const now = Date.now();
        let pruned = 0;
        for (const [key, entry] of this._map) {
            if (now > entry.expiresAt) {
                this._map.delete(key);
                pruned++;
            }
        }
        return pruned;
    }

    /**
     * Clears all entries from the cache.
     */
    clear(): void {
        this._map.clear();
    }

    /**
     * Returns the number of entries currently in the cache.
     */
    get size(): number {
        return this._map.size;
    }

    // ─── Statistics ──────────────────────────────────────────────────────

    /**
     * Returns cache performance statistics.
     */
    stats(): LRUCacheStats {
        const total = this._hits + this._misses;
        return {
            name: this._name,
            size: this._map.size,
            maxSize: this._maxSize,
            ttlMs: this._ttlMs,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? this._hits / total : 0,
            evictions: this._evictions,
        };
    }

    /**
     * Logs cache statistics to the console (development aid).
     */
    debug(): void {
        const s = this.stats();
        console.debug(
            `[${s.name}] size=${s.size}/${s.maxSize} ` +
                `hits=${s.hits} misses=${s.misses} ` +
                `hitRate=${(s.hitRate * 100).toFixed(1)}% ` +
                `evictions=${s.evictions}`,
        );
    }
}

export interface LRUCacheStats {
    name: string;
    size: number;
    maxSize: number;
    ttlMs: number;
    hits: number;
    misses: number;
    /** Ratio of hits to total lookups (0–1). */
    hitRate: number;
    evictions: number;
}

// ─── Convenience Factory ────────────────────────────────────────────────────

const _globalCaches = new Map<string, LRUCache<any, any>>();

/**
 * Creates or retrieves a named global cache instance.
 * Useful for sharing caches across modules.
 *
 * @example
 * ```ts
 * const sentimentCache = getGlobalCache<{ score: number }>('sentiment', {
 *   maxSize: 200,
 *   ttlMs: 300_000,
 * });
 * ```
 */
export function getGlobalCache<V>(
    name: string,
    options: Omit<LRUCacheOptions, 'name'> = {},
): LRUCache<string, V> {
    let cache = _globalCaches.get(name) as LRUCache<string, V> | undefined;
    if (!cache) {
        cache = new LRUCache<string, V>({ ...options, name });
        _globalCaches.set(name, cache);
    }
    return cache;
}