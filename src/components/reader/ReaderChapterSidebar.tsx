import React, { useState, useMemo } from 'react';
import { ChevronLeft, Volume2, Search, X, BookmarkCheck, CheckCircle2, Sparkles } from 'lucide-react';
import type { Chapter } from '../../types/cinematifier';
import { useReadingProgress } from '../../hooks';

interface ReaderChapterSidebarProps {
    chapters: Chapter[];
    currentChapterIndex: number;
    onSelectChapter: (index: number) => void;
    isOpen: boolean;
    onClose: () => void;
}

export const ReaderChapterSidebar: React.FC<ReaderChapterSidebarProps> = ({
    chapters,
    currentChapterIndex,
    onSelectChapter,
    isOpen,
    onClose,
}) => {
    const { bookmarks, readingProgress } = useReadingProgress();
    const readChapters = readingProgress?.readChapters ?? [];
    
    const [searchQuery, setSearchQuery] = useState('');

    const filteredChapters = useMemo(() => {
        return chapters
            .map((chapter, index) => ({ chapter, index }))
            .filter(({ chapter }) => {
                const titleMatch = chapter.title.toLowerCase().includes(searchQuery.toLowerCase());
                const numMatch = `chapter ${chapter.number}`.toLowerCase().includes(searchQuery.toLowerCase());
                return titleMatch || numMatch;
            });
    }, [chapters, searchQuery]);

    return (
        <aside
            className={`cine-chapter-nav-sidebar ${isOpen ? '' : 'is-closed'}`}
            aria-label="Chapter navigation"
        >
            <div className="cine-chapter-nav-header">
                <h3 className="cine-chapter-nav-title">Chapters</h3>
                <button
                    type="button"
                    className="cine-sidebar-close"
                    onClick={onClose}
                    aria-label="Hide chapter sidebar"
                    title="Hide chapter sidebar"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Search Bar */}
            <div className="cine-sidebar-search-container">
                <div className="cine-sidebar-search-wrapper">
                    <Search size={14} className="cine-sidebar-search-icon" />
                    <input
                        type="text"
                        className="cine-sidebar-search-input"
                        placeholder="Search chapters..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        aria-label="Search chapters"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="cine-sidebar-search-clear"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chapter List */}
            <div className="cine-chapter-list">
                {filteredChapters.length > 0 ? (
                    filteredChapters.map(({ chapter, index }) => (
                        <button
                            key={chapter.id}
                            type="button"
                            className={`cine-chapter-item ${index === currentChapterIndex ? 'cine-chapter-item--active' : ''}`}
                            onClick={() => onSelectChapter(index)}
                            aria-current={index === currentChapterIndex ? 'page' : undefined}
                        >
                            <div className="cine-chapter-item-top">
                                <span className="cine-chapter-item-number">Chapter {chapter.number}</span>
                                <div className="cine-chapter-item-indicators">
                                    {bookmarks.includes(index) && (
                                        <span className="indicator-bookmark" title="Bookmarked">
                                            <BookmarkCheck size={12} />
                                        </span>
                                    )}
                                    {readChapters.includes(chapter.number) && (
                                        <span className="indicator-read" title="Read">
                                            <CheckCircle2 size={12} />
                                        </span>
                                    )}
                                    {(chapter.status === 'ready' || chapter.isProcessed) && (
                                        <span className="indicator-processed" title="Cinematified">
                                            <Sparkles size={12} />
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="cine-chapter-item-title">{chapter.title}</span>
                            <span className="cine-chapter-item-meta">
                                <Volume2 size={12} />
                                {chapter.estimatedReadTime} min
                            </span>
                        </button>
                    ))
                ) : (
                    <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', opacity: 0.5, fontSize: '0.75rem' }}>
                        No chapters match your search.
                    </div>
                )}
            </div>
        </aside>
    );
};
