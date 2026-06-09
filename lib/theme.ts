"use client";
import { create } from "zustand";

export type ThemeChoice = "light" | "dark" | "system";

/** localStorage key. Kept as a PLAIN string (not zustand-persist JSON) so the
 *  no-flash bootstrap script in app/layout.tsx can read it synchronously. */
export const THEME_STORAGE_KEY = "spintribe-theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve a choice to whether the dark theme should be active right now. */
export function resolveDark(choice: ThemeChoice): boolean {
  return choice === "dark" || (choice === "system" && systemPrefersDark());
}

/** Apply a choice to the document (toggles the `.dark` class + color-scheme). */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const dark = resolveDark(choice);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage may be unavailable (private mode, SSR) */
  }
  return "system";
}

let systemListenerBound = false;

interface ThemeState {
  /** The user's selection. "system" follows the OS preference. */
  choice: ThemeChoice;
  /** Becomes true after the first client-side sync (avoids hydration mismatch). */
  ready: boolean;
  setChoice: (choice: ThemeChoice) => void;
  /** Sync store state from localStorage + bind the system-preference listener. */
  init: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  // Server + first client render must agree → always start at "system".
  choice: "system",
  ready: false,

  setChoice: (choice) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, choice);
      } catch {
        /* ignore */
      }
    }
    applyTheme(choice);
    set({ choice });
  },

  init: () => {
    const choice = readStoredChoice();
    applyTheme(choice);
    set({ choice, ready: true });

    if (!systemListenerBound && typeof window !== "undefined" && window.matchMedia) {
      systemListenerBound = true;
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", () => {
        // Re-apply only while the user is following the system preference.
        if (get().choice === "system") applyTheme("system");
      });
    }
  },
}));
