"use client";

import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  // Always start as "dark" so client hydration matches the server-rendered
  // markup; ThemeProvider syncs the persisted theme after mount.
  theme: "dark",
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.classList.toggle("light", theme === "light");
    }
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", newTheme);
        document.documentElement.classList.toggle("dark", newTheme === "dark");
        document.documentElement.classList.toggle("light", newTheme === "light");
      }
      return { theme: newTheme };
    }),
}));
