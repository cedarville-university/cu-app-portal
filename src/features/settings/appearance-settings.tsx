"use client";

import React from "react";
import { appearanceOptions } from "@/components/appearance";
import { useAppearance } from "@/components/appearance-provider";

const labels = { light: "Light", dark: "Dark", system: "System" };

export function AppearanceSettings() {
  const { preference, setAppearance } = useAppearance();

  return (
    <section className="card settings-appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <p id="appearance-description">
        Applies immediately in this browser. System follows your device’s light or dark setting.
      </p>
      <fieldset
        className="settings-appearance__choices"
        aria-labelledby="appearance-title"
        aria-describedby="appearance-description"
      >
        {appearanceOptions.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="portal-appearance"
              checked={option === preference}
              onChange={() => setAppearance(option)}
            />
            {labels[option]}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
