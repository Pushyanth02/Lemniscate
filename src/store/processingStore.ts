/**
 * processingStore.ts — Processing State Slice
 */

import type { StateCreator } from 'zustand';
import type { ProcessingProgress } from '../types/cinematifier';
import type { CinematifierState } from './cinematifierStore';

export interface ProcessingState {
    isProcessing: boolean;
    processingProgress: ProcessingProgress | null;
    error: string | null;

    setProcessing: (isProcessing: boolean) => void;
    setProgress: (progress: ProcessingProgress) => void;
    setError: (error: string | null) => void;
}

export const createProcessingSlice: StateCreator<
    CinematifierState,
    [],
    [],
    ProcessingState
> = (set) => ({
    isProcessing: false,
    processingProgress: null,
    error: null,

    setProcessing: (isProcessing: boolean) => set({ isProcessing }),
    setProgress: (progress: ProcessingProgress) => set({ processingProgress: progress }),
    setError: (error: string | null) => set({ error, isProcessing: false }),
});
