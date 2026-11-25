"use client";

import React, { useEffect, useState } from "react";

const formatTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function ageLabel(checkedAt: number, now: number) {
  const minutes = Math.floor(Math.max(0, now - checkedAt) / 60_000);
  if (minutes === 0) return "just now";
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const [amount, unit] = days > 0 ? [days, "day"] : hours > 0 ? [hours, "hour"] : [minutes, "minute"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function ReviewTime({ checkedAt, now }: { checkedAt: string; now: number }) {
  const date = new Date(checkedAt);
  return <time dateTime={checkedAt}>{formatTime.format(date)} ET ({ageLabel(date.getTime(), now)})</time>;
}

export function ReviewFreshness({ githubCheckedAt, scanCheckedAt, asOf }: {
  githubCheckedAt?: string | null;
  scanCheckedAt?: string;
  asOf: number;
}) {
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const reference = Math.max(asOf, now);
  return <>
    {githubCheckedAt !== undefined && (
      <p className="security-review__date">
        {githubCheckedAt ? <>Last GitHub refresh <ReviewTime checkedAt={githubCheckedAt} now={reference} /></> : "GitHub hasn’t been refreshed yet."}
      </p>
    )}
    {scanCheckedAt && (
      <p className="security-review__date">Last security scan <ReviewTime checkedAt={scanCheckedAt} now={reference} /></p>
    )}
  </>;
}
