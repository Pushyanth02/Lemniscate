/**
 * cinematifier.ts — Compatibility re-export
 *
 * Re-exports all public APIs from the cinematifier engine.
 * This file exists for backward compatibility so that imports from
 * '../cinematifier' (relative to src/lib/) continue to resolve.
 *
 * The canonical source is src/lib/engine/cinematifier/ (via engine index).
 */

export * from './engine/cinematifier';
