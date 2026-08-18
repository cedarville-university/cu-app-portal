"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OnboardingProgressRefresh({
  intervalMs = 5000,
  statusText = "This page checks progress automatically. You can leave it open.",
}: {
  intervalMs?: number;
  statusText?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return <p role="status">{statusText}</p>;
}
