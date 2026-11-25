"use client";

import React from "react";
import { GitHubRefreshButton, useGitHubReviewRefresh } from "./github-refresh";
import { withDependencyReview, type SavedSecurityReview } from "./owner-results";
import { SecurityReviewPanel } from "./panel";
import { isFreshDependencyReview, type DependencyReview } from "./results";
import { ReviewFreshness } from "./review-freshness";
import type { UpdateControls } from "./update-review";

export function LiveSecurityReview({
  appId,
  appName,
  repository,
  savedReview,
  cachedDependency,
  asOf,
  applyAction,
  automaticPublishing,
}: {
  appId: string;
  appName: string;
  repository: string;
  savedReview: SavedSecurityReview | null;
  cachedDependency: DependencyReview | null;
  asOf: number;
  applyAction?: UpdateControls["apply"];
  automaticPublishing: boolean;
}) {
  const { result, loading, unavailable, refresh } = useGitHubReviewRefresh(
    appId, repository, !isFreshDependencyReview(cachedDependency, asOf),
  );
  const dependency = result ?? cachedDependency;

  return (
    <>
      <div className="card">
        <ReviewFreshness
          asOf={Math.max(asOf, dependency ? Date.parse(dependency.checkedAt) : 0)}
          githubCheckedAt={dependency?.checkedAt ?? null}
          scanCheckedAt={savedReview?.results.source?.checkedAt ?? savedReview?.checkedAt.toISOString()}
        />
        <GitHubRefreshButton loading={loading} unavailable={unavailable} refresh={refresh} />
      </div>
      <SecurityReviewPanel appName={appName} repository={repository} review={withDependencyReview(savedReview, dependency)} showDate={false} controls={{
        live: Boolean(dependency) && !loading && !unavailable,
        automaticPublishing,
        apply: applyAction,
      }} />
    </>
  );
}
