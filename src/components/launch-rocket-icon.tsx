import React from "react";
import Image from "next/image";

export function LaunchRocketIcon({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Image
      src="/brand/cu-launch-rocket-icon.png"
      alt=""
      aria-hidden="true"
      width={1254}
      height={1254}
      className={`launch-rocket-icon${tone === "dark" ? " launch-rocket-icon--dark" : ""}`}
    />
  );
}
