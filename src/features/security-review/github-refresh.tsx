"use client";

import React, { useEffect, useState } from "react";
import type { DependencyReview } from "./results";

export function useGitHubReviewRefresh(appId: string, repository: string | null, autoRefresh: boolean) {
  const [result, setResult] = useState<DependencyReview | null>(null);
  const [method, setMethod] = useState<"GET" | "POST" | null>(() => autoRefresh ? "GET" : null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!method || !repository) return;
    const controller = new AbortController();
    async function loadReview(method: "GET" | "POST") {
      try {
        const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/security-review`, {
          method,
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("GitHub review unavailable");
        const current: { repository: string; dependency: DependencyReview } = await response.json();
        if (current.repository !== repository) throw new Error("App repository changed");
        if (!controller.signal.aborted) setResult(current.dependency);
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setMethod(null);
      }
    }
    void loadReview(method);
    return () => controller.abort();
  }, [appId, repository, method]);

  function refresh() {
    setUnavailable(false);
    setMethod("POST");
  }

  return { result, loading: Boolean(method), unavailable, refresh };
}

export function GitHubRefreshButton({ loading, unavailable, refresh }: {
  loading: boolean;
  unavailable: boolean;
  refresh: () => void;
}) {
  return <>
    {loading && <p role="status">Checking GitHub for current dependency alerts and updates…</p>}
    {unavailable && <p role="status">Live update information from GitHub is unavailable. Any displayed results are from the last saved review.</p>}
    <button type="button" className="btn btn--ghost" disabled={loading} onClick={refresh}>
      Refresh from GitHub
    </button>
  </>;
}
