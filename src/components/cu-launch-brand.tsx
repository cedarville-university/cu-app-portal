import React from "react";

interface CuLaunchBrandProps {
  compact?: boolean;
  showTagline?: boolean;
  surface?: "light" | "dark";
}

export function CuLaunchBrand({
  compact = false,
  showTagline = false,
  surface = "light",
}: CuLaunchBrandProps): React.JSX.Element {
  return (
    <span
      className={`cu-launch-brand${compact ? " cu-launch-brand--compact" : ""}`}
    >
      <img
        className="cu-launch-brand__mark"
        data-testid="cu-launch-mark"
        aria-hidden="true"
        alt=""
        src={`/brand/cu-launch-mark-${surface}.png`}
      />
      <span className="cu-launch-brand__copy">
        <span className="cu-launch-brand__name" aria-label="CU Launch">
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            CU Launch
          </span>
          <span className="cu-launch-brand__cu">CU</span>{" "}
          <span className="cu-launch-brand__launch">Launch</span>
        </span>
        {showTagline ? (
          <span className="cu-launch-brand__tagline">
            Launch your app. We handle the rest.
          </span>
        ) : null}
      </span>
    </span>
  );
}
