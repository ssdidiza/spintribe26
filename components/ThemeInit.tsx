"use client";
import { useEffect } from "react";
import { useTheme } from "@/lib/theme";

/** Syncs the theme store with localStorage on mount and binds the
 *  system-preference listener. Renders nothing. The actual pre-paint theme
 *  is set by the inline bootstrap script in app/layout.tsx. */
export default function ThemeInit() {
  useEffect(() => {
    useTheme.getState().init();
  }, []);
  return null;
}
