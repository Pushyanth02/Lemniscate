/**
 * AuthModal.tsx — Sign In / Sign Up with email + social OAuth
 *
 * Matches the project's Velvet Noir design system (cin- CSS vars, lucide-react).
 */

import React, { useState, useCallback, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, LogIn, UserPlus, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuthStore, type AuthView } from '../../store/authStore';

// ─── Social provider config ─────────────────────────────────────────────────

const SOCIAL_PROVIDERS = [
    {
        id: 'google' as const,
        label: 'Continue with Google',
        icon: (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17Z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07Z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3Z"/>
            </svg>
        ),
    },
    {
        id: 'github' as const,
        label: 'Continue with GitHub',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/>
            </svg>
        ),
    },
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

interface AuthModalProps {
    open: boolean;
    initialView?: AuthView;
    onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
    open,
    initialView = 'sign_in',
    onClose,
}) => {
    const emailId = useId();
    const passwordId = useId();

    const { signIn, signUp, signInWithOAuth, loading, authError, clearAuthError } = useAuthStore();

    const [view, setView] = useState<AuthView>(initialView);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [oauthLoading, setOauthLoading] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        clearAuthError();
        setSuccessMessage(null);
        setEmail('');
        setPassword('');
        setOauthLoading(null);
        onClose();
    }, [clearAuthError, onClose]);

    const handleSwitchView = (next: AuthView) => {
        clearAuthError();
        setSuccessMessage(null);
        setView(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearAuthError();
        setSuccessMessage(null);

        if (view === 'sign_in') {
            const error = await signIn(email, password);
            if (!error) handleClose();
        } else {
            const error = await signUp(email, password);
            if (!error) {
                setSuccessMessage('Check your email to confirm your account.');
                setEmail('');
                setPassword('');
            }
        }
    };

    const handleOAuth = async (provider: 'google' | 'github') => {
        setOauthLoading(provider);
        clearAuthError();
        const error = await signInWithOAuth(provider);
        if (error) setOauthLoading(null); // OAuth redirects away on success
    };

    const isAnyLoading = loading || oauthLoading !== null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="auth-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleClose}
                    role="presentation"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.65)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                    }}
                >
                    <motion.div
                        key="auth-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="auth-modal-title"
                        initial={{ opacity: 0, scale: 0.94, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 16 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--surface-container)',
                            border: '1px solid var(--ghost-border)',
                            borderRadius: '1.25rem',
                            padding: '2rem',
                            width: '100%',
                            maxWidth: '420px',
                            margin: '1rem',
                            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
                            <h2
                                id="auth-modal-title"
                                style={{
                                    margin: 0,
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-headline)',
                                    color: 'var(--on-surface)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                {view === 'sign_in'
                                    ? <><LogIn size={20} aria-hidden="true" /> Sign In</>
                                    : <><UserPlus size={20} aria-hidden="true" /> Create Account</>
                                }
                            </h2>
                            <button
                                type="button"
                                className="cin-btn-ghost cin-btn-ghost--sm"
                                onClick={handleClose}
                                aria-label="Close dialog"
                                style={{ padding: '0.375rem' }}
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>

                        {/* Social auth buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.5rem' }}>
                            {SOCIAL_PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    disabled={isAnyLoading}
                                    onClick={() => handleOAuth(provider.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.625rem',
                                        width: '100%',
                                        padding: '0.625rem 1rem',
                                        borderRadius: '0.625rem',
                                        border: '1px solid var(--ghost-border)',
                                        background: oauthLoading === provider.id
                                            ? 'var(--surface-container-high)'
                                            : 'var(--surface-container-low, var(--surface))',
                                        color: 'var(--on-surface)',
                                        fontFamily: 'var(--font-headline)',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        cursor: isAnyLoading ? 'not-allowed' : 'pointer',
                                        opacity: isAnyLoading && oauthLoading !== provider.id ? 0.5 : 1,
                                        transition: 'background 0.15s, opacity 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isAnyLoading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-container-high)';
                                    }}
                                    onMouseLeave={e => {
                                        if (!isAnyLoading) (e.currentTarget as HTMLButtonElement).style.background = oauthLoading === provider.id ? 'var(--surface-container-high)' : 'var(--surface-container-low, var(--surface))';
                                    }}
                                >
                                    {oauthLoading === provider.id
                                        ? <Loader2 size={16} className="spinning" aria-hidden="true" />
                                        : provider.icon
                                    }
                                    {provider.label}
                                </button>
                            ))}
                        </div>

                        {/* Divider */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '1.5rem',
                        }}>
                            <div style={{ flex: 1, height: 1, background: 'var(--ghost-border)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontFamily: 'var(--font-label)', whiteSpace: 'nowrap' }}>
                                or continue with email
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'var(--ghost-border)' }} />
                        </div>

                        {/* Success message */}
                        {successMessage && (
                            <div
                                role="status"
                                aria-live="polite"
                                style={{
                                    padding: '0.75rem 1rem',
                                    marginBottom: '1rem',
                                    borderRadius: '0.5rem',
                                    background: 'rgba(52,168,83,0.1)',
                                    border: '1px solid rgba(52,168,83,0.3)',
                                    color: 'var(--on-surface)',
                                    fontFamily: 'var(--font-label)',
                                    fontSize: '0.875rem',
                                }}
                            >
                                {successMessage}
                            </div>
                        )}

                        {/* Error */}
                        {authError && (
                            <div
                                className="cin-error-card"
                                role="alert"
                                aria-live="polite"
                                style={{ marginBottom: '1rem' }}
                            >
                                <AlertCircle size={16} aria-hidden="true" />
                                <p className="cin-error-message" style={{ margin: 0 }}>{authError}</p>
                            </div>
                        )}

                        {/* Email/password form */}
                        <form onSubmit={handleSubmit} noValidate>
                            <div style={{ marginBottom: '1rem' }}>
                                <label
                                    htmlFor={emailId}
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.375rem',
                                        fontSize: '0.8125rem',
                                        fontWeight: 500,
                                        fontFamily: 'var(--font-label)',
                                        color: 'var(--on-surface-variant)',
                                    }}
                                >
                                    Email
                                </label>
                                <input
                                    id={emailId}
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    autoComplete="email"
                                    required
                                    disabled={isAnyLoading}
                                    placeholder="you@example.com"
                                    style={{
                                        width: '100%',
                                        padding: '0.625rem 0.875rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid var(--ghost-border)',
                                        background: 'var(--surface-container-high)',
                                        color: 'var(--on-surface)',
                                        fontFamily: 'var(--font-label)',
                                        fontSize: '0.9375rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        opacity: isAnyLoading ? 0.6 : 1,
                                        transition: 'border-color 0.15s',
                                    }}
                                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--ghost-border)'; }}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label
                                    htmlFor={passwordId}
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.375rem',
                                        fontSize: '0.8125rem',
                                        fontWeight: 500,
                                        fontFamily: 'var(--font-label)',
                                        color: 'var(--on-surface-variant)',
                                    }}
                                >
                                    Password
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        id={passwordId}
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete={view === 'sign_in' ? 'current-password' : 'new-password'}
                                        required
                                        disabled={isAnyLoading}
                                        placeholder="••••••••"
                                        style={{
                                            width: '100%',
                                            padding: '0.625rem 2.75rem 0.625rem 0.875rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid var(--ghost-border)',
                                            background: 'var(--surface-container-high)',
                                            color: 'var(--on-surface)',
                                            fontFamily: 'var(--font-label)',
                                            fontSize: '0.9375rem',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                            opacity: isAnyLoading ? 0.6 : 1,
                                            transition: 'border-color 0.15s',
                                        }}
                                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--ghost-border)'; }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        style={{
                                            position: 'absolute',
                                            right: '0.75rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            color: 'var(--on-surface-variant)',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }}
                                    >
                                        {showPassword
                                            ? <EyeOff size={15} aria-hidden="true" />
                                            : <Eye size={15} aria-hidden="true" />
                                        }
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isAnyLoading || !email || !password}
                                className="cin-btn-primary"
                                style={{
                                    width: '100%',
                                    justifyContent: 'center',
                                    opacity: (isAnyLoading || !email || !password) ? 0.55 : 1,
                                    cursor: (isAnyLoading || !email || !password) ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {loading && <Loader2 size={16} className="spinning" aria-hidden="true" />}
                                {view === 'sign_in' ? 'Sign In' : 'Create Account'}
                            </button>
                        </form>

                        {/* Switch view */}
                        <p style={{
                            marginTop: '1.25rem',
                            marginBottom: 0,
                            textAlign: 'center',
                            fontSize: '0.8125rem',
                            fontFamily: 'var(--font-label)',
                            color: 'var(--on-surface-variant)',
                        }}>
                            {view === 'sign_in' ? (
                                <>
                                    No account?{' '}
                                    <button
                                        type="button"
                                        className="cin-btn-ghost"
                                        onClick={() => handleSwitchView('sign_up')}
                                        style={{ padding: 0, fontWeight: 600, color: 'var(--primary)' }}
                                    >
                                        Sign up
                                    </button>
                                </>
                            ) : (
                                <>
                                    Already have an account?{' '}
                                    <button
                                        type="button"
                                        className="cin-btn-ghost"
                                        onClick={() => handleSwitchView('sign_in')}
                                        style={{ padding: 0, fontWeight: 600, color: 'var(--primary)' }}
                                    >
                                        Sign in
                                    </button>
                                </>
                            )}
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AuthModal;
