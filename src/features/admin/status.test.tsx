import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import {
  createdDate,
  formatDateTime,
  formatStatus,
  StatusBadge,
  statusVariant,
  userLabel,
} from "./status";

describe("formatStatus", () => {
  it("lowercases and replaces underscores", () => {
    expect(formatStatus("NOT_STARTED")).toBe("not started");
  });

  it("labels missing statuses as not checked", () => {
    expect(formatStatus(null)).toBe("Not checked");
  });
});

describe("statusVariant", () => {
  it.each([
    ["READY", "success"],
    ["FAILED", "error"],
    ["PENDING", "warning"],
    ["DELETED", "default"],
    ["SOMETHING_ELSE", "info"],
  ])("maps %s to %s", (status, variant) => {
    expect(statusVariant(status)).toBe(variant);
  });
});

describe("StatusBadge", () => {
  it("renders the label and formatted status", () => {
    render(<StatusBadge label="Published" status="SUCCEEDED" />);

    const badge = screen.getByText("Published: succeeded");

    expect(badge.className).toContain("badge--success");
  });
});

describe("labels and dates", () => {
  it("formats a user label", () => {
    expect(
      userLabel({ displayName: "Test User", email: "t@cedarville.edu" }),
    ).toBe("Test User (t@cedarville.edu)");
  });

  it("formats a created date", () => {
    expect(createdDate(new Date("2026-07-06T12:00:00"))).toBe("Jul 6, 2026");
  });

  it("formats a date with time", () => {
    expect(formatDateTime(new Date("2026-07-06T13:05:00"))).toContain(
      "Jul 6, 2026",
    );
    expect(formatDateTime(new Date("2026-07-06T13:05:00"))).toContain("1:05");
  });
});
