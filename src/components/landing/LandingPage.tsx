/**
 * LandingPage.tsx — Unified landing/home view for Cinematifier
 *
 * Coordinates Hero, Upload, features, footer, settings modal, and theme triggers.
 */

import React, { useCallback } from 'react';
import { Film, Moon, Sun, BookOpen } from 'lucide-react';
import { useCinematifierStore } from '../../store/cinematifierStore';
import { useShallow } from 'zustand/shallow';
import { useBookHydration, useFileProcessing } from '../../hooks';
import { useAppRouter } from '../layout/AppRouter';

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

    const { navigate } = useAppRouter();


    useBookHydration();
    const processFile = useFileProcessing(useCallback(() => navigate('/reader'), [navigate]));

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
                background: 'var(--surface)',
                color: 'var(--on-surface)',
            }}
        >
            <div className="cin-app-home">
                {/* Ambient background glows */}
                <div className="cin-hero-glow cin-hero-glow--1" aria-hidden="true" />
                <div className="cin-hero-glow cin-hero-glow--2" aria-hidden="true" />

                {/* ── Header ── */}
                <header className="cin-header" role="banner">
                    <a href="#main-content" className="skip-to-content">
                        Skip to main content
                    </a>

                    <div className="cin-header-brand">
                        <Film
                            size={28}
                            color="var(--primary)"
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
                        <span className="cin-ai-badge">
                            <span className="cin-ai-badge-dot" aria-hidden="true" />
                            Offline Mode
                        </span>
                        <button
                            type="button"
                            className="cin-icon-btn"
                            onClick={toggleDarkMode}
                            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            aria-label={
                                darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'
                            }
                        >
                            {darkMode ? (
                                <Sun size={18} strokeWidth={1.5} />
                            ) : (
                                <Moon size={18} strokeWidth={1.5} />
                            )}
                        </button>
                    </div>
                </header>

                {/* ── Hero & Upload Section ── */}
                <main id="main-content" role="main" className="cin-hero">
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

                {/* ── Feature Strip ── */}
                <FeatureShowcase />

                {/* ── Footer ── */}
                <LandingFooter />
            </div>

            {/* ── Processing Overlay ── */}
            {isProcessing && processingProgress && (
                <ProcessingOverlay progress={processingProgress} />
            )}


        </div>
    );
};

export default LandingPage;
