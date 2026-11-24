import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecurityReviewPanel } from "./panel";
import type { ReviewResults } from "./results";

const checkedAt = "2026-11-24T11:00:00Z";
const repository = "https://github.com/example/demo";
function show(results: Partial<ReviewResults>) {
  render(<SecurityReviewPanel appName="Demo" repository={repository} review={{
    checkedAt: new Date(checkedAt),
    results: { revision: "abc123", dependency: null, source: null, checks: [], ...results },
  }} />);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("owner security review", () => {
  it("copies project-specific instructions and keeps technical findings collapsed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show({ dependency: { checkedAt, alerts: [{ package: "sample", number: 4, advisory: "GHSA-sample", manifest: "app/package.json", severity: "high" }] } });
    expect(screen.getByRole("heading", { name: "We found security issues in your app" })).toBeVisible();
    expect(screen.getByText("Review the findings").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Copy fix instructions" }));
    expect(await screen.findByText(/Copied\. Paste/)).toBeVisible();
    const prompt = writeText.mock.calls[0][0];
    for (const detail of [repository, "Demo", "abc123", "GHSA-sample", "app/package.json", "Stop for my review"]) expect(prompt).toContain(detail);
  });

  it("distinguishes a source warning and allows manual copying", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } });
    show({ source: { checkedAt, complete: false, scannedFiles: 3, findings: [{ file: "app.ts", line: 7, rule: "sample-rule", severity: "WARNING" }] } });
    expect(screen.getByRole("heading", { name: "A security check needs a closer look" })).toBeVisible();
    expect(screen.getByText("Some files could not be checked.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy review instructions" }));
    expect(await screen.findByText(/instructions are selected/)).toBeVisible();
    const field = screen.getByRole("textbox", { name: "Instructions for Codex" }) as HTMLTextAreaElement;
    expect(field).toHaveFocus();
    expect(field.value).toContain("sample-rule · app.ts line 7");
    expect(field.selectionEnd - field.selectionStart).toBe(field.value.length);
  });
  it("groups dependency alerts by advisory, filters severity, and shows the affected files and recorded patch", () => {
    const alert = { number: 1, package: "demo-lib", severity: "critical", advisory: "GHSA-example",
      summary: "Security update for example library", manifest: "package.json", patchedVersion: "2.0.1" };
    show({ dependency: { checkedAt, alerts: [alert, { ...alert, number: 2, manifest: "package-lock.json" },
      { ...alert, number: 3, severity: "low", advisory: "GHSA-older", summary: undefined }] } });
    fireEvent.click(screen.getByText("Review the findings"));
    expect(screen.getByRole("tab", { name: "Dependencies 3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("2 alerts across 1 package advisory")).toBeVisible();
    fireEvent.click(screen.getByText(alert.summary));
    expect(screen.getByRole("link", { name: "GitHub alert #2" })).toHaveAttribute("href", repository + "/security/dependabot/2");
    expect(screen.getAllByText("2.0.1")[0]).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(screen.getByText("3 alerts across 2 package advisories")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "High 0" }));
    expect(screen.getByText("0 alerts across 0 package advisories")).toBeVisible();
  });

  it("opens source details and other checks by keyboard with links to the scanned version", () => {
    const revision = "b".repeat(40);
    show({ revision, source: { checkedAt, complete: true, scannedFiles: 3, ruleFiles: 8, skippedFiles: 0, scanErrors: 0,
      version: "1.2.0", rulesRevision: "c".repeat(40), findings: [
        { rule: "html-in-template-string", file: "src/file name.ts", line: 7, severity: "WARNING" },
      ] }, healthObservationMissing: true, checks: [{ rule: "login", outcome: "finding", component: "login",
        checkedAt, failedControls: ["branded-login"] }, { rule: "secret", outcome: "coverage-gap", component: "application", checkedAt: null }] });
    fireEvent.click(screen.getByText("Review the findings"));
    const source = screen.getByRole("tab", { name: "Source warnings 1" });
    expect(source).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByText("HTML is assembled in a template string"));
    expect(screen.getByRole("link", { name: "View scanned source" })).toHaveAttribute("href", repository + "/blob/" + revision + "/src/file%20name.ts#L7");
    fireEvent.click(screen.getByText("Scan details"));
    expect(screen.getByRole("link", { name: "View pinned rules" })).toBeVisible();
    fireEvent.keyDown(source, { key: "ArrowRight" });
    const checks = screen.getByRole("tab", { name: "Other checks" });
    expect(checks).toHaveFocus();
    expect(within(screen.getByRole("tabpanel")).getByText("Custom sign-in page missing")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open App health" })).toBeVisible();
    fireEvent.keyDown(checks, { key: "Home" });
    expect(screen.getByText("No dependency alert results are available for this review.")).toBeVisible();
  });

});
