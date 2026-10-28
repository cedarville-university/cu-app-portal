import React from "react";
import releaseNotes from "./generated.json";

type ReleaseNoteDay = { date: string; notes: string[] };
const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
});

export function WhatsChanged({ entries = releaseNotes }: { entries?: ReleaseNoteDay[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="whats-changed" aria-labelledby="whats-changed-title">
      <h2 id="whats-changed-title">What’s changed</h2>
      <p className="whats-changed__intro">The latest improvements and fixes in CU Launch.</p>
      <div className="whats-changed__list" role="region" aria-label="Recent CU Launch changes" tabIndex={0}>
        {entries.map(({ date, notes }) => (
          <div className="whats-changed__day" key={date}>
            <h3><time dateTime={date}>{dateFormat.format(new Date(`${date}T12:00:00Z`))}</time></h3>
            <ul>
              {notes.map(note => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
