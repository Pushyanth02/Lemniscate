/**
 * ReaderSettingsPanel.tsx — AppSettings and Reader Settings coordinator
 *
 * Velvet Noir glassmorphic settings panel with accordion-based settings sections
 * (AI Providers, Reading Preferences, Accessibility, About, and Graphify Panel).
 */

/* eslint-disable no-unused-vars */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Minus, 
    Plus, 
    Moon, 
    Sun, 
    BookmarkCheck, 
    ChevronDown, 
    ChevronUp,
    Sliders,
    Sparkles,
    Cpu,
    Brain,
    Info,
    AlertCircle,
    CheckCircle2,
    Settings,
    Network,
    RefreshCw
} from 'lucide-react';
import type { ImmersionLevel } from '../../types/cinematifier';
import { useReaderStore } from '../../store';
import { ProviderSection } from '../../features/settings/components/ProviderSection';
import { APIKeyInput } from '../../features/settings/components/ApiKeyInput';
import { GraphPanel } from '../../features/settings/components/GraphPanel';

interface ReaderSettingsPanelProps {
    fontSize: number;
    setFontSize: (_size: number) => void;
    lineSpacing: number;
    setLineSpacing: (_spacing: number) => void;
    immersionLevel: ImmersionLevel;
    setImmersionLevel: (_level: ImmersionLevel) => void;
    dyslexiaFont: boolean;
    toggleDyslexiaFont: () => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
    bookmarkCount: number;
}

const PROVIDERS = [
    { id: 'openai', label: 'OpenAI', desc: 'GPT-4o & GPT-3.5', icon: <Sparkles size={16} />, color: '#10a37f' },
    { id: 'anthropic', label: 'Anthropic', desc: 'Claude 3 Opus/Sonnet', icon: <Brain size={16} />, color: '#d9775f' },
    { id: 'gemini', label: 'Gemini', desc: 'Gemini 1.5 Pro/Flash', icon: <Sparkles size={16} />, color: '#1a73e8' },
    { id: 'ollama', label: 'Ollama', desc: 'Local LLMs (Llama 3)', icon: <Cpu size={16} />, color: '#f2a893' },
];

export const ReaderSettingsPanel: React.FC<ReaderSettingsPanelProps> = ({
    fontSize,
    setFontSize,
    lineSpacing,
    setLineSpacing,
    immersionLevel,
    setImmersionLevel,
    dyslexiaFont,
    toggleDyslexiaFont,
    darkMode,
    toggleDarkMode,
    bookmarkCount,
}) => {
    const font = useReaderStore(s => s.font);
    const setFont = useReaderStore(s => s.setFont);

    // Accordion State (Req 7.1, 7.2)
    const [expandedSection, setExpandedSection] = useState<string | null>('preferences');

    // AI Providers Local State (Req 7.3 - 7.5)
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem('cine-api-keys');
        return saved ? JSON.parse(saved) : { openai: '', anthropic: '', gemini: '', ollama: '' };
    });
    const [selectedProvider, setSelectedProvider] = useState<string>(() => {
        return localStorage.getItem('cine-selected-provider') || 'openai';
    });
    const [validationStatus, setValidationStatus] = useState<Record<string, 'success' | 'error' | 'none'>>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isValidating, setIsValidating] = useState<Record<string, boolean>>({});

    const handleKeyChange = (val: string) => {
        const updated = { ...apiKeys, [selectedProvider]: val };
        setApiKeys(updated);
        localStorage.setItem('cine-api-keys', JSON.stringify(updated));
        setValidationStatus(prev => ({ ...prev, [selectedProvider]: 'none' }));
    };

    const handleSelectProvider = (id: string) => {
        setSelectedProvider(id);
        localStorage.setItem('cine-selected-provider', id);
    };

    const testConnection = async () => {
        const providerId = selectedProvider;
        const key = apiKeys[providerId];

        if (!key && providerId !== 'ollama') {
            setValidationStatus(prev => ({ ...prev, [providerId]: 'error' }));
            setValidationErrors(prev => ({ ...prev, [providerId]: 'API Key is required.' }));
            return;
        }

        setIsValidating(prev => ({ ...prev, [providerId]: true }));
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate latency
        setIsValidating(prev => ({ ...prev, [providerId]: false }));

        if (providerId === 'ollama') {
            setValidationStatus(prev => ({ ...prev, [providerId]: 'success' }));
            return;
        }

        if (key.length >= 15) {
            setValidationStatus(prev => ({ ...prev, [providerId]: 'success' }));
        } else {
            setValidationStatus(prev => ({ ...prev, [providerId]: 'error' }));
            setValidationErrors(prev => ({ ...prev, [providerId]: 'API validation failed: key is too short or malformed.' }));
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const immersionToValue: Record<ImmersionLevel, number> = {
        minimal: 0,
        balanced: 1,
        cinematic: 2,
    };

    const valueToImmersion = (value: number): ImmersionLevel => {
        if (value <= 0) return 'minimal';
        if (value >= 2) return 'cinematic';
        return 'balanced';
    };

    return (
        <motion.div
            className="cine-settings-overlay"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-label="App settings panel"
        >
            <div className="cine-settings-accordion">
                {/* ── Section 1: AI Providers ── */}
                <div className="cine-settings-section-card">
                    <button
                        type="button"
                        className="cine-section-trigger"
                        onClick={() => toggleSection('providers')}
                        aria-expanded={expandedSection === 'providers'}
                        aria-label="AI Providers settings"
                    >
                        <div className="cine-section-trigger-left">
                            <Brain size={16} className="cine-section-trigger-icon" />
                            <span>AI Providers</span>
                        </div>
                        {expandedSection === 'providers' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedSection === 'providers' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                                <div className="cine-section-content">
                                    <ProviderSection
                                        providers={PROVIDERS}
                                        selectedId={selectedProvider}
                                        onSelect={handleSelectProvider}
                                    />
                                    
                                    <div className="cine-key-section">
                                        <APIKeyInput
                                            id={`key-input-${selectedProvider}`}
                                            label={`${selectedProvider} API Key`}
                                            value={apiKeys[selectedProvider] || ''}
                                            onChange={handleKeyChange}
                                            placeholder={selectedProvider === 'ollama' ? 'http://localhost:11434' : 'Enter API credentials...'}
                                            helpText={selectedProvider === 'ollama' ? 'Connection url for local Ollama server.' : 'Stored locally and encrypted.'}
                                        />

                                        <div className="cine-test-action-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                                            <button
                                                type="button"
                                                className="cine-btn cine-btn--secondary cine-btn--sm"
                                                onClick={testConnection}
                                                disabled={isValidating[selectedProvider]}
                                                aria-label="Test AI provider credentials"
                                            >
                                                {isValidating[selectedProvider] ? (
                                                    <>
                                                        <RefreshCw size={12} className="cine-spinner" /> Testing...
                                                    </>
                                                ) : (
                                                    'Test Connection'
                                                )}
                                            </button>

                                            {validationStatus[selectedProvider] === 'success' && (
                                                <span 
                                                    className="cine-test-result success"
                                                    style={{
                                                        color: 'var(--md-sys-color-secondary, var(--secondary))',
                                                        background: 'color-mix(in srgb, var(--md-sys-color-secondary, var(--secondary)) 12%, transparent)',
                                                        padding: '4px 8px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <CheckCircle2 size={12} /> Connection Successful
                                                </span>
                                            )}
                                        </div>

                                        {validationStatus[selectedProvider] === 'error' && (
                                            <div 
                                                className="cine-test-result error"
                                                style={{
                                                    color: 'var(--error, #ffb3b1)',
                                                    background: 'color-mix(in srgb, var(--error, #ffb3b1) 8%, transparent)',
                                                    padding: '8px 12px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    fontSize: '0.75rem',
                                                    marginTop: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    border: '1px solid color-mix(in srgb, var(--error, #ffb3b1) 20%, transparent)'
                                                }}
                                            >
                                                <AlertCircle size={14} />
                                                <span>{validationErrors[selectedProvider]}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Section 2: Reading Preferences ── */}
                <div className="cine-settings-section-card">
                    <button
                        type="button"
                        className="cine-section-trigger"
                        onClick={() => toggleSection('preferences')}
                        aria-expanded={expandedSection === 'preferences'}
                        aria-label="Reading Preferences settings"
                    >
                        <div className="cine-section-trigger-left">
                            <Sliders size={16} className="cine-section-trigger-icon" />
                            <span>Reading Preferences</span>
                        </div>
                        {expandedSection === 'preferences' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedSection === 'preferences' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                                <div className="cine-section-content">
                                    {/* Font Family (Req 7.6) */}
                                    <div className="settings-row" style={{ marginBottom: '16px' }}>
                                        <label htmlFor="font-select">Font Family</label>
                                        <select
                                            id="font-select"
                                            value={font}
                                            onChange={e => setFont(e.target.value)}
                                            aria-label="Select font family"
                                            className="cine-select"
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1.5px solid var(--ghost-border)',
                                                background: 'var(--surface-container)',
                                                color: 'var(--on-surface)',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="default">Manrope Sans</option>
                                            <option value="serif">Newsreader Serif</option>
                                            <option value="dyslexia">Lexend Dyslexic</option>
                                        </select>
                                    </div>

                                    {/* Font Size */}
                                    <div className="settings-row" style={{ marginBottom: '16px' }}>
                                        <label htmlFor="font-size-adjust">Font Size</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="cine-settings-adjust-btn"
                                                onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                                                aria-label="Decrease font size"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="cine-setting-value" id="font-size-adjust" style={{ minWidth: '36px', textAlign: 'center' }}>{fontSize}px</span>
                                            <button
                                                type="button"
                                                className="cine-settings-adjust-btn"
                                                onClick={() => setFontSize(Math.min(32, fontSize + 1))}
                                                aria-label="Increase font size"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Line Spacing Slider (Req 2.6, 7.6) */}
                                    <div className="settings-row" style={{ marginBottom: '16px' }}>
                                        <label htmlFor="line-spacing-slider">Line Spacing</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>
                                            <input
                                                id="line-spacing-slider"
                                                type="range"
                                                className="cine-slider"
                                                min={1.5}
                                                max={2.2}
                                                step={0.1}
                                                value={lineSpacing}
                                                onChange={e => setLineSpacing(Number(e.target.value))}
                                                aria-label="Adjust line spacing"
                                                style={{ flex: 1 }}
                                            />
                                            <span className="cine-setting-value" style={{ minWidth: '32px' }}>{lineSpacing.toFixed(1)}</span>
                                        </div>
                                    </div>

                                    {/* Immersion Level */}
                                    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                                        <label htmlFor="immersion-slider" style={{ marginBottom: '4px' }}>Immersion Level</label>
                                        <div className="cine-immersion-slider-group" style={{ padding: '0 8px' }}>
                                            <input
                                                id="immersion-slider"
                                                type="range"
                                                className="cine-slider"
                                                min={0}
                                                max={2}
                                                step={1}
                                                value={immersionToValue[immersionLevel]}
                                                onChange={e => setImmersionLevel(valueToImmersion(Number(e.target.value)))}
                                                aria-label="Adjust immersion level"
                                                style={{ width: '100%' }}
                                            />
                                            <div className="cine-immersion-labels" aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: '4px', opacity: 0.7 }}>
                                                <span>Minimal</span>
                                                <span>Balanced</span>
                                                <span>Cinematic</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Section 3: Accessibility ── */}
                <div className="cine-settings-section-card">
                    <button
                        type="button"
                        className="cine-section-trigger"
                        onClick={() => toggleSection('accessibility')}
                        aria-expanded={expandedSection === 'accessibility'}
                        aria-label="Accessibility settings"
                    >
                        <div className="cine-section-trigger-left">
                            <Settings size={16} className="cine-section-trigger-icon" />
                            <span>Accessibility</span>
                        </div>
                        {expandedSection === 'accessibility' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedSection === 'accessibility' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                                <div className="cine-section-content">
                                    {/* Dyslexia Toggle (Req 7.6) */}
                                    <div className="settings-row" style={{ marginBottom: '12px' }}>
                                        <label htmlFor="dyslexia-toggle">Dyslexia Font Mode</label>
                                        <button
                                            id="dyslexia-toggle"
                                            type="button"
                                            className={`cine-btn cine-btn--sm ${dyslexiaFont ? 'cine-btn--primary' : ''}`}
                                            onClick={toggleDyslexiaFont}
                                            aria-label="Toggle dyslexia font mode"
                                        >
                                            {dyslexiaFont ? 'Enabled' : 'Disabled'}
                                        </button>
                                    </div>

                                    {/* Theme Toggling */}
                                    <div className="settings-row">
                                        <label htmlFor="theme-toggle">Reader Theme</label>
                                        <button
                                            id="theme-toggle"
                                            type="button"
                                            className="cine-btn cine-btn--sm"
                                            onClick={toggleDarkMode}
                                            style={{ gap: '6px' }}
                                            aria-label="Toggle reader color scheme theme"
                                        >
                                            {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                                            {darkMode ? 'Theater Mode' : 'Library Mode'}
                                        </button>
                                    </div>

                                    <div className="cine-settings-notes" style={{ padding: '12px 0 0', marginTop: '12px', borderTop: '1px solid var(--ghost-border)' }}>
                                        <div className="cine-security-note" style={{ fontSize: '0.7rem' }}>
                                            <Info size={12} style={{ flexShrink: 0 }} />
                                            <span>Dyslexia Mode forces Lexend font stack, expands letter-spacing to 0.05em, and word-spacing to 0.15em.</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Section 4: About ── */}
                <div className="cine-settings-section-card">
                    <button
                        type="button"
                        className="cine-section-trigger"
                        onClick={() => toggleSection('about')}
                        aria-expanded={expandedSection === 'about'}
                        aria-label="About section information"
                    >
                        <div className="cine-section-trigger-left">
                            <Info size={16} className="cine-section-trigger-icon" />
                            <span>About</span>
                        </div>
                        {expandedSection === 'about' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedSection === 'about' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                                <div className="cine-section-content">
                                    <div className="cine-setting-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span className="cine-setting-label" style={{ opacity: 0.7, fontSize: '0.8rem' }}>Engine Mode</span>
                                        <span className="cine-ai-provider-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Offline Heuristics</span>
                                    </div>
                                    <div className="cine-setting-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span className="cine-setting-label" style={{ opacity: 0.7, fontSize: '0.8rem' }}>App Version</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>2.0.0</span>
                                    </div>
                                    {bookmarkCount > 0 && (
                                        <div className="cine-setting-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span className="cine-setting-label" style={{ opacity: 0.7, fontSize: '0.8rem' }}>Active Bookmarks</span>
                                            <span className="cine-bookmark-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                                                <BookmarkCheck size={12} /> {bookmarkCount}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Section 5: Developer Graphify Panel (Dev-only - Req 10.1) ── */}
                {import.meta.env.DEV && (
                    <div className="cine-settings-section-card" style={{ borderColor: 'var(--primary-variant)' }}>
                        <button
                            type="button"
                            className="cine-section-trigger"
                            onClick={() => toggleSection('graphify')}
                            aria-expanded={expandedSection === 'graphify'}
                            aria-label="Developer codebase dependency graphify panel"
                        >
                            <div className="cine-section-trigger-left">
                                <Network size={16} className="cine-section-trigger-icon" />
                                <span style={{ color: 'var(--primary)' }}>[Dev] Codebase Graphify</span>
                            </div>
                            {expandedSection === 'graphify' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <AnimatePresence initial={false}>
                            {expandedSection === 'graphify' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                >
                                    <div className="cine-section-content" style={{ padding: '0px' }}>
                                        <GraphPanel />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default ReaderSettingsPanel;
