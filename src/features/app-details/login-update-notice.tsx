"use client";

import React, { useEffect, useState } from "react";

export function LoginUpdateNotice({
  appRequestId,
  userId,
  prompt,
}: {
  appRequestId: string;
  userId: string;
  prompt: string;
}) {
  const storageKey = `cu-launch:login-update-v1:${userId}:${appRequestId}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    try {
      setDismissedKey(
        localStorage.getItem(storageKey) === "dismissed" ? storageKey : null,
      );
    } catch {
      // Keep the notice usable when browser storage is blocked.
    }
  }, [storageKey]);

  function dismiss() {
    setDismissedKey(storageKey);
    try {
      localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Dismiss for the current page when storage is unavailable.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  if (dismissedKey === storageKey) return null;

  return (
    <section
      className="warning-box"
      aria-label="Sign-in update"
      style={{ marginBottom: "1.25rem" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.125rem", margin: 0 }}>
          A smoother sign-in for your app
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label="Dismiss sign-in notice"
          onClick={dismiss}
        >
          Dismiss
        </button>
      </div>
      <p>
        Chrome may show a “Dangerous site” warning when people sign in to some
        older apps. Updating your app’s sign-in page may help. Copy the instructions
        below and paste them into Codex in your app’s project. If you’ve already
        made this update, you can dismiss this message.
      </p>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => void copy()}
      >
        Copy update prompt
      </button>
      <span role="status" style={{ marginLeft: "0.75rem" }}>
        {copyStatus === "copied"
          ? "Copied! Paste it into Codex in your app’s project."
          : copyStatus === "failed"
            ? "Select and copy the prompt below."
            : ""}
      </span>
      <details open={copyStatus === "failed" ? true : undefined} style={{ marginTop: "0.75rem" }}>
        <summary>View update prompt</summary>
        <textarea
          aria-label="Codex sign-in update prompt"
          readOnly
          value={prompt}
          rows={10}
          style={{ width: "100%", boxSizing: "border-box", marginTop: "0.75rem" }}
        />
      </details>
    </section>
  );
}
