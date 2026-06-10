"use client";

import { create } from "zustand";

export interface PageContext {
  pageTitle: string;
  data: Record<string, unknown>;
}

interface AiChatContextState {
  context: PageContext | null;
  setContext: (context: PageContext) => void;
  clearContext: () => void;
}

export const useAiChatContextStore = create<AiChatContextState>((set) => ({
  context: null,
  setContext: (context) => set({ context }),
  clearContext: () => set({ context: null }),
}));
