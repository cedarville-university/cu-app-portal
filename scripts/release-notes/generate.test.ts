// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectReleaseNotes, readReleaseNoteCommits } from "./generate.mjs";

const dirs: string[] = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), "release-notes-")); dirs.push(dir); return dir; }
function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" } }).trim();
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

describe("release notes", () => {
  it("extracts only explicit, nonempty single-line notes and deduplicates within dates", () => {
    expect(collectReleaseNotes([
      { timestamp: "2026-10-28T15:00:00Z", message: "Technical subject\n\nRelease-note: Publish more easily.\nRelease-note: \nRelease-note: Keep your work safe.\n  implementation detail" },
      { timestamp: "2026-10-28T16:00:00Z", message: "Release-note: Publish more easily." },
      { timestamp: "2026-10-28T17:00:00Z", message: "fix: internal maintenance" },
    ], [{ date: "2026-10-28", notes: ["Publish more easily."] }])).toEqual([
      { date: "2026-10-28", notes: ["Publish more easily.", "Keep your work safe."] },
    ]);
  });
  it("uses Eastern dates across midnight and daylight saving transitions", () => {
    expect(collectReleaseNotes([
      { timestamp: "2026-10-28T01:00:00Z", message: "Release-note: October update" },
      { timestamp: "2026-11-01T04:30:00Z", message: "Release-note: Before clock change" },
      { timestamp: "2026-11-01T06:30:00Z", message: "Release-note: After clock change" },
    ], []).map((day: { date: string }) => day.date)).toEqual(["2026-11-01", "2026-10-27"]);
  });
  it("retains the latest 20 distinct dates, merging rather than replacing the baseline", () => {
    const baseline = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, notes: ["An improvement"] }));
    const result = collectReleaseNotes([{ timestamp: "2026-10-26T16:00:00Z", message: "Release-note: New improvement" }], baseline);
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual({ date: "2026-10-26", notes: ["New improvement"] });
    expect(result.at(-1).date).toBe("2026-10-07");
    expect(collectReleaseNotes([], [{ date: "2026-10-01", notes: ["Baseline"] }])).toEqual([{ date: "2026-10-01", notes: ["Baseline"] }]);
    expect(collectReleaseNotes([], [])).toEqual([]);
  });
  it("rejects malformed dates or data instead of publishing misleading history", () => {
    expect(() => collectReleaseNotes([{ timestamp: "invalid", message: "Release-note: Update" }], [])).toThrow();
    expect(() => collectReleaseNotes([], [{ date: "2026-02-30", notes: ["Wrong date"] }])).toThrow();
    expect(() => collectReleaseNotes([], [{ date: "2026-10-01", notes: [] }])).toThrow();
  });
  it("reads full first-parent history and excludes the merged branch notes", () => {
    const dir = temp(); git(dir, "init", "-b", "main");
    git(dir, "commit", "--allow-empty", "-m", "Release-note: Main improvement");
    git(dir, "switch", "-c", "feature");
    git(dir, "commit", "--allow-empty", "-m", "Release-note: Branch-only wording");
    git(dir, "switch", "main");
    git(dir, "merge", "--no-ff", "feature", "-m", "Merge feature\n\nRelease-note: Merged improvement");
    const notes = collectReleaseNotes(readReleaseNoteCommits(dir), []);
    expect(notes.flatMap((day: { notes: string[] }) => day.notes)).toEqual(["Merged improvement", "Main improvement"]);
  });
  it("fails for absent Git metadata and shallow history", () => {
    const absent = temp(); expect(() => readReleaseNoteCommits(absent)).toThrow();
    git(absent, "init", "-b", "main"); git(absent, "commit", "--allow-empty", "-m", "Initial");
    writeFileSync(join(absent, ".git", "shallow"), git(absent, "rev-parse", "HEAD") + "\n");
    expect(() => readReleaseNoteCommits(absent)).toThrow(/shallow/i);
  });
});
