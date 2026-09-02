import React from "react";

interface CuLaunchBrandProps {
  compact?: boolean;
  showTagline?: boolean;
}

export function CuLaunchBrand({
  compact = false,
  showTagline = false,
}: CuLaunchBrandProps): React.JSX.Element {
  return (
    <span
      className={`cu-launch-brand${compact ? " cu-launch-brand--compact" : ""}`}
    >
      <svg
        className="cu-launch-brand__mark"
        data-testid="cu-launch-mark"
        aria-hidden="true"
        viewBox="0 0 64 64"
        focusable="false"
      >
        <path
          className="cu-launch-brand__left-leg"
          d="M32 3 6 57 25 49 32 27Z"
          fill="#FFB300"
        />
        <path
          className="cu-launch-brand__right-leg"
          d="M32 3 32 27 39 49 58 57Z"
          fill="#FFB300"
        />
        <path
          className="cu-launch-brand__orbit"
          d="M3 62c16-15 42-15 58 0-18-8-40-8-58 0Z"
          fill="#0B1D3A"
        />
        <path
          className="cu-launch-brand__star"
          d="M32 13 34 27 43 29 35 32 32 43 29 32 21 29 30 27Z"
          fill="#ffffff"
        />
      </svg>
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
