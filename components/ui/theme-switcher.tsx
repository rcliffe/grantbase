"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyTheme, isTheme, THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";
import { cn } from "./cn";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked (e.g. some private modes)
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep other tabs in step.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(readTheme());
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted, but still applied for this page.
  }
  applyTheme(theme);
  for (const listener of listeners) listener();
}

/** System / Light / Dark switch. */
export function ThemeSwitcher({ className }: { className?: string }) {
  // Server snapshot is "system": the real value is only known in the browser.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);

  // React's dev-mode remount resets <html> attributes set by the inline script;
  // re-apply before paint. A no-op in production.
  useLayoutEffect(() => applyTheme(readTheme()), []);

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex rounded-md border border-line-strong bg-surface p-0.5", className)}>
      {THEMES.map((option) => {
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${LABELS[option]} theme`}
            onClick={() => setTheme(option)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
              selected ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <ThemeIcon theme={option} />
            <span className="sr-only sm:not-sr-only">{LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { className: "size-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
