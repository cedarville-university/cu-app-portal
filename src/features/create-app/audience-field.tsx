"use client";

import React, { useState } from "react";

export function AudienceField() {
  const [audience, setAudience] = useState<"cedarville" | "public" | null>(
    null,
  );

  return (
    <fieldset className="form-group">
      <legend className="form-label">Who can use this app?</legend>
      <label className="choice-row">
        <input
          type="radio"
          name="entraLogin"
          value="true"
          required
          checked={audience === "cedarville"}
          onChange={() => setAudience("cedarville")}
        />
        <span>Cedarville sign-in required</span>
      </label>
      <p className="form-help">
        Only people who can sign in with their Cedarville account can use the
        app.
      </p>
      <label className="choice-row">
        <input
          type="radio"
          name="entraLogin"
          value="false"
          required
          checked={audience === "public"}
          onChange={() => setAudience("public")}
        />
        <span>Openly public on the internet</span>
      </label>
      {audience === "public" ? (
        <label className="choice-row">
          <input type="checkbox" name="publicAcknowledgement" required />
          <span>
            I understand that anyone who knows or discovers this app&rsquo;s
            address can access it.
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
