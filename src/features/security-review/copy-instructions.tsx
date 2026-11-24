"use client";

import React, { useRef, useState } from "react";

export function CopyFixInstructions({ instructions, confirmed, label = confirmed ? "fix instructions" : "review instructions", secondary }: { instructions: string; confirmed: boolean; label?: string; secondary?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const disclosure = useRef<HTMLDetailsElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setStatus("copied");
    } catch {
      if (disclosure.current) disclosure.current.open = true;
      field.current?.focus();
      field.current?.select();
      setStatus("manual");
    }
  }
  return <>
    <button type="button" className={secondary ? "btn btn--secondary" : "btn btn--primary-solid"} onClick={copy}>Copy {label}</button>
    <p className="security-review__feedback" role="status">
      {status === "copied" ? "Copied. Paste the instructions into your app’s chat in Codex." :
        status === "manual" ? "The instructions are selected below. Copy them using your device’s Copy command." : ""}
    </p>
    <details ref={disclosure} className="security-review__prompt">
      <summary>Read the {label}</summary>
      <textarea ref={field} aria-label={secondary ? "Update instructions for Codex" : "Instructions for Codex"} rows={8} readOnly value={instructions} />
    </details>
  </>;
}
