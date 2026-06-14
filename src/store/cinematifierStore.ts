/**
 * cinematifierStore.ts — Combined Zustand Store for Cinematifier
 *
 * Composes domain-specific slices into a single unified store
 * for backward compatibility and persistent state synchronization.
 *
 * Architecture:
 *   Middleware stack (outer → inner):
 *     devtools (dev only) → subscribeWithSelector → persist → validation
 *
 * The `partialize` option in persist controls which slices survive
 * localStorage serialization — keeping the store clean of stale data.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector, devtools } from 'zustand/middleware';

import { createReaderSlice, type ReaderState } from './readerStore';
import { createBookSlice, type BookState } from './bookStore';
import { createProcessingSlice, type ProcessingState } from './processingStore';

// ─── State Validation Schema ──────────────────────────────────────────────

interface ValidationRule {
    key: string;
    label: string;
    validate: (value: any, state: Record<string, any>) => boolean;
    message: (value: any) => string;
}

/**
 * Centralised validation rules for store state.
 * Adding a new rule here automatically applies it to all state transitions.
 */
const VALIDATION_RULES: ValidationRule[] = [
    {
        key: 'readerMode',
        label: 'Reader mode',
        validate: (v) => v === 'original' || v === 'cinematified',
        message: (v) => `Invalid readerMode: "${v}" (expected "original" or "cinematified")`,
    },
    {
        key: 'fontSize',
        label: 'Font size',
        validate: (v) => typeof v === 'number' && v >= 12 && v <= 32,
        message: (v) => `Font size out of bounds: ${v} (allowed: 12–32)`,
    },
    {
        key: 'lineSpacing',
        label: 'Line spacing',
        validate: (v) => typeof v === 'number' && v >= 1.4 && v <= 2.4,
        message: (v) => `Line spacing out of bounds: ${v} (allowed: 1.4–2.4)`,
    },
    {
        key: 'currentChapterIndex',
        label: 'Chapter index',
        validate: (v) => typeof v === 'number' && v >= 0,
        message: (v) => `Negative chapter index: ${v}`,
    },
    {
        key: 'immersionLevel',
        label: 'Immersion level',
        validate: (v) => v === 'minimal' || v === 'balanced' || v === 'cinematic',
        message: (v) => `Invalid immersionLevel: "${v}"`,
    },
];

/**
 * Cross-field validation rules that check relationships between values.
 */
const CROSS_VALIDATION_RULES: Array<(state: Record<string, any>) => string | null> = [
    (s) =>
        s.book === null && s.readingProgress !== null
            ? 'Reading progress exists but no book is loaded'
            : null,
    (s) =>
        s.book !== null && s.book.chapters && s.currentChapterIndex >= s.book.chapters.length
            ? `Chapter index ${s.currentChapterIndex} >= chapter count ${s.book.chapters.length}`
            : null,
];

// ─── Validation Middleware ────────────────────────────────────────────────

const validateState = (state: any): void => {
    if (import.meta.env.PROD) return;

    const warnings: string[] = [];

    // Single-field validation
    for (const rule of VALIDATION_RULES) {
        const value = state[rule.key];
        if (value !== undefined && !rule.validate(value, state)) {
            warnings.push(rule.message(value));
        }
    }

    // Cross-field validation
    for (const rule of CROSS_VALIDATION_RULES) {
        const warning = rule(state);
        if (warning) warnings.push(warning);
    }

    // Report all warnings at once
    if (warnings.length > 0) {
        const message = `[State Validation] ${warnings.join('; ')}`;
        if (import.meta.env.DEV) {
            console.warn(message, state);
        }
    }
};

/**
 * Zustand middleware that runs state validation after every `set` call.
 * In development, warnings are emitted to the console.
 * Can be configured to throw in tests via `throwOnValidation`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validationMiddleware = (config: (...a: any[]) => any) => (set: (...a: any[]) => any, get: () => any, store: any) =>
  config(
    (...args: any[]) => {
      const result = set(...args);
      validateState(get());
      return result;
    },
    get,
    store
  );


// ─── Combined State Type ───────────────────────────────────────────────────────

export interface CinematifierState
    extends ReaderState,
        BookState,
        ProcessingState {
    reset: () => void;
}

// ─── Persist Configuration ────────────────────────────────────────────────────

/**
 * Controls which slice of state survives localStorage serialization.
 * Only persisted fields will be rehydrated on page load.
 */
const STORAGE_VERSION = 1;

const persistConfig = {
    name: 'cinematifier-storage',
    storage: createJSONStorage(() => localStorage),
    version: STORAGE_VERSION,
    partialize: (state: CinematifierState) => ({
        // Book & reading state
        book: state.book,
        readingProgress: state.readingProgress,
        // Reader preferences
        readerMode: state.readerMode,
        font: state.font,
        fontSize: state.fontSize,
        lineSpacing: state.lineSpacing,
        immersionLevel: state.immersionLevel,
        dyslexiaFont: state.dyslexiaFont,
        darkMode: state.darkMode,
    }),
    // Migration: when storage version increments, persisted data from older
    // versions is discarded and the store starts fresh with defaults.
    migrate: (persistedState: unknown, persistedVersion: number) => {
        if (persistedVersion !== STORAGE_VERSION) {
            console.warn(
                `[cinematifierStore] Storage version mismatch (found ${persistedVersion}, expected ${STORAGE_VERSION}). Resetting persisted state.`,
            );
            return undefined as unknown as CinematifierState;
        }
        return persistedState as CinematifierState;
    },
    // Merge strategy: on rehydrate, incoming persisted values take precedence
    // over store defaults but don't overwrite runtime-only state.
    merge: (persisted: unknown, current: CinematifierState) => ({
        ...current,
        ...(persisted as Partial<CinematifierState>),
    }),
};

// ─── Store Instantiation ──────────────────────────────────────────────────────

/**
 * Compose the middleware stack and create the store.
 * Middleware order (outer → inner):
 *   devtools (enabled in dev only) → subscribeWithSelector → persist → validation
 *
 * devtools is always in the stack but its `enabled` flag gates browser extension
 * connectivity — this keeps the TypeScript middleware tuple type uniform across
 * development and production builds.
 */
const store = create<CinematifierState>()(
    devtools(
        subscribeWithSelector(
            persist(
                validationMiddleware((set, get, store) => ({
                    ...createReaderSlice(set, get, store),
                    ...createBookSlice(set, get, store),
                    ...createProcessingSlice(set, get, store),

                    reset: () =>
                        set({
                            book: null,
                            readingProgress: null,
                            currentChapterIndex: 0,
                            isProcessing: false,
                            processingProgress: null,
                            error: null,
                        }),
                })),
                persistConfig,
            ),
        ),
        { enabled: import.meta.env.DEV, name: 'CinematifierStore' },
    ),
);

export const useCinematifierStore = store;

// ─── Domain-specific Facade Hooks ───────────────────────────────────────────

/**
 * Type-safe facade over the combined store for Reader domain.
 *
 * @example
 * ```ts
 * // Select a single value
 * const darkMode = useReaderStore(s => s.darkMode);
 *
 * // Select multiple values (wrap in a stable selector)
 * const { fontSize, lineSpacing } = useReaderStore(
 *   s => ({ fontSize: s.fontSize, lineSpacing: s.lineSpacing }),
 *   shallow,
 * );
 * ```
 */
export const useReaderStore = Object.assign(
    <U = ReaderState>(selector?: (state: ReaderState) => U) => {
        return useCinematifierStore(
            (selector ? selector : (state: ReaderState) => state) as (state: CinematifierState) => U
        );
    },
    {
        getState: () => useCinematifierStore.getState() as unknown as ReaderState,
        subscribe: (listener: (state: ReaderState, prevState: ReaderState) => void) => {
            return useCinematifierStore.subscribe((state, prevState) => {
                listener(state as unknown as ReaderState, prevState as unknown as ReaderState);
            });
        },
    }
);

/**
 * Type-safe facade over the combined store for Book domain.
 */
export const useBookStore = Object.assign(
    <U = BookState>(selector?: (state: BookState) => U) => {
        return useCinematifierStore(
            (selector ? selector : (state: BookState) => state) as (state: CinematifierState) => U
        );
    },
    {
        getState: () => useCinematifierStore.getState() as unknown as BookState,
        subscribe: (listener: (state: BookState, prevState: BookState) => void) => {
            return useCinematifierStore.subscribe((state, prevState) => {
                listener(state as unknown as BookState, prevState as unknown as BookState);
            });
        },
    }
);

/**
 * Type-safe facade over the combined store for Processing domain.
 */
export const useProcessingStore = Object.assign(
    <U = ProcessingState>(selector?: (state: ProcessingState) => U) => {
        return useCinematifierStore(
            (selector ? selector : (state: ProcessingState) => state) as (state: CinematifierState) => U
        );
    },
    {
        getState: () => useCinematifierStore.getState() as unknown as ProcessingState,
        subscribe: (listener: (state: ProcessingState, prevState: ProcessingState) => void) => {
            return useCinematifierStore.subscribe((state, prevState) => {
                listener(state as unknown as ProcessingState, prevState as unknown as ProcessingState);
            });
        },
    }
);

