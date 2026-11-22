"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { setPrefCookie, THEME_COOKIE, type ThemePref } from "@/lib/prefs";

interface ThemeContextValue {
  theme: ThemePref;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

declare global {
  interface Window {
    __dvApplyTheme?: () => void;
  }
}

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function apply(theme: ThemePref) {
  const root = document.documentElement;
  root.setAttribute("data-theme-pref", theme);
  if (window.__dvApplyTheme) window.__dvApplyTheme();
  else {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
  }
}

/**
 * Application theme only. It never changes screenshots or their stored
 * "captured theme" classification.
 */
export function ThemeProvider({ initialTheme, children }: { initialTheme: ThemePref; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(initialTheme);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => (initialTheme === "dark" ? "dark" : "light"),
  );

  // React's dev-mode remount can reset <html> attributes; re-apply before paint.
  useLayoutEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemePref) => {
    setPrefCookie(THEME_COOKIE, next);
    setThemeState(next);
    apply(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
