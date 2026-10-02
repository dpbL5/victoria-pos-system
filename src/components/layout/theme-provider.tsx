"use client";

import { useCallback, useEffect, useState } from "react";
import { ThemeContext, type Theme } from "@/hooks/use-theme";

const STORAGE_KEY = "qltrungcung_theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  }

function applyTheme(theme: Theme): void {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
  } catch {
    /* localStorage blocked */
  }
  return "system";
}

function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage blocked */
  }
  try {
    document.cookie = `${STORAGE_KEY}=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  } catch {
    /* cookie blocked */
}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Apply the class whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    persistTheme(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
