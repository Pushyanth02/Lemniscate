/**
 * typescript-utils.ts — Custom TypeScript Utility Types
 *
 * Provides reusable type helpers that reduce boilerplate and improve
 * type safety across the codebase.
 *
 * @example
 * ```ts
 * // Extract the resolved type from an async function
 * type Result = AsyncReturnType<typeof fetchBook>;
 * // Result: Book | null
 *
 * // Create a tuple of promises
 * const [a, b] = await Promise.all([
 *   fetchBook(id),
 *   fetchProgress(id),
 * ] satisfies PromiseTuple<[typeof fetchBook, typeof fetchProgress]>);
 * ```
 */

// ─── Promise & Async Utilities ──────────────────────────────────────────────

/** Resolves the unwrapped type of a Promise or async function. */
export type AsyncReturnType<T extends (...args: any) => any> =
    T extends (...args: any) => Promise<infer R> ? R
    : T extends (...args: any) => infer R ? R
    : never;

/** Maps a tuple of async functions to their resolved types. */
export type PromiseTuple<T extends readonly [...any[]]> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? ReturnType<T[K]> : T[K];
};

/** Wraps a type in a Promise. */
export type Promisable<T> = T | Promise<T>;

// ─── Object & Record Utilities ──────────────────────────────────────────────

/** Makes specified keys of T required (removing `undefined`). */
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & {
    [P in K]-?: NonNullable<T[P]>;
};

/** Makes specified keys of T optional (allowing `undefined`). */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & {
    [P in K]?: T[P];
};

/** Picks keys from T that match a value type V. */
export type PickByType<T, V> = {
    [K in keyof T as T[K] extends V ? K : never]: T[K];
};

/** Extracts keys from T whose values are functions (methods). */
export type MethodKeys<T> = keyof PickByType<T, (...args: any) => any>;

/** Extracts keys from T whose values are NOT functions (data properties). */
export type DataKeys<T> = keyof {
    [K in keyof T as T[K] extends (...args: any) => any ? never : K]: T[K];
};

// ─── State & Store Utilities ────────────────────────────────────────────────

/**
 * Extracts the selector-safe subset of a store by omitting function properties.
 *
 * @example
 * ```ts
 * const bookData: StoreData<typeof useBookStore> = useBookStore();
 * // bookData has no setBook, updateChapter, etc.
 * ```
 */
export type StoreData<T> = T extends (selector?: unknown) => infer R
    ? R
    : T extends { getState: () => infer S }
      ? S
      : never;

/** Ensures a type is deeply immutable (readonly). */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends Record<string, any>
        ? DeepReadonly<T[P]>
        : T[P];
};

// ─── Event & Handler Utilities ──────────────────────────────────────────────

/** Standard event handler shape used across the app. */
export type EventHandler<E = void> = E extends void
    ? () => void
    : (event: E) => void;

/** Extracts the event type from a DOM event handler. */
export type InferEvent<T> = T extends (e: infer E) => void ? E : never;

// ─── Branded Types (Nominal Typing) ─────────────────────────────────────────

/**
 * Creates a branded (nominal) type — two structurally identical branded types
 * are NOT interchangeable.
 *
 * @example
 * ```ts
 * type BookId = Brand<string, 'BookId'>;
 * type ChapterId = Brand<string, 'ChapterId'>;
 *
 * function getChapter(id: ChapterId) { ... }
 *
 * const bookId: BookId = 'abc' as BookId;
 * getChapter(bookId); // ❌ TypeScript error — different brands
 * ```
 */
export type Brand<T, B extends string> = T & { __brand: B };

// ─── Guard Utilities ────────────────────────────────────────────────────────

/** Checks whether a value is a non-null object (not an array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks whether a value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/** Checks whether a value is a positive integer. */
export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}