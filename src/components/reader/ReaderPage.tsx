/**
 * ReaderPage.tsx — Reader View Coordinator Page
 *
 * Coordinates header, sidebars, content view, settings panel, and footer.
 * Features a Netflix-inspired dark cinematic UI with ambient effects.
 */

import React, { useRef, useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import type { ReaderMode } from '../../types/cinematifier';

// Consolidated reader state
import { useReaderState } from '../../hooks/useReaderState';
import { useMoodStore } from '../../store';
import type { MoodCategory } from '../../lib/engine/cinematifier/moodLexicon';


// Other custom hooks
import {
    useReadingProgress,
    useChapterProcessing,
    useReaderAnalytics,
} from '../../hooks';

// Extracted sub-components
import { CinematicRenderer } from './CinematicRenderer';
import { OriginalTextView } from './OriginalTextView';
import { EmotionHeatmap } from './EmotionHeatmap';
import { ReaderChapterSidebar } from './ReaderChapterSidebar';
import { ReaderCharactersPanel } from './ReaderCharactersPanel';
import { ReaderHeader } from './ReaderHeader';
import { ReaderFooter } from './ReaderFooter';

// Hoisted constant to avoid recreating the threshold array on every render cycle
const OBSERVER_THRESHOLDS: number[] = [0, 0.25, 0.5, 0.75, 1];

function computeScrollRatio(node: HTMLElement): number {
    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    if (maxScroll <= 0) return 0;
    return Math.min(1, Math.max(0, node.scrollTop / maxScroll));
}

function scrollToRatio(node: HTMLElement, ratio: number): void {
    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    node.scrollTop = maxScroll * Math.min(1, Math.max(0, ratio));
}

const ReaderSettingsPanel = lazy(() =>
    import('./ReaderSettingsPanel').then(module => ({
        default: module.ReaderSettingsPanel,
    })),
);

interface ReaderPageProps {
    onClose: () => void;
}

export const ReaderPage: React.FC<ReaderPageProps> = ({ onClose }) => {
    // State from reader store
    const reader = useReaderState();
    const {
        book,
        currentChapter,
        currentChapterIndex,
        blocks,
        readerMode,
        fontSize,
        lineSpacing,
        immersionLevel,
        darkMode,
        dyslexiaFont,
        setReaderMode,
        setCurrentChapter,
        setFontSize,
        setLineSpacing,
        setImmersionLevel,
        toggleDarkMode,
        toggleDyslexiaFont,
    } = reader;

    const [showSettings, setShowSettings] = useState(false);
    const [isChapterSidebarOpen, setIsChapterSidebarOpen] = useState(true);
    const [isInsightsSidebarOpen, setIsInsightsSidebarOpen] = useState(true);

    // Cross-chunk tracking states
    const [activeEmotion, setActiveEmotion] = useState<string>('');
    const currentMood = useMoodStore(s => s.currentMood);


    const contentRef = useRef<HTMLDivElement>(null);
    const modeScrollRatioRef = useRef<Record<ReaderMode, number>>({
        original: 0,
        cinematified: 0,
    });
    const previousModeRef = useRef<ReaderMode>(readerMode);
    const lastScrollYRef = useRef(0);
    const [isHeaderHidden, setIsHeaderHidden] = useState(false);

    // Custom hooks for reading progress
    const { readingProgress, bookmarks, isBookmarked, toggleBookmark } = useReadingProgress();
    const { isProcessingChapter, processCurrentChapter, cancelProcessing, sceneState } =
        useChapterProcessing(currentChapter, currentChapterIndex, readerMode);
    const readerInsights = useReaderAnalytics({
        book,
        readingProgress,
        currentChapterIndex,
        readerMode,
        contentRef,
    });

    const activeStreamBlocks = currentChapter
        ? sceneState?.(currentChapter.id)?.accumulatedBlocks
        : undefined;

    // During active processing, use whichever array is larger (store might have pre-existing blocks)
    let blocksToRender = blocks;
    if (
        isProcessingChapter &&
        activeStreamBlocks &&
        activeStreamBlocks.length >= blocksToRender.length
    ) {
        blocksToRender = activeStreamBlocks;
    }

    // Active block tracking for dynamic themes and tension
    useEffect(() => {
        if (readerMode !== 'cinematified' || !contentRef.current) return;

        const root = contentRef.current;
        const observer = new IntersectionObserver(
            (entries: IntersectionObserverEntry[]) => {
                let maxRatio = 0;
                let bestEntry: IntersectionObserverEntry | null = null;

                entries.forEach(entry => {
                    if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                        maxRatio = entry.intersectionRatio;
                        bestEntry = entry;
                    }
                });

                if (bestEntry) {
                    const target = (bestEntry as IntersectionObserverEntry).target as HTMLElement;
                    const emotion = target.getAttribute('data-emotion') || '';
                    setActiveEmotion(emotion);

                    // Update real-time mood store
                    const mood = (emotion || 'neutral') as MoodCategory;
                    const scores = {
                        action: mood === 'action' ? 1 : 0,
                        suspense: mood === 'suspense' ? 1 : 0,
                        romantic: mood === 'romantic' ? 1 : 0,
                        dark: mood === 'dark' ? 1 : 0,
                        peaceful: mood === 'peaceful' ? 1 : 0,
                    };
                    useMoodStore.getState().setMood(mood, scores);
                    useMoodStore.getState().pushMoodHistory(mood);
                }
            },
            {
                root,
                rootMargin: '-20% 0px -40% 0px',
                threshold: OBSERVER_THRESHOLDS,
            },
        );

        const timeout = setTimeout(() => {
            root.querySelectorAll('.cine-block').forEach(block => observer.observe(block));
        }, 100);

        return () => {
            clearTimeout(timeout);
            observer.disconnect();
        };
    }, [currentChapter, readerMode]);


    // Scroll to top on chapter change
    useEffect(() => {
        modeScrollRatioRef.current.original = 0;
        modeScrollRatioRef.current.cinematified = 0;
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentChapterIndex]);

    // Keep per-mode reading positions and restore when toggling mode.
    useEffect(() => {
        const node = contentRef.current;
        if (!node) return;

        const previousMode = previousModeRef.current;
        if (previousMode !== readerMode) {
            modeScrollRatioRef.current[previousMode] = computeScrollRatio(node);
        }

        let frameA: number | null = null;
        let frameB: number | null = null;
        frameA = window.requestAnimationFrame(() => {
            frameB = window.requestAnimationFrame(() => {
                if (!contentRef.current) return;
                scrollToRatio(contentRef.current, modeScrollRatioRef.current[readerMode] ?? 0);
            });
        });

        previousModeRef.current = readerMode;

        return () => {
            if (frameA !== null) window.cancelAnimationFrame(frameA);
            if (frameB !== null) window.cancelAnimationFrame(frameB);
        };
    }, [readerMode]);

    // Continuously track the current mode's scroll ratio and handle auto-hide header.
    useEffect(() => {
        const node = contentRef.current;
        if (!node) return;

        const onScroll = () => {
            const currentScrollY = node.scrollTop;
            modeScrollRatioRef.current[readerMode] = computeScrollRatio(node);
            
            // Auto-hide header logic
            if (currentScrollY > 100) {
                if (currentScrollY > lastScrollYRef.current + 10) {
                    setIsHeaderHidden(true); // Scrolling down
                } else if (currentScrollY < lastScrollYRef.current - 10) {
                    setIsHeaderHidden(false); // Scrolling up
                }
            } else {
                setIsHeaderHidden(false); // Near top
            }
            lastScrollYRef.current = currentScrollY;
        };

        onScroll();
        node.addEventListener('scroll', onScroll, { passive: true });
        return () => node.removeEventListener('scroll', onScroll);
    }, [readerMode]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showSettings) setShowSettings(false);
                else if (isInsightsSidebarOpen) setIsInsightsSidebarOpen(false);
                else if (isChapterSidebarOpen) setIsChapterSidebarOpen(false);
                else onClose();
            } else if (e.key === 'ArrowLeft' && currentChapterIndex > 0) {
                setCurrentChapter(currentChapterIndex - 1);
            } else if (
                e.key === 'ArrowRight' &&
                book &&
                currentChapterIndex < book.chapters.length - 1
            ) {
                setCurrentChapter(currentChapterIndex + 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        currentChapterIndex,
        book,
        isChapterSidebarOpen,
        isInsightsSidebarOpen,
        onClose,
        setCurrentChapter,
        showSettings,
    ]);

    if (!book || !currentChapter) {
        return (
            <div className="cine-reader cine-reader--empty">
                <p>No book loaded.</p>
                <button onClick={onClose} className="cine-btn cine-btn--primary">
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div
            className={`cine-reader cine-reader--${readerMode} cine-reader--immersion-${immersionLevel} ${dyslexiaFont ? 'cine-reader--dyslexia' : ''} ${!darkMode ? 'cine-reader--light' : ''}`}
            data-active-emotion={activeEmotion}
            data-mood={currentMood}
        >

            {/* Ambient background effects (cinematic immersion only) */}
            {immersionLevel === 'cinematic' && darkMode && (
                <div className="cine-ambient">
                    <div className="cine-ambient-glow cine-ambient-glow--1" />
                    <div className="cine-ambient-glow cine-ambient-glow--2" />
                    <div className="cine-ambient-vignette" />
                </div>
            )}

            {/* Header */}
            <ReaderHeader
                book={book}
                readerMode={readerMode}
                setReaderMode={setReaderMode}
                isBookmarked={isBookmarked}
                currentChapterIndex={currentChapterIndex}
                toggleBookmark={toggleBookmark}
                onPreviousChapter={() => setCurrentChapter(Math.max(0, currentChapterIndex - 1))}
                onNextChapter={() => setCurrentChapter(Math.min(book.chapters.length - 1, currentChapterIndex + 1))}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onClose={onClose}
                isHidden={isHeaderHidden}
            />

            {/* Settings Panel */}
            <AnimatePresence>
                {showSettings && (
                    <Suspense fallback={null}>
                        <ReaderSettingsPanel
                            fontSize={fontSize}
                            setFontSize={setFontSize}
                            lineSpacing={lineSpacing}
                            setLineSpacing={setLineSpacing}
                            immersionLevel={immersionLevel}
                            setImmersionLevel={setImmersionLevel}
                            dyslexiaFont={dyslexiaFont}
                            toggleDyslexiaFont={toggleDyslexiaFont}
                            darkMode={darkMode}
                            toggleDarkMode={toggleDarkMode}
                            bookmarkCount={bookmarks.length}
                        />
                    </Suspense>
                )}
            </AnimatePresence>

            {/* 3-Panel Reader Body */}
            <div className="cine-reader-body">
                <ReaderChapterSidebar
                    chapters={book.chapters}
                    currentChapterIndex={currentChapterIndex}
                    onSelectChapter={setCurrentChapter}
                    isOpen={isChapterSidebarOpen}
                    onClose={() => setIsChapterSidebarOpen(false)}
                />
                
                {/* Scrollable Content */}
                <main
                    className="cine-content"
                    ref={contentRef}
                    style={
                        {
                            '--reader-font-size': `${fontSize}px`,
                            '--reader-line-height': lineSpacing,
                        } as React.CSSProperties
                    }
                >
                    <div className="cine-content-inner">
                        {/* Chapter Title */}
                        <div className="cine-chapter-header">
                            <span className="cine-chapter-number">
                                Chapter {currentChapter.number}
                            </span>
                            <h2 className="cine-chapter-title">{currentChapter.title}</h2>
                            <div className="cine-chapter-meta">
                                <span>{currentChapter.wordCount.toLocaleString()} words</span>
                                <span>·</span>
                                <span>{currentChapter.estimatedReadTime} min read</span>
                            </div>
                        </div>

                        {/* Emotion Heatmap */}
                        {currentChapter.cinematifiedBlocks.length > 0 && (
                            <EmotionHeatmap blocks={currentChapter.cinematifiedBlocks} />
                        )}
                        {isProcessingChapter &&
                            readerMode === 'cinematified' &&
                            currentChapter.cinematifiedBlocks.length === 0 && (
                                <div className="cine-processing">
                                    <Sparkles size={24} className="cine-processing-icon" />
                                    <p>Cinematifying chapter…</p>
                                    <button
                                        className="cine-btn cine-btn--secondary cine-mt-1"
                                        onClick={cancelProcessing}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                        {readerMode === 'original' ? (
                            <div className="cine-blocks-wrapper">
                                <OriginalTextView
                                    text={
                                        currentChapter.originalModeText ??
                                        currentChapter.originalText
                                    }
                                    scenes={currentChapter.originalModeScenes}
                                    containerRef={contentRef}
                                />
                            </div>
                        ) : blocksToRender && blocksToRender.length > 0 ? (
                            <div className="cine-blocks-wrapper">
                                <CinematicRenderer
                                    blocks={blocksToRender}
                                    immersionLevel={immersionLevel}
                                    containerRef={contentRef}
                                />
                                {isProcessingChapter && (
                                    <div className="cine-processing cine-processing-inline">
                                        <Sparkles size={16} className="cine-processing-icon" />
                                        <p>Generating…</p>
                                    </div>
                                )}
                            </div>
                        ) : !isProcessingChapter ? (
                            <div className="cine-blocks-wrapper">
                                <div className="cine-empty-state">
                                    <Film size={48} />
                                    <p>
                                        {currentChapter.status === 'error'
                                            ? 'Chapter processing failed'
                                            : 'Chapter not yet cinematified'}
                                    </p>
                                    {currentChapter.errorMessage && (
                                        <p className="cine-error-message">
                                            {currentChapter.errorMessage}
                                        </p>
                                    )}
                                    <button
                                        className="cine-btn cine-btn--primary"
                                        onClick={processCurrentChapter}
                                    >
                                        <Sparkles size={16} />
                                        Process Now
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </main>

                <ReaderCharactersPanel
                    insights={readerInsights}
                    isOpen={isInsightsSidebarOpen}
                    onClose={() => setIsInsightsSidebarOpen(false)}
                />
            </div>

            {/* Chapter Navigation Footer */}
            <ReaderFooter
                book={book}
                currentChapterIndex={currentChapterIndex}
                setCurrentChapter={setCurrentChapter}
                readingProgress={readingProgress}
            />
        </div>
    );
};

export default ReaderPage;
