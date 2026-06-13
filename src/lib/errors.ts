/**
 * errors.ts — Standardized Error Classes
 *
 * Provides a consistent error hierarchy for the application. Every error
 * includes a machine-readable `code`, a human-readable `message`, and
 * optional `recovery` suggestions for the user.
 *
 * @example
 * ```ts
 * throw new ProcessingError('EC_CHAPTER_FAILED', 'Chapter 3 failed to process', {
 *   recovery: 'Try re-processing with offline mode enabled.',
 *   chapterIndex: 3,
 * });
 * ```
 */

// ─── Error Code Registry ────────────────────────────────────────────────────

/**
 * Central registry of all application error codes.
 * Each entry maps to a unique string constant for greppability.
 */
export const ErrorCodes = {
    // ── Processing Errors ────────────────────────────────────────────────
    /** A chapter failed during cinematification. */
    EC_CHAPTER_FAILED: 'EC_CHAPTER_FAILED',
    /** All chapters in a book failed to process. */
    EC_ALL_CHAPTERS_FAILED: 'EC_ALL_CHAPTERS_FAILED',
    /** Job was not found in the job queue. */
    EC_JOB_NOT_FOUND: 'EC_JOB_NOT_FOUND',
    /** Job has no source text to process. */
    EC_JOB_NO_SOURCE: 'EC_JOB_NO_SOURCE',
    /** Pipeline stage encountered an unexpected error. */
    EC_PIPELINE_STAGE_FAILED: 'EC_PIPELINE_STAGE_FAILED',

    // ── State Errors ─────────────────────────────────────────────────────
    /** State validation failed. */
    EC_STATE_VALIDATION: 'EC_STATE_VALIDATION',
    /** Tried to access state before it was initialized. */
    EC_STATE_NOT_INITIALIZED: 'EC_STATE_NOT_INITIALIZED',

    // ── Data Errors ──────────────────────────────────────────────────────
    /** Book data is missing or null. */
    EC_BOOK_MISSING: 'EC_BOOK_MISSING',
    /** Chapter index is out of bounds. */
    EC_CHAPTER_OUT_OF_BOUNDS: 'EC_CHAPTER_OUT_OF_BOUNDS',
    /** Reading progress data is missing. */
    EC_PROGRESS_MISSING: 'EC_PROGRESS_MISSING',
    /** Failed to persist data to IndexedDB. */
    EC_PERSIST_FAILED: 'EC_PERSIST_FAILED',

    // ── UI Errors ─────────────────────────────────────────────────────────
    /** A component failed to render. */
    EC_RENDER_FAILED: 'EC_RENDER_FAILED',
    /** User interaction is not allowed in current state. */
    EC_ACTION_NOT_ALLOWED: 'EC_ACTION_NOT_ALLOWED',

    // ── Network / External Errors ─────────────────────────────────────────
    /** AI provider returned an error. */
    EC_AI_PROVIDER_FAILED: 'EC_AI_PROVIDER_FAILED',
    /** Network request timed out. */
    EC_TIMEOUT: 'EC_TIMEOUT',
    /** Resource not found. */
    EC_NOT_FOUND: 'EC_NOT_FOUND',
} as const;

/** Union type of all error codes. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ─── Error Class Hierarchy ──────────────────────────────────────────────────

export interface ErrorOptions {
    /** Machine-readable error code (from `ErrorCodes`). */
    code: ErrorCode;
    /** Human-readable description of what went wrong. */
    message: string;
    /** Optional suggestion for resolving the error. */
    recovery?: string;
    /** Optional cause (e.g., the original thrown error). */
    cause?: unknown;
    /** Optional metadata for debugging. */
    context?: Record<string, unknown>;
}

/**
 * Base application error class.
 * All domain-specific errors should extend this class.
 */
export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly recovery?: string;
    public readonly context?: Record<string, unknown>;
    public readonly timestamp: number;

    constructor(options: ErrorOptions) {
        super(options.message);
        this.name = 'AppError';
        this.code = options.code;
        this.recovery = options.recovery;
        this.context = options.context;
        this.timestamp = Date.now();

        // Capture stack trace, excluding constructor from it
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }

        // Set cause if provided
        if (options.cause instanceof Error) {
            this.cause = options.cause;
        }
    }

    /** Returns a structured JSON representation of the error. */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            recovery: this.recovery,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
}

/** Thrown when a processing pipeline stage fails. */
export class ProcessingError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options: Partial<ErrorOptions> = {},
    ) {
        super({
            code,
            message,
            recovery: options.recovery ?? 'Try re-processing with offline mode enabled.',
            cause: options.cause,
            context: options.context,
        });
        this.name = 'ProcessingError';
    }
}

/** Thrown when the store encounters an invalid state or missing data. */
export class StateError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options: Partial<ErrorOptions> = {},
    ) {
        super({
            code,
            message,
            recovery: options.recovery ?? 'Try resetting the application state.',
            cause: options.cause,
            context: options.context,
        });
        this.name = 'StateError';
    }
}

/** Thrown when a book or chapter operation fails. */
export class BookError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options: Partial<ErrorOptions> = {},
    ) {
        super({
            code,
            message,
            recovery: options.recovery,
            cause: options.cause,
            context: options.context,
        });
        this.name = 'BookError';
    }
}

/** Thrown when a network or external service request fails. */
export class NetworkError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options: Partial<ErrorOptions> = {},
    ) {
        super({
            code,
            message,
            recovery: options.recovery ?? 'Check your connection and try again.',
            cause: options.cause,
            context: options.context,
        });
        this.name = 'NetworkError';
    }
}

// ─── Result Type (Monadic Error Handling) ───────────────────────────────────

/**
 * A discriminated union for safe error handling without try/catch.
 *
 * @example
 * ```ts
 * const result = await tryCatch(processBook(book));
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export type Result<T, E = AppError> =
    | { ok: true; value: T }
    | { ok: false; error: E };

/** Wraps a promise into a `Result` for safe error handling. */
export async function tryCatch<T, E = AppError>(
    promise: Promise<T>,
): Promise<Result<T, E>> {
    try {
        const value = await promise;
        return { ok: true, value };
    } catch (error) {
        return { ok: false, error: error as E };
    }
}

/** Wraps a synchronous function into a `Result`. */
export function tryCatchSync<T, E = AppError>(
    fn: () => T,
): Result<T, E> {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        return { ok: false, error: error as E };
    }
}