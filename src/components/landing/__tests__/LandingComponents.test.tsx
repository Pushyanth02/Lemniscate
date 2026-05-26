import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroSection } from '../HeroSection';
import { UploadSection } from '../UploadSection';
import { FeatureShowcase } from '../FeatureShowcase';
import { LandingFooter } from '../LandingFooter';
import type { Book } from '../../../types';

// Mock Lucide icons to avoid rendering complexities in unit tests
vi.mock('lucide-react', async () => {
    const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react');
    return {
        ...actual,
    };
});

const mockBook: Book = {
    id: 'test-book-id',
    title: 'War and Peace',
    author: 'Leo Tolstoy',
    chapters: [],
    genre: 'other',
    status: 'ready',
    totalChapters: 0,
    processedChapters: 0,
    isPublic: false,
    totalWordCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
};

describe('HeroSection Component', () => {
    it('renders landing hero text correctly', () => {
        render(
            <HeroSection
                book={null}
                onContinue={vi.fn()}
                onNewBook={vi.fn()}
            />,
        );

        expect(screen.getByText('Transform Novels')).toBeInTheDocument();
        expect(screen.getByText('AI-Powered Narrative Engine')).toBeInTheDocument();
        expect(screen.queryByText('Continue Reading')).not.toBeInTheDocument();
    });

    it('renders resume card when currently reading book is loaded', () => {
        const onContinueSpy = vi.fn();
        const onNewBookSpy = vi.fn();

        render(
            <HeroSection
                book={mockBook}
                onContinue={onContinueSpy}
                onNewBook={onNewBookSpy}
            />,
        );

        expect(screen.getByText('Currently in Library')).toBeInTheDocument();
        expect(screen.getByText('War and Peace')).toBeInTheDocument();
        expect(screen.getByText('by Leo Tolstoy')).toBeInTheDocument();

        const continueBtn = screen.getByRole('button', { name: /Continue Reading/i });
        const newBookBtn = screen.getByRole('button', { name: /New Book/i });

        fireEvent.click(continueBtn);
        expect(onContinueSpy).toHaveBeenCalledOnce();

        fireEvent.click(newBookBtn);
        expect(onNewBookSpy).toHaveBeenCalledOnce();
    });
});

describe('UploadSection Component', () => {
    it('renders upload zone when no book exists', () => {
        render(
            <UploadSection
                onFileSelect={vi.fn()}
                isProcessing={false}
                error={null}
                onClearError={vi.fn()}
                hasBook={false}
            />,
        );

        expect(screen.getByText('Drop your manuscript')).toBeInTheDocument();
        expect(screen.queryByText('Load a different manuscript')).not.toBeInTheDocument();
    });

    it('renders compact upload option when book exists', () => {
        render(
            <UploadSection
                onFileSelect={vi.fn()}
                isProcessing={false}
                error={null}
                onClearError={vi.fn()}
                hasBook={true}
            />,
        );

        expect(screen.getByText('Load a different manuscript')).toBeInTheDocument();
        expect(screen.queryByText('Drop your manuscript')).not.toBeInTheDocument();
    });

    it('renders alert error and triggers dismissal on click', () => {
        const clearSpy = vi.fn();
        render(
            <UploadSection
                onFileSelect={vi.fn()}
                isProcessing={false}
                error="Invalid manuscript format"
                onClearError={clearSpy}
                hasBook={false}
            />,
        );

        expect(screen.getByText('Invalid manuscript format')).toBeInTheDocument();
        const dismissBtn = screen.getByRole('button', { name: /Dismiss error/i });
        fireEvent.click(dismissBtn);
        expect(clearSpy).toHaveBeenCalledOnce();
    });
});

describe('FeatureShowcase Component', () => {
    it('renders key features strip properly', () => {
        render(<FeatureShowcase />);
        expect(screen.getByText('Cinematic Blocks')).toBeInTheDocument();
        expect(screen.getByText('Emotion Engine')).toBeInTheDocument();
        expect(screen.getByText('Dual Modes')).toBeInTheDocument();
        expect(screen.getByText('Offline-First')).toBeInTheDocument();
    });
});

describe('LandingFooter Component', () => {
    it('renders successfully', () => {
        render(<LandingFooter />);
        expect(screen.getByText('InfinityCN · Cinematifier')).toBeInTheDocument();
    });
});
