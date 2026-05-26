/**
 * moodStore.ts — Zustand store for real-time reader mood
 */

import { create } from 'zustand';
import type { MoodCategory } from '../lib/engine/cinematifier/moodLexicon';

export interface MoodState {
    currentMood: MoodCategory;
    moodScores: Record<Exclude<MoodCategory, 'neutral'>, number>;
    moodHistory: MoodCategory[];
    sceneTransition: 'entering' | 'steady' | 'shifting';
    setMood: (mood: MoodCategory, scores: Record<Exclude<MoodCategory, 'neutral'>, number>) => void;
    pushMoodHistory: (mood: MoodCategory) => void;
    setSceneTransition: (transition: 'entering' | 'steady' | 'shifting') => void;
}

export const useMoodStore = create<MoodState>((set) => ({
    currentMood: 'neutral',
    moodScores: {
        action: 0,
        suspense: 0,
        romantic: 0,
        dark: 0,
        peaceful: 0,
    },
    moodHistory: [],
    sceneTransition: 'steady',
    setMood: (mood, scores) => set({ currentMood: mood, moodScores: scores }),
    pushMoodHistory: (mood) =>
        set((state) => {
            const history = [...state.moodHistory, mood].slice(-5);
            return { moodHistory: history };
        }),
    setSceneTransition: (transition) => set({ sceneTransition: transition }),
}));
