"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const setTheme = useThemeStore((s) => s.setTheme);

  // Sync the store with the persisted theme after mount. The store always
  // starts as "dark" so hydration matches the server; the inline script in
  // layout.tsx already applied the correct <html> class before first paint,
  // and setTheme keeps the class in sync from here on.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setTheme(stored === "light" ? "light" : "dark");
  }, [setTheme]);

  return <>{children}</>;
}
