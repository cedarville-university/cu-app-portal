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
          className="cu-launch-brand__triangle"
          d="M32 3 60 57H47L32 25 17 57H4L32 3Zm0 25 7 16H25l7-16Z"
          fill="#FFB300"
          fillRule="evenodd"
        />
        <path
          className="cu-launch-brand__orbit"
          d="M7 57c13-10 37-10 50 0"
          fill="none"
          stroke="#0B1D3A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          className="cu-launch-brand__star"
          d="M32 13 34.6 25.4 43 21.6 37.4 31 47 34 36 36.5 39 47 32 39.5 25 47 28 36.5 17 34 26.6 31 21 21.6 29.4 25.4 32 13Z"
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
