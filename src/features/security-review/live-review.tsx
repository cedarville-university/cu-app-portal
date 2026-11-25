"use client";

import React, { useEffect, useState } from "react";
import { SecurityReviewPanel } from "./panel";
import type { ReviewResults } from "./results";
import type { UpdateControls } from "./update-review";

type DependencyReview = NonNullable<ReviewResults["dependency"]>;
type LiveReviewState =
  | { status: "loading" | "unavailable" }
  | { status: "ready"; dependency: DependencyReview };

export function LiveSecurityReview({
  appId,
  appName,
  repository,
  savedReview,
  applyAction,
  automaticPublishing,
}: {
  appId: string;
  appName: string;
  repository: string;
  savedReview: { checkedAt: Date; results: ReviewResults } | null;
  applyAction?: UpdateControls["apply"];
  automaticPublishing: boolean;
}) {
  const [liveReview, setLiveReview] = useState<LiveReviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadReview() {
      try {
        const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/security-review`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Live review unavailable");
        const result: { repository: string; dependency: DependencyReview } = await response.json();
        if (result.repository !== repository) throw new Error("App repository changed");
        if (!controller.signal.aborted) setLiveReview({ status: "ready", dependency: result.dependency });
      } catch {
        if (!controller.signal.aborted) setLiveReview({ status: "unavailable" });
      }
    }
    void loadReview();
    return () => controller.abort();
  }, [appId, repository, attempt]);

  const review = liveReview.status === "ready" ? {
    checkedAt: new Date(Math.max(savedReview?.checkedAt.getTime() ?? 0, Date.parse(liveReview.dependency.checkedAt))),
    results: {
      ...(savedReview?.results ?? { revision: null, source: null, checks: [] }),
      dependency: liveReview.dependency,
    },
  } : savedReview;

  return (
    <>
      {liveReview.status === "loading" && <p role="status">Checking GitHub for current dependency alerts and updates…</p>}
      {liveReview.status === "unavailable" && (
        <div className="card">
          <p role="status">Live update information from GitHub is unavailable. Any results below are from the last saved review.</p>
          <button type="button" className="btn btn--ghost" onClick={() => {
            setLiveReview({ status: "loading" });
            setAttempt(attempt => attempt + 1);
          }}>
            Retry GitHub check
          </button>
        </div>
      )}
      <SecurityReviewPanel appName={appName} repository={repository} review={review} controls={{
        live: liveReview.status === "ready",
        automaticPublishing,
        apply: applyAction,
      }} />
    </>
  );
}
