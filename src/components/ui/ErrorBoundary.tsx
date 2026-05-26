import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div role="alert" className="cin-error-card" style={{ width: '100%', margin: '16px 0', boxSizing: 'border-box' }}>
                    <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'flex-start' }}>
                        <p className="cin-error-message">
                            <strong>Cinematic Engine Interrupted:</strong> {this.state.error?.message || 'An unexpected runtime error occurred.'}
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="cine-btn cine-btn--ghost cine-btn--sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px' }}
                        >
                            <RotateCcw size={14} />
                            Recover Component
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

