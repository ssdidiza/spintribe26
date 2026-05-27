"use client";
import { useEffect, useState } from "react";
import { useStore } from "./store";

/** Returns true once the Zustand persist store has rehydrated from localStorage */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}
