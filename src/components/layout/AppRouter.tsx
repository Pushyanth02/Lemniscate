/**
 * AppRouter.tsx — Lightweight hash-based client-side router
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useBookStore } from '../../store';

export type RoutePath = '/' | '/reader';

interface RouterContextType {
    currentPath: RoutePath;
    navigate: (path: RoutePath) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const AppRouter: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const book = useBookStore(s => s.book);

    // Parse current hash path
    const getPathFromHash = useCallback((): RoutePath => {
        const hash = window.location.hash;
        if (hash === '#/reader') {
            return book ? '/reader' : '/';
        }
        return '/';
    }, [book]);

    const [currentPath, setCurrentPath] = useState<RoutePath>(getPathFromHash);

    // Guard flag to prevent re-entrant hash changes
    const isNavigatingRef = useRef(false);

    const navigate = useCallback((path: RoutePath) => {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        window.location.hash = `#${path}`;
        // Release the guard after the hashchange event has been processed
        setTimeout(() => { isNavigatingRef.current = false; }, 0);
    }, []);

    // Listen to hashchange event
    useEffect(() => {
        const handleHashChange = () => {
            if (isNavigatingRef.current) return;

            const nextPath = getPathFromHash();
            setCurrentPath(nextPath);

            // Redirect to home if they attempted to go to reader without a book
            if (window.location.hash === '#/reader' && !book) {
                isNavigatingRef.current = true;
                window.location.hash = '#/';
                setTimeout(() => { isNavigatingRef.current = false; }, 0);
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [book, getPathFromHash]);

    // Guard: Redirect to landing page if book is cleared (e.g., clicking "New Book")
    useEffect(() => {
        if (!book && currentPath === '/reader') {
            navigate('/');
        }
    }, [book, currentPath, navigate]);

    return (
        <RouterContext.Provider value={{ currentPath, navigate }}>
            {children}
        </RouterContext.Provider>
    );
};

export const useAppRouter = () => {
    const context = useContext(RouterContext);
    if (!context) {
        throw new Error('useAppRouter must be used within an AppRouter provider');
    }
    return context;
};
