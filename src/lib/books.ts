/**
 * books.ts — Supabase CRUD service for the books table
 *
 * All functions require an authenticated user (RLS enforces this).
 */

import { supabase } from './supabase';
import type { Book } from '../types/book';
import type { TablesInsert, TablesUpdate } from '../types/database';

// ─── Mappers ───────────────────────────────────────────────────────────────

/** Map a local Book to a Supabase insert payload */
function bookToInsert(book: Book, userId: string): TablesInsert<'books'> {
    return {
        id: book.id,
        user_id: userId,
        title: book.title,
        author: book.author ?? null,
        description: book.description ?? null,
        genre: book.genre,
        status: book.status,
        total_chapters: book.totalChapters,
        processed_chapters: book.processedChapters,
        total_word_count: book.totalWordCount,
        is_public: book.isPublic,
        file_url: book.fileUrl ?? null,
        error_message: book.errorMessage ?? null,
        chapters: book.chapters as unknown as import('../types/database').Json,
        characters: (book.characters ?? null) as unknown as import('../types/database').Json,
        entity_registry: (book.entityRegistry ?? null) as unknown as import('../types/database').Json,
    };
}

/** Map a Supabase row back to a local Book */
function rowToBook(row: import('../types/database').Tables<'books'>): Book {
    return {
        id: row.id,
        title: row.title,
        author: row.author ?? undefined,
        description: row.description ?? undefined,
        genre: row.genre as Book['genre'],
        status: row.status as Book['status'],
        totalChapters: row.total_chapters,
        processedChapters: row.processed_chapters,
        totalWordCount: row.total_word_count,
        isPublic: row.is_public,
        fileUrl: row.file_url ?? undefined,
        errorMessage: row.error_message ?? undefined,
        chapters: (row.chapters as unknown as Book['chapters']) ?? [],
        characters: (row.characters as unknown as Book['characters']) ?? undefined,
        entityRegistry: (row.entity_registry as unknown as Book['entityRegistry']) ?? undefined,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
    };
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

/** Fetch all books for the current user, ordered by most recent first */
export async function fetchBooks(): Promise<Book[]> {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(rowToBook);
}

/** Fetch a single book by ID */
export async function fetchBook(id: string): Promise<Book | null> {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
    }
    return rowToBook(data);
}

/** Save a new book to the database */
export async function createBook(book: Book, userId: string): Promise<Book> {
    const { data, error } = await supabase
        .from('books')
        .insert(bookToInsert(book, userId))
        .select()
        .single();

    if (error) throw error;
    return rowToBook(data);
}

/** Update an existing book */
export async function updateBook(id: string, updates: Partial<Book>): Promise<Book> {
    const payload: TablesUpdate<'books'> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.author !== undefined) payload.author = updates.author ?? null;
    if (updates.description !== undefined) payload.description = updates.description ?? null;
    if (updates.genre !== undefined) payload.genre = updates.genre;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.totalChapters !== undefined) payload.total_chapters = updates.totalChapters;
    if (updates.processedChapters !== undefined) payload.processed_chapters = updates.processedChapters;
    if (updates.totalWordCount !== undefined) payload.total_word_count = updates.totalWordCount;
    if (updates.isPublic !== undefined) payload.is_public = updates.isPublic;
    if (updates.fileUrl !== undefined) payload.file_url = updates.fileUrl ?? null;
    if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage ?? null;
    if (updates.chapters !== undefined) payload.chapters = updates.chapters as unknown as import('../types/database').Json;
    if (updates.characters !== undefined) payload.characters = (updates.characters ?? null) as unknown as import('../types/database').Json;
    if (updates.entityRegistry !== undefined) payload.entity_registry = (updates.entityRegistry ?? null) as unknown as import('../types/database').Json;

    const { data, error } = await supabase
        .from('books')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return rowToBook(data);
}

/** Delete a book by ID */
export async function deleteBook(id: string): Promise<void> {
    const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
