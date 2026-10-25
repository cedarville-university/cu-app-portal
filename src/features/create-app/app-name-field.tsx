"use client";

import React, { useEffect, useRef, useState } from "react";
import { checkAppNameAvailability } from "@/app/create/name-availability-action";

const CONFLICT_MESSAGE = "That app name is already in use. Please try another name.";
const RETRY_MESSAGE = "Could not check this app name. Please try again by leaving the field or changing the name.";

export function AppNameField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const version = useRef(0);
  const availableName = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => () => {
    clearTimeout(timer.current);
    version.current++;
  }, []);

  async function check(name: string, requestVersion: number) {
    if (!name.trim()) return;
    const alreadyAvailable = availableName.current === name.trim();
    // Recheck an unchanged valid name in the background without moving the
    // submit button between pointerdown (blur) and click.
    setChecking(!alreadyAvailable);
    setMessage("");
    // A fresh blur check must not block a click on Launch for a name we already
    // checked. The creation service checks again before saving the app.
    if (!alreadyAvailable) {
      inputRef.current?.setCustomValidity("Checking app name...");
    }
    let error = "";
    try {
      if (!(await checkAppNameAvailability(name.trim()))) error = CONFLICT_MESSAGE;
    } catch {
      error = RETRY_MESSAGE;
    }
    if (requestVersion !== version.current) return;
    availableName.current = error ? null : name.trim();
    setChecking(false);
    setMessage(error);
    inputRef.current?.setCustomValidity(error);
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="appName">App Name</label>
      <input
        ref={inputRef}
        id="appName"
        name="appName"
        type="text"
        required
        className="form-control"
        aria-invalid={message ? true : undefined}
        aria-describedby={message || checking ? "appName-feedback" : undefined}
        onChange={(event) => {
          const name = event.currentTarget.value;
          const requestVersion = ++version.current;
          availableName.current = null;
          clearTimeout(timer.current);
          setMessage("");
          setChecking(false);
          event.currentTarget.setCustomValidity(name.trim() ? "Checking app name..." : "");
          if (name.trim()) timer.current = setTimeout(() => { void check(name, requestVersion); }, 500);
        }}
        onBlur={(event) => {
          clearTimeout(timer.current);
          void check(event.currentTarget.value, ++version.current);
        }}
      />
      {message ? <p id="appName-feedback" className="form-help" role="alert">{message}</p> : null}
      {checking ? <p id="appName-feedback" className="form-help" role="status">Checking app name...</p> : null}
    </div>
  );
}
