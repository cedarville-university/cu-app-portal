"use client";

import React from "react";
import Link from "next/link";
import { appDetailsSectionHref } from "@/features/app-details/sections";
import { GitHubRefreshButton, useGitHubReviewRefresh } from "./github-refresh";
import { ReviewFreshness } from "./review-freshness";

export function OverviewSecurityNotice({ appId, repository, githubCheckedAt, scanCheckedAt, asOf }: {
  appId: string;
  repository: string | null;
  githubCheckedAt: string | null;
  scanCheckedAt?: string;
  asOf: number;
}) {
  const { result, loading, unavailable, refresh } = useGitHubReviewRefresh(appId, repository, false);
  const lastRefresh = result?.checkedAt ?? githubCheckedAt;
  const hasResults = Boolean(lastRefresh || scanCheckedAt);
  return (
    <section className="card security-review__notice" aria-labelledby="security-notice">
      <h3 id="security-notice">{hasResults ? "You have security details to review" : "Security review is available"}</h3>
      <ReviewFreshness
        asOf={Math.max(asOf, lastRefresh ? Date.parse(lastRefresh) : 0)}
        githubCheckedAt={repository ? lastRefresh : undefined}
        scanCheckedAt={scanCheckedAt}
      />
      <div className="security-review__actions">
        <Link className="btn btn--ghost" href={appDetailsSectionHref("security")}>Review security details</Link>
        {repository && <GitHubRefreshButton loading={loading} unavailable={unavailable} refresh={refresh} />}
      </div>
    </section>
  );
}
