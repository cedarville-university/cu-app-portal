"use client";

import React, { useState } from "react";

export function AudienceField({ audience: policy = { cedarville: true, public: true } }: { audience?: { cedarville: boolean; public: boolean } }) {
  const [audience, setAudience] = useState<"cedarville" | "public" | null>(
    null,
  );

  return (
    <fieldset className="form-group">
      <legend className="form-label">Who can use this app?</legend>
      {policy.cedarville ? <label className="choice-row">
        <input
          type="radio"
          name="entraLogin"
          value="true"
          required
          checked={audience === "cedarville"}
          onChange={() => setAudience("cedarville")}
        />
        <span>Cedarville sign-in required</span>
      </label> : null}
      <p className="form-help">
        Only people who can sign in with their Cedarville account can use the
        app.
      </p>
      {policy.public ? <label className="choice-row">
        <input
          type="radio"
          name="entraLogin"
          value="false"
          required
          checked={audience === "public"}
          onChange={() => setAudience("public")}
        />
        <span>Openly public on the internet</span>
      </label> : null}
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
