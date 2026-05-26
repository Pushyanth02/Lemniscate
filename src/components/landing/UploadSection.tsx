/**
 * UploadSection.tsx — Manuscript upload and validation wrapper panel
 */

import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { UploadZone } from './UploadZone';

interface UploadSectionProps {
    onFileSelect: (file: File) => void;
    isProcessing: boolean;
    error: string | null;
    onClearError: () => void;
    hasBook: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
    onFileSelect,
    isProcessing,
    error,
    onClearError,
    hasBook,
}) => {
    return (
        <div className="cin-upload-panel">
            {(!hasBook || isProcessing) && (
                <UploadZone
                    onFileSelect={onFileSelect}
                    isProcessing={isProcessing}
                />
            )}
            {hasBook && !isProcessing && (
                <div className="cin-change-book-panel">
                    <p className="cin-change-book-label">Load a different manuscript</p>
                    <UploadZone
                        onFileSelect={onFileSelect}
                        isProcessing={isProcessing}
                        compact
                    />
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="cin-error-card" role="alert" aria-live="polite">
                    <AlertCircle size={20} aria-hidden="true" />
                    <p className="cin-error-message">{error}</p>
                    <button
                        type="button"
                        className="cin-btn-ghost cin-btn-ghost--sm"
                        onClick={onClearError}
                        aria-label="Dismiss error"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default UploadSection;
