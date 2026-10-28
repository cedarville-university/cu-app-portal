import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

/** @param {{ timestamp: string, message: string }[]} commits
 * @param {{ date: string, notes: string[] }[]} baseline */
export function collectReleaseNotes(commits, baseline) {
  const days = new Map();
  function add(date, notes) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !Array.isArray(notes) || notes.length === 0) {
      throw new Error("Invalid release-note date or notes");
    }
    const existing = days.get(date) ?? new Set();
    for (const note of notes) {
      if (typeof note !== "string" || !note.trim() || /[\r\n]/.test(note)) throw new Error("Release notes must be nonempty single lines");
      existing.add(note.trim());
    }
    days.set(date, existing);
  }
  for (const { timestamp, message } of commits) {
    const instant = new Date(timestamp);
    if (!Number.isFinite(instant.getTime()) || typeof message !== "string") throw new Error("Invalid release-note commit");
    const notes = [...message.matchAll(/^Release-note:[\t ]*([^\r\n]*)\r?$/gm)].map(match => match[1].trim()).filter(Boolean);
    if (notes.length) add(easternDate.format(instant), notes);
  }
  for (const { date, notes } of baseline) add(date, notes);
  return [...days].sort(([a], [b]) => b.localeCompare(a)).slice(0, 20).map(([date, notes]) => ({ date, notes: [...notes] }));
}

/** @param {string} cwd */
export function readReleaseNoteCommits(cwd) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
    throw new Error("Release-note generation requires full Git history; the checkout is shallow");
  }
  const fields = git("log", "--first-parent", "-z", "--format=%cI%x00%B", "HEAD").split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2) throw new Error("Invalid Git release-note records");
  const commits = [];
  for (let i = 0; i < fields.length; i += 2) commits.push({ timestamp: fields[i], message: fields[i + 1] });
  return commits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(resolve(root, "src/features/release-notes/baseline.json"), "utf8"));
  const notes = collectReleaseNotes(readReleaseNoteCommits(root), baseline);
  writeFileSync(resolve(root, "src/features/release-notes/generated.json"), JSON.stringify(notes, null, 2) + "\n");
  console.log(`Generated release notes for ${notes.length} dates.`);
}
