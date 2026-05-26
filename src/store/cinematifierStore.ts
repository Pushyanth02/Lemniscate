/**
 * cinematifierStore.ts — Combined Zustand Store for Cinematifier
 *
 * Composes domain-specific slices into a single unified store
 * for backward compatibility and persistent state synchronization.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createReaderSlice, type ReaderState } from './readerStore';
import { createBookSlice, type BookState } from './bookStore';
import { createProcessingSlice, type ProcessingState } from './processingStore';

// ─── Combined State Type ───────────────────────────────────────────────────────

export interface CinematifierState
    extends ReaderState,
        BookState,
        ProcessingState {
    reset: () => void;
}

// ─── Store Instantiation ──────────────────────────────────────────────────────

export const useCinematifierStore = create<CinematifierState>()(
    persist(
        (set, get, store) => ({
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
        }),
        {
            name: 'cinematifier-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: state => ({
                readerMode: state.readerMode,
                font: state.font,
                fontSize: state.fontSize,
                lineSpacing: state.lineSpacing,
                immersionLevel: state.immersionLevel,
                dyslexiaFont: state.dyslexiaFont,
                darkMode: state.darkMode,
            }),
        },
    ),
);

// ─── Domain-specific Facade Hooks ───────────────────────────────────────────

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

