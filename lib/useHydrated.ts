"use client";
import { useEffect, useState } from "react";
import { useStore } from "./store";

/** Returns true once the Zustand persist store has rehydrated from localStorage */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // useStore.persist.hasHydrated() is available after the first tick
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
