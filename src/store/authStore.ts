/**
 * authStore.ts — Supabase Auth State
 *
 * Tracks session/user, exposes email+password and OAuth (Google, GitHub) auth,
 * and triggers library sync on sign-in / sign-out.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuthView = 'sign_in' | 'sign_up';
export type OAuthProvider = 'google' | 'github';

export interface AuthState {
    user: User | null;
    session: Session | null;
    loading: boolean;
    initialized: boolean;
    authError: string | null;

    initAuth: () => () => void;
    signIn: (email: string, password: string) => Promise<AuthError | null>;
    signUp: (email: string, password: string) => Promise<AuthError | null>;
    signInWithOAuth: (provider: OAuthProvider) => Promise<AuthError | null>;
    signOut: () => Promise<void>;
    clearAuthError: () => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
    devtools(
        (set) => ({
            user: null,
            session: null,
            loading: false,
            initialized: false,
            authError: null,

            initAuth: () => {
                // Hydrate from existing session on mount
                supabase.auth.getSession().then(({ data: { session } }) => {
                    set({ session, user: session?.user ?? null, initialized: true });

                    // Load library if already signed in
                    if (session?.user) {
                        import('./libraryStore').then(({ useLibraryStore }) => {
                            useLibraryStore.getState().loadLibrary();
                        });
                    }
                });

                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    (event, session) => {
                        set({ session, user: session?.user ?? null, initialized: true });

                        import('./libraryStore').then(({ useLibraryStore }) => {
                            const lib = useLibraryStore.getState();
                            if (event === 'SIGNED_IN') {
                                lib.loadLibrary();
                            } else if (event === 'SIGNED_OUT') {
                                lib.clearLibrary();
                            }
                        });
                    },
                );

                return () => subscription.unsubscribe();
            },

            signIn: async (email, password) => {
                set({ loading: true, authError: null });
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                set({ loading: false, authError: error?.message ?? null });
                return error;
            },

            signUp: async (email, password) => {
                set({ loading: true, authError: null });
                const { error } = await supabase.auth.signUp({ email, password });
                set({ loading: false, authError: error?.message ?? null });
                return error;
            },

            signInWithOAuth: async (provider) => {
                set({ loading: true, authError: null });
                const { error } = await supabase.auth.signInWithOAuth({
                    provider,
                    options: {
                        redirectTo: window.location.origin,
                    },
                });
                // OAuth redirects away — only clear loading on error
                if (error) set({ loading: false, authError: error.message });
                return error;
            },

            signOut: async () => {
                set({ loading: true, authError: null });
                await supabase.auth.signOut();
                set({ user: null, session: null, loading: false });
            },

            clearAuthError: () => set({ authError: null }),
        }),
        { enabled: import.meta.env.DEV, name: 'AuthStore' },
    ),
);
