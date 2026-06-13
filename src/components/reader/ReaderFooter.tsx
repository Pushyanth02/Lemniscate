/* eslint-disable no-unused-vars */
/**
 * ReaderFooter.tsx — Chapter Navigation Footer
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReadingProgress, Book } from '../../types/cinematifier';
import { Scrubber } from '../ui/Scrubber';

interface ReaderFooterProps {
    book: Book;
    currentChapterIndex: number;
    setCurrentChapter: (index: number) => void;
    readingProgress: ReadingProgress | null;
}

export const ReaderFooter: React.FC<ReaderFooterProps> = ({
    book,
    currentChapterIndex,
    setCurrentChapter,
}) => {
    const canGoPrev = currentChapterIndex > 0;
    const canGoNext = currentChapterIndex < book.chapters.length - 1;

    const progressPercent = Math.round(
        ((currentChapterIndex + 1) / book.chapters.length) * 100
    );

    const totalRemainingMinutes = book.chapters
        .slice(currentChapterIndex)
        .reduce((sum, c) => sum + (c.estimatedReadTime || 0), 0);

    return (
        <footer className="cine-footer" aria-label="Chapter navigation">
            <button
                type="button"
                className="cine-btn cine-btn--ghost cine-footer-btn"
                onClick={() => setCurrentChapter(currentChapterIndex - 1)}
                disabled={!canGoPrev}
            >
                <ChevronLeft size={20} style={{ marginRight: '8px' }} />
                Previous
            </button>

            <div className="cine-footer-progress-wrap">
                <div className="cine-footer-progress-row" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                    <span 
                        style={{
                            color: 'var(--on-surface-variant)',
                            fontFamily: 'var(--font-label)',
                            fontSize: 'var(--md-sys-type-label-medium-font-size, 12px)',
                            fontWeight: 'var(--md-sys-type-label-medium-font-weight, 500)' as React.CSSProperties['fontWeight'],
                            letterSpacing: 'var(--md-sys-type-label-medium-letter-spacing, 0.5px)',
                        }}
                    >
                        {progressPercent}% completed · {totalRemainingMinutes} min remaining
                    </span>
                    <span 
                        style={{
                            color: 'var(--on-surface-variant)',
                            fontFamily: 'var(--font-label)',
                            fontSize: 'var(--md-sys-type-label-medium-font-size, 12px)',
                            fontWeight: 'var(--md-sys-type-label-medium-font-weight, 500)' as React.CSSProperties['fontWeight'],
                            letterSpacing: 'var(--md-sys-type-label-medium-letter-spacing, 0.5px)',
                        }}
                    >
                        {currentChapterIndex + 1} / {book.chapters.length}
                    </span>
                </div>
                <Scrubber progress={progressPercent} />
            </div>

            <button
                type="button"
                className="cine-btn cine-btn--ghost cine-footer-btn"
                onClick={() => setCurrentChapter(currentChapterIndex + 1)}
                disabled={!canGoNext}
            >
                Next
                <ChevronRight size={20} style={{ marginLeft: '8px' }} />
            </button>
        </footer>
    );
};
