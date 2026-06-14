/**
 * LandingPage.tsx — Unified landing/home view for Cinematifier
 *
 * Coordinates Hero, Upload, features, footer, settings modal, theme triggers,
 * auth modal, and cloud library sync.
 */

import React, { useCallback, useState } from 'react';
import { Film, Moon, Sun, BookOpen, LogIn, LogOut, User, Loader2 } from 'lucide-react';
import { useCinematifierStore } from '../../store/cinematifierStore';
import { useShallow } from 'zustand/shallow';
import { useBookHydration, useFileProcessing } from '../../hooks';
import { useAppRouter } from '../layout/AppRouter';
import { useAuthStore } from '../../store/authStore';
import { useLibraryStore } from '../../store/libraryStore';
import { AuthModal } from '../ui/AuthModal';

import HeroSection from './HeroSection';
import UploadSection from './UploadSection';
import FeatureShowcase from './FeatureShowcase';
import LandingFooter from './LandingFooter';
import ProcessingOverlay from './ProcessingOverlay';

export const LandingPage: React.FC = () => {
    const {
        book,
        isProcessing,
        processingProgress,
        error,
        darkMode,
        setError,
        toggleDarkMode,
        reset,
    } = useCinematifierStore(
        useShallow(s => ({
            book: s.book,
            isProcessing: s.isProcessing,
            processingProgress: s.processingProgress,
            error: s.error,
            darkMode: s.darkMode,
            setError: s.setError,
            toggleDarkMode: s.toggleDarkMode,
            reset: s.reset,
        }))
    );

    const { user, signOut, loading: authLoading } = useAuthStore();
    const { saveBook, syncing } = useLibraryStore();
    const [showAuth, setShowAuth] = useState(false);
    const { navigate } = useAppRouter();

    useBookHydration();

    // After a book finishes processing, navigate to reader and sync to cloud if signed in
    const handleProcessingDone = useCallback(async (processedBook: typeof book) => {
        navigate('/reader');
        if (user && processedBook) {
            await saveBook(processedBook, user.id);
        }
    }, [navigate, user, saveBook]);

    const processFile = useFileProcessing(
        useCallback(() => {
            // Get current book from store after processing
            const currentBook = useCinematifierStore.getState().book;
            handleProcessingDone(currentBook);
        }, [handleProcessingDone])
    );

    const handleContinueReading = useCallback(() => {
        if (book) navigate('/reader');
    }, [book, navigate]);

    const handleNewBook = useCallback(() => reset(), [reset]);
    const handleClearError = useCallback(() => setError(null), [setError]);

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--md-sys-color-background, var(--surface))',
                color: 'var(--md-sys-color-on-surface, var(--on-surface))',
            }}
        >
            <div className="cin-app-home">
                <div className="cin-hero-glow cin-hero-glow--1" aria-hidden="true" />
                <div className="cin-hero-glow cin-hero-glow--2" aria-hidden="true" />

                {/* ── Header ── */}
                <header className="cin-header" role="banner" aria-label="Site header">
                    <a href="#main-content" className="skip-to-content">
                        Skip to main content
                    </a>

                    <div className="cin-header-brand">
                        <Film
                            size={28}
                            color="var(--md-sys-color-primary, var(--primary))"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <span className="cin-brand-name">Cinematifier</span>
                    </div>

                    {book && !isProcessing && (
                        <nav className="cin-header-nav" aria-label="Primary navigation">
                            <button
                                type="button"
                                className="cin-nav-link"
                                onClick={handleContinueReading}
                            >
                                <BookOpen size={16} aria-hidden="true" />
                                Library
                            </button>
                        </nav>
                    )}

                    <div className="cin-header-actions">
                        {/* Cloud sync indicator */}
                        {syncing && (
                            <span
                                className="cin-ai-badge"
                                title="Syncing to cloud…"
                                aria-live="polite"
                                aria-label="Syncing library"
                            >
                                <Loader2 size={12} className="spinning" aria-hidden="true" />
                                Syncing
                            </span>
                        )}

                        {!syncing && (
                            <span className="cin-ai-badge">
                                <span className="cin-ai-badge-dot" aria-hidden="true" />
                                {user ? 'Cloud Sync' : 'Offline Mode'}
                            </span>
                        )}

                        {/* Auth button */}
                        {user ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    title={user.email}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: 'var(--primary)',
                                        color: 'var(--on-primary)',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-headline)',
                                        flexShrink: 0,
                                    }}
                                    aria-label={`Signed in as ${user.email}`}
                                >
                                    {user.user_metadata?.full_name?.charAt(0)?.toUpperCase()
                                        ?? user.email?.charAt(0)?.toUpperCase()
                                        ?? <User size={14} />}
                                </span>
                                <button
                                    type="button"
                                    className="cin-icon-btn"
                                    onClick={signOut}
                                    disabled={authLoading}
                                    title="Sign out"
                                    aria-label="Sign out"
                                >
                                    {authLoading
                                        ? <Loader2 size={16} className="spinning" aria-hidden="true" />
                                        : <LogOut size={16} strokeWidth={1.5} />
                                    }
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="cin-btn-ghost cin-btn-ghost--sm"
                                onClick={() => setShowAuth(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                            >
                                <LogIn size={15} aria-hidden="true" />
                                Sign In
                            </button>
                        )}

                        <button
                            type="button"
                            className="cin-icon-btn"
                            onClick={toggleDarkMode}
                            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {darkMode
                                ? <Sun size={18} strokeWidth={1.5} />
                                : <Moon size={18} strokeWidth={1.5} />
                            }
                        </button>
                    </div>
                </header>

                {/* ── Hero & Upload Section ── */}
                <main id="main-content" role="main" className="cin-hero" aria-label="Main content">
                    <HeroSection
                        book={book}
                        onContinue={handleContinueReading}
                        onNewBook={handleNewBook}
                    />

                    <UploadSection
                        onFileSelect={processFile}
                        isProcessing={isProcessing}
                        error={error}
                        onClearError={handleClearError}
                        hasBook={!!book}
                    />
                </main>

                <FeatureShowcase />
                <LandingFooter />
            </div>

            {isProcessing && processingProgress && (
                <ProcessingOverlay progress={processingProgress} />
            )}

            {/* Auth modal */}
            <AuthModal
                open={showAuth}
                onClose={() => setShowAuth(false)}
            />
        </div>
    );
};

export default LandingPage;
