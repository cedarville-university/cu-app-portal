"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type Appearance,
  appearanceStorageKey,
  darkAppearanceQuery,
  isAppearance,
} from "./appearance";

const AppearanceContext = createContext<{
  preference: Appearance;
  setAppearance: (next: Appearance) => void;
} | null>(null);

function applyAppearance(preference: Appearance) {
  const root = document.documentElement;
  root.dataset.appearance = preference;
  root.dataset.theme = preference === "system"
    ? (window.matchMedia?.(darkAppearanceQuery).matches ? "dark" : "light")
    : preference;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Appearance>("system");

  useEffect(() => {
    const current = document.documentElement.dataset.appearance;
    if (isAppearance(current)) setPreference(current);

    const system = window.matchMedia?.(darkAppearanceQuery);
    function updateFromDevice() {
      if (document.documentElement.dataset.appearance === "system") {
        applyAppearance("system");
      }
    }
    function updateFromStorage(event: StorageEvent) {
      if (event.key !== appearanceStorageKey && event.key !== null) return;
      const next = isAppearance(event.newValue) ? event.newValue : "system";
      applyAppearance(next);
      setPreference(next);
    }

    system?.addEventListener("change", updateFromDevice);
    window.addEventListener("storage", updateFromStorage);
    return () => {
      system?.removeEventListener("change", updateFromDevice);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  function setAppearance(next: Appearance) {
    applyAppearance(next);
    setPreference(next);
    try {
      localStorage.setItem(appearanceStorageKey, next);
    } catch {
      // The selection still applies in this tab when saved storage is blocked.
    }
  }

  return (
    <AppearanceContext.Provider value={{ preference, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error("Appearance settings require the portal layout.");
  return appearance;
}
