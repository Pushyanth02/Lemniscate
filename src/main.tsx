import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AppShell from './components/layout/AppShell';

// Lazy load non-critical analytics — deferred from critical path
 
const Analytics = lazy(() =>
    import('@vercel/analytics/react').then(m => ({ default: m.Analytics })),
);
 
const SpeedInsights = lazy(() =>
    import('@vercel/speed-insights/react').then(m => ({ default: m.SpeedInsights })),
);

// Catch unhandled promise rejections so they don't fail silently
window.addEventListener('unhandledrejection', e => {
    console.error('[Unhandled Rejection]', e.reason);
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
    <StrictMode>
        <AppShell />
        <Suspense fallback={null}>
            <Analytics />
            <SpeedInsights />
        </Suspense>
    </StrictMode>,
);
