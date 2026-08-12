"use client";
import { useSyncExternalStore } from "react";

/**
 * Current wall-clock time in the browser, or null while prerendering.
 *
 * Reading `Date` during render is impure: prerendered output is stamped at
 * build time and would disagree with the browser on whether a ride is today
 * or has started. Time-dependent UI reads it here instead and treats null as
 * "not known yet", so the server renders the time-independent shape.
 *
 * The value refreshes on an interval so a tab left open crosses ride-day and
 * ride-start boundaries without a reload.
 */
const REFRESH_MS = 60_000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    for (const l of listeners) l();
  }, REFRESH_MS);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useClientNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}
