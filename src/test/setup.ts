/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend the global vitest expect with jest-dom matchers
// Note: Do NOT import { expect } from 'vitest' — vitest 4 globals mode
// provides a different expect instance than the module export
expect.extend(matchers as Parameters<typeof expect.extend>[0]);

// Mock window.matchMedia for JSDOM environment
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).URL.createObjectURL = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).indexedDB = {
    open: vi.fn(),
    deleteDatabase: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Worker = class {
    postMessage = vi.fn();
    terminate = vi.fn();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).IntersectionObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
};

// Mock framer-motion to bypass animation delays in the JSDOM test suite
import React from 'react';
import { vi } from 'vitest';

vi.mock('framer-motion', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
        motion: new Proxy(
            (props: any) => React.createElement('div', props),
            {
                get: (_target, key) => {
                    if (key === 'custom') return actual.motion?.custom;
                    return React.forwardRef(({ children, ...props }: any, ref: any) =>
                        React.createElement(key as string, { ...props, ref }, children)
                    );
                },
            }
        ) as any,
    };
});
