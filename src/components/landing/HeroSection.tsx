/**
 * HeroSection.tsx — Premium cinematic hero section
 */

import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import type { Book } from '../../types';

interface HeroSectionProps {
    book: Book | null;
    onContinue: () => void;
    onNewBook: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
    book,
    onContinue,
    onNewBook,
}) => {
    return (
        <div className="cin-hero-content">
            {/* Eyebrow label */}
            <div className="cin-eyebrow">
                <Sparkles size={12} aria-hidden="true" />
                AI-Powered Narrative Engine
            </div>

            {/* Main headline */}
            <h1 className="cin-hero-title">
                Transform Novels
                <br />
                <em>into Cinema</em>
            </h1>

            <p className="cin-hero-subtitle">
                Upload any novel PDF and watch it transform into a breathtaking
                cinematic reading experience — with dramatic SFX, emotional arcs,
                and screenplay-style formatting.
            </p>

            {/* Continue Reading CTA */}
            {book && (
                <div className="cin-resume-card">
                    <div className="cin-resume-card-info">
                        <BookOpen
                            size={18}
                            color="var(--primary)"
                            aria-hidden="true"
                        />
                        <div>
                            <div className="cin-resume-label">Currently in Library</div>
                            <div className="cin-resume-title">{book.title}</div>
                            {book.author && (
                                <div className="cin-resume-label">by {book.author}</div>
                            )}
                        </div>
                    </div>
                    <div className="cin-resume-actions">
                        <button
                            type="button"
                            className="cin-btn-primary"
                            onClick={onContinue}
                        >
                            <Sparkles size={15} aria-hidden="true" />
                            Continue Reading
                        </button>
                        <button
                            type="button"
                            className="cin-btn-ghost"
                            onClick={onNewBook}
                        >
                            New Book
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeroSection;
