/* eslint-disable no-unused-vars */
import React from 'react';
import {
  X,
  Film,
  BookOpen,
  Settings,
  Bookmark,
  BookmarkCheck,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { ReaderMode, Book } from '../../types/cinematifier';
import './ReaderHeader.css';

// Delay before revoking blob URLs to give the browser time to start the download
const DOWNLOAD_REVOKE_DELAY_MS = 1000;

interface M3ReaderHeaderProps {
  book: Book;
  readerMode: ReaderMode;
  setReaderMode: (mode: ReaderMode) => void;
  isBookmarked: boolean;
  currentChapterIndex: number;
  toggleBookmark: (chapterIndex: number) => void;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onToggleSettings: () => void;
  onClose: () => void;
  isHidden?: boolean;
  isScrolled?: boolean;
}

export const M3ReaderHeader: React.FC<M3ReaderHeaderProps> = ({
  book,
  readerMode,
  setReaderMode,
  isBookmarked,
  currentChapterIndex,
  toggleBookmark,
  onPreviousChapter,
  onNextChapter,
  onToggleSettings,
  onClose,
  isHidden = false,
  isScrolled = false,
}) => {
  const handleDownload = () => {
    const text = book.chapters
      .map(c => `Chapter ${c.number}: ${c.title}\n\n${c.originalModeText ?? c.originalText}`)
      .join('\n\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title}_Original_Text.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  };

  return (
    <header className={`m3-reader-header ${isHidden ? 'm3-reader-header--hidden' : ''} ${isScrolled ? 'm3-reader-header--scrolled' : ''}`}>
      <div className="m3-reader-header-left">
        <div className="m3-reader-header-book-info">
          <h1 className="m3-reader-header-book-title">{book.title}</h1>
          <span className="m3-reader-header-chapter">Chapter {book.chapters[currentChapterIndex]?.number}</span>
        </div>
      </div>

      <div className="m3-reader-header-center">
        <div className="m3-mode-segment" role="group" aria-label="Reading mode">
          <button
            className={`m3-mode-btn ${readerMode === 'original' ? 'active' : ''}`}
            onClick={() => setReaderMode('original')}
            aria-pressed={readerMode === 'original'}
          >
            <BookOpen size={14} strokeWidth={2} />
            <span>Original</span>
          </button>
          <button
            className={`m3-mode-btn ${readerMode === 'cinematified' ? 'active' : ''}`}
            onClick={() => setReaderMode('cinematified')}
            aria-pressed={readerMode === 'cinematified'}
          >
            <Film size={14} strokeWidth={2} />
            <span>Cinematized</span>
          </button>
        </div>
      </div>

      <div className="m3-reader-header-right">
        <div className="m3-reader-header-nav-group">
          <button
            className="m3-btn-icon m3-header-action"
            onClick={onPreviousChapter}
            disabled={currentChapterIndex === 0}
            title="Previous Chapter"
            aria-label="Previous Chapter"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="m3-btn-icon m3-header-action"
            onClick={onNextChapter}
            disabled={currentChapterIndex === book.chapters.length - 1}
            title="Next Chapter"
            aria-label="Next Chapter"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="m3-reader-header-separator" />
        <button
          className={`m3-btn-icon m3-header-action ${isBookmarked ? 'm3-btn--bookmarked' : ''}`}
          onClick={() => toggleBookmark(currentChapterIndex)}
          title={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
        >
          {isBookmarked ? <BookmarkCheck size={18} color="var(--md-sys-color-on-primary, var(--on-primary))" /> : <Bookmark size={18} />}
        </button>
        <button
          className="m3-btn-icon m3-header-action"
          onClick={handleDownload}
          title="Export Original Text"
          aria-label="Export Original Text"
        >
          <Download size={18} />
        </button>
        <button
          className="m3-btn-icon m3-header-action"
          onClick={onToggleSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
        <button
          className="m3-back-btn"
          onClick={onClose}
          title="Close"
          aria-label="Close reader"
        >
          <X size={18} />
          Close
        </button>
      </div>
    </header>
  );
};