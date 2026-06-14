/**
 * libraryStore.ts — Cloud library state (Supabase-backed book CRUD)
 *
 * Keeps a synced list of the user's books from the database.
 * Works alongside the local cinematifierStore — when a user is signed in,
 * books are persisted to Supabase in addition to localStorage.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Book } from '../types/book';
import { fetchBooks, createBook, updateBook, deleteBook } from '../lib/books';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LibraryState {
    /** All books fetched from Supabase for the current user */
    cloudBooks: Book[];
    /** True while any library operation is in flight */
    syncing: boolean;
    /** Last sync error message */
    syncError: string | null;

    // ── Actions ────────────────────────────────────────────────────────────
    /** Fetch all books from Supabase. Call after sign-in. */
    loadLibrary: () => Promise<void>;
    /** Save a new book to Supabase (called after local processing is done) */
    saveBook: (book: Book, userId: string) => Promise<void>;
    /** Update a book in Supabase */
    editBook: (id: string, updates: Partial<Book>) => Promise<void>;
    /** Delete a book from Supabase and local state */
    removeBook: (id: string) => Promise<void>;
    /** Clear cloud state on sign-out */
    clearLibrary: () => void;
    clearSyncError: () => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useLibraryStore = create<LibraryState>()(
    devtools(
        (set, get) => ({
            cloudBooks: [],
            syncing: false,
            syncError: null,

            loadLibrary: async () => {
                set({ syncing: true, syncError: null });
                try {
                    const books = await fetchBooks();
                    set({ cloudBooks: books, syncing: false });
                } catch (err) {
                    set({
                        syncing: false,
                        syncError: err instanceof Error ? err.message : 'Failed to load library',
                    });
                }
            },

            saveBook: async (book, userId) => {
                set({ syncing: true, syncError: null });
                try {
                    const saved = await createBook(book, userId);
                    set(s => ({
                        cloudBooks: [saved, ...s.cloudBooks],
                        syncing: false,
                    }));
                } catch (err) {
                    set({
                        syncing: false,
                        syncError: err instanceof Error ? err.message : 'Failed to save book',
                    });
                }
            },

            editBook: async (id, updates) => {
                set({ syncing: true, syncError: null });
                try {
                    const updated = await updateBook(id, updates);
                    set(s => ({
                        cloudBooks: s.cloudBooks.map(b => (b.id === id ? updated : b)),
                        syncing: false,
                    }));
                } catch (err) {
                    set({
                        syncing: false,
                        syncError: err instanceof Error ? err.message : 'Failed to update book',
                    });
                }
            },

            removeBook: async (id) => {
                set({ syncing: true, syncError: null });
                try {
                    await deleteBook(id);
                    set(s => ({
                        cloudBooks: s.cloudBooks.filter(b => b.id !== id),
                        syncing: false,
                    }));
                } catch (err) {
                    set({
                        syncing: false,
                        syncError: err instanceof Error ? err.message : 'Failed to delete book',
                    });
                }
            },

            clearLibrary: () => set({ cloudBooks: [], syncError: null }),
            clearSyncError: () => set({ syncError: null }),
        }),
        { enabled: import.meta.env.DEV, name: 'LibraryStore' },
    ),
);
