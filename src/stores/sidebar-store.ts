"use client";

import { create } from "zustand";

interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed:
    typeof window !== "undefined"
      ? localStorage.getItem("sidebar-collapsed") === "true"
      : false,
  isMobileOpen: false,
  toggle: () =>
    set((state) => {
      const newVal = !state.isCollapsed;
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebar-collapsed", String(newVal));
      }
      return { isCollapsed: newVal };
    }),
  setCollapsed: (collapsed) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
    }
    set({ isCollapsed: collapsed });
  },
  setMobileOpen: (open) => set({ isMobileOpen: open }),
}));
