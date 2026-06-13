/**
 * AppShell.tsx — Root application shell, theme management, and router mounting
 */

import React, { useEffect, Suspense, lazy } from 'react';
import { useReaderStore } from '../../store';
import { AppRouter, useAppRouter } from './AppRouter';
import { PageTransition } from './PageTransition';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '../ui/ErrorBoundary';

// Lazy-loaded pages to optimize bundle size and support chunk splitting
const LandingPage = lazy(() => import('../landing/LandingPage'));
const ReaderPage = lazy(() => import('../reader/ReaderPage'));

const RouterViews: React.FC = () => {
    const { currentPath } = useAppRouter();

    return (
        <AnimatePresence mode="wait">
            {currentPath === '/reader' ? (
                <PageTransition routeKey="reader" key="reader">
                    <Suspense
                        fallback={
                            <div className="app-loading-screen">
                                <div className="app-loading-spinner" />
                            </div>
                        }
                    >
                        <ReaderPage onClose={() => (window.location.hash = '#/')} />
                    </Suspense>
                </PageTransition>
            ) : (
                <PageTransition routeKey="landing" key="landing">
                    <Suspense
                        fallback={
                            <div className="app-loading-screen">
                                <div className="app-loading-spinner" />
                            </div>
                        }
                    >
                        <LandingPage />
                    </Suspense>
                </PageTransition>
            )}
        </AnimatePresence>
    );
};

export const AppShell: React.FC = () => {
    const darkMode = useReaderStore(s => s.darkMode);

    // Sync theme with variables.css structure (data-theme="light" or default dark mode)
    useEffect(() => {
        if (darkMode) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }, [darkMode]);

    return (
        <ErrorBoundary>
            <AppRouter>
                <div
                    className="cin-app-shell"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100vh',
                        background: 'var(--md-sys-color-background, var(--surface))',
                        color: 'var(--md-sys-color-on-surface, var(--on-surface))',
                    }}
                >
                    <RouterViews />
                </div>
            </AppRouter>
        </ErrorBoundary>
    );
};

export default AppShell;
