import React from "react";

interface CuLaunchBrandProps {
  compact?: boolean;
  showTagline?: boolean;
}

export function CuLaunchBrand({
  compact = false,
  showTagline = false,
}: CuLaunchBrandProps): JSX.Element {
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
          className="cu-launch-brand__triangle"
          d="M32 3 61 57H3L32 3Z"
        />
        <path
          className="cu-launch-brand__orbit"
          d="M10 41c11-14 30-19 45-9"
          fill="none"
        />
        <path
          className="cu-launch-brand__star"
          d="m32 17 2.8 8.5h9l-7.3 5.2 2.8 8.5-7.3-5.2-7.3 5.2 2.8-8.5-7.3-5.2h9L32 17Z"
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
