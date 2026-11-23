export const appearanceOptions = ["light", "dark", "system"] as const;
export type Appearance = typeof appearanceOptions[number];

export const appearanceStorageKey = "cu-launch-appearance";
export const darkAppearanceQuery = "(prefers-color-scheme: dark)";

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

// Runs before the page paints, using only a validated browser preference.
export const initializeAppearance = `(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem(${JSON.stringify(appearanceStorageKey)});
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  const root = document.documentElement;
  root.dataset.appearance = preference;
  root.dataset.theme = preference === "system"
    ? (matchMedia(${JSON.stringify(darkAppearanceQuery)}).matches ? "dark" : "light")
    : preference;
})();`;
