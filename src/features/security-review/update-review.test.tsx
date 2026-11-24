import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SecurityReviewPanel } from "./panel";
import type { SecurityUpdate } from "./update-types";
import type { UpdateControls } from "./update-review";

const checkedAt = "2026-11-24T14:00:00Z";
const update: SecurityUpdate = { number: 12, head: "a".repeat(40), base: "b".repeat(40), branch: "main", alerts: [1,2], ready: true, checks: "passed", checkNames: ["Tests · success"] };
const alert = (number: number) => ({ number, package: "pkg-" + number, severity: "high", manifest: "package.json", advisory: "GHSA-" + number });
function show(controls: UpdateControls, overrides?: Partial<SecurityUpdate>) {
  render(<SecurityReviewPanel appName="Demo" repository="https://github.com/example/demo" controls={controls}
    review={{ checkedAt: new Date(checkedAt), results: { revision: null, source: null, checks: [], dependency: {
      checkedAt, alerts: [alert(1), alert(2), alert(3)], updates: [{ ...update, ...overrides }],
    } } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Review update" }));
  return within(screen.getByRole("article", { name: "Security update 12" }));
}
afterEach(cleanup);
it("reviews one group, applies its pinned revision on explicit click and separates the remaining instructions", async () => {
  const apply = vi.fn().mockResolvedValue({ applied: true, message: "Update applied." });
  const card = show({ apply, automaticPublishing: true, live: true });
  expect(apply).not.toHaveBeenCalled();
  expect(card.getByText(/2 security issues covered/)).toBeVisible();
  expect(card.getByText(/automatically publish/)).toBeVisible();
  const prompt = new URL(card.getByRole("link", { name: "Open in Codex" }).getAttribute("href")!).searchParams.get("prompt");
  expect(prompt).toContain("https://github.com/example/demo/pull/12");
  expect(prompt).toContain(update.head);
  expect(prompt).not.toContain("GHSA-3");
  fireEvent.click(screen.getByText("Read the fix instructions"));
  const remaining = screen.getByRole("textbox", { name: "Instructions for Codex" });
  expect((remaining as HTMLTextAreaElement).value).toContain("GHSA-3");
  expect((remaining as HTMLTextAreaElement).value).not.toContain("GHSA-1");
  fireEvent.click(card.getByRole("button", { name: "Apply update" }));
  expect(await card.findByText("Update applied.")).toBeVisible();
  expect(apply).toHaveBeenCalledWith(12, update.head, update.base);
});
it.each(["failed","pending","unavailable"] as const)("offers Codex help on %s checks", (checks) => {
  const card = show({ live: true, apply: vi.fn() }, { ready: false, checks });
  expect(card.queryByRole("button", { name: "Apply update" })).toBeNull();
  expect(card.getByRole("link", { name: "Open in Codex" })).toBeVisible();
});
it("keeps saved checks viewable without offering a live apply", () => {
  const card = show({ live: false, apply: vi.fn() });
  expect(card.getByText(/last known results/)).toBeVisible();
  expect(card.queryByRole("button", { name: "Apply update" })).toBeNull();
});
