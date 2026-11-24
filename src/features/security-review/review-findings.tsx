"use client";

import React, { useId, useRef, useState } from "react";
import { checkNames, type ReviewResults } from "./results";

type Dependency = NonNullable<ReviewResults["dependency"]>;
type Source = NonNullable<ReviewResults["source"]>;
type Alert = Dependency["alerts"][number];
type Section = "dependencies" | "source" | "checks";

const severities = ["critical", "high", "medium", "low"];
const sections: Section[] = ["dependencies", "source", "checks"];
const sectionNames = { dependencies: "Dependencies", source: "Source warnings", checks: "Other checks" };
const countText = (count: number, singular: string, plural = singular + "s") => `${count} ${count === 1 ? singular : plural}`;
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const isCommit = (value: string | null): value is string => !!value && /^[a-f0-9]{40}$/i.test(value);

function ScanTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York",
  }).format(new Date(value))} ET</time>;
}

function DependencyFindings({ dependency, repository }: { dependency: Dependency | null; repository: string }) {
  const alerts = dependency?.alerts ?? [];
  const levels = [...new Set([...severities, ...alerts.map(a => a.severity)])];
  const [severity, setSeverity] = useState(levels.find(level => alerts.some(a => a.severity === level)) ?? "all");
  if (!dependency) return <p>No dependency alert results are available for this review.</p>;

  const buckets = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = JSON.stringify([alert.severity, alert.package, alert.advisory]);
    const group = buckets.get(key);
    if (group) group.push(alert);
    else buckets.set(key, [alert]);
  }
  const groups = [...buckets.values()].sort(([a], [b]) =>
    levels.indexOf(a.severity) - levels.indexOf(b.severity) || a.package.localeCompare(b.package)
    || (a.summary ?? a.advisory).localeCompare(b.summary ?? b.advisory));
  const critical = groups.filter(([first]) => first.severity === "critical");
  const criticalPackages = new Set(critical.map(([first]) => first.package));
  const priority = criticalPackages.size === 1 ? `critical ${critical[0][0].package}` : "critical";
  const visible = groups.filter(([first]) => severity === "all" || first.severity === severity);
  const total = visible.reduce((n, group) => n + group.length, 0);

  return <>
    <h4>Dependency alerts</h4>
    <p>Dependabot found {countText(alerts.length, "open alert")} on the repository’s default branch. A package can appear in more than one dependency file.</p>
    {critical.length > 0 && <div className="review-priority"><strong>Review {countText(critical.length, `${priority} advisory`, `${priority} advisories`)} first</strong>
      <p>Check which package versions the deployed build actually installed.</p></div>}
    {alerts.length > 0 && <>
      <div className="review-filters" role="group" aria-label="Filter by severity">
        {["all", ...levels].map(level => <button key={level} type="button" aria-pressed={severity === level} onClick={() => setSeverity(level)}>
          {titleCase(level)} <span>{level === "all" ? alerts.length : alerts.filter(a => a.severity === level).length}</span>
        </button>)}
      </div>
      <p className="review-meta" aria-live="polite">{countText(total, "alert")} across {countText(visible.length, "package advisory", "package advisories")}</p>
      {visible.map(group => {
        const first = group[0];
        const title = group.find(alert => alert.summary)?.summary ?? first.advisory;
        return <details className="review-row" key={first.number}>
          <summary><span className="review-row__body"><span className="review-row__meta">
            <span className="review-severity" data-level={first.severity}>{titleCase(first.severity)}</span> <code>{first.package}</code></span>
            <strong>{title}</strong></span><span className="review-row__count">{countText(group.length, "alert")}</span></summary>
          <div className="review-row__expanded"><ul>{[...group].sort((a,b) => a.manifest.localeCompare(b.manifest) || a.number - b.number).map(a =>
            <li key={a.number}><code>{a.manifest}</code> · <a href={`${repository}/security/dependabot/${a.number}`}>GitHub alert #{a.number}</a>
              {a.patchedVersion && <> · First patched version <strong>{a.patchedVersion}</strong></>}</li>)}</ul>
            <a href={`https://github.com/advisories/${encodeURIComponent(first.advisory)}`}>Read advisory {first.advisory}</a>
          </div>
        </details>;
      })}
    </>}
    <p className="review-meta">Alerts checked <ScanTime value={dependency.checkedAt} />.</p>
  </>;
}

const sourceDescriptions: Record<string, [string, string]> = {
  "react-dangerouslysetinnerhtml": ["HTML is inserted directly into a React page", "Check where the HTML comes from and how it is cleaned before the page displays it."],
  "html-in-template-string": ["HTML is assembled in a template string", "Review the values inserted into the HTML and check how the app handles content supplied by users."],
};

function SourceFindings({ source, repository, revision, title = "Source warnings" }: { title?: string; source: Source | null; repository: string; revision: string | null }) {
  if (!source) return <p>No source scan results are available for this review.</p>;
  return <>
    <h4>{title}</h4>
    {source.mainRevision && <p>Nightly scan of <a href={`${repository}/commit/${source.mainRevision}`}>main at <code>{source.mainRevision.slice(0,12)}</code></a>.</p>}
    <p>Semgrep scanned {countText(source.scannedFiles, "file")}{source.ruleFiles !== undefined && <> using {countText(source.ruleFiles, "rule file")}</>}.
      {source.skippedFiles !== undefined && <> Files skipped in this scope: {source.skippedFiles}.</>}
      {!source.complete && <> The scan was incomplete.</>}</p>
    <p className="review-meta">{source.findings.length ? "These warnings identify code that needs a closer look." : "The scanner found no warnings in the files it checked."}</p>
    {source.findings.map((f, i) => {
      const description = sourceDescriptions[f.rule.split(".").pop() ?? f.rule];
      return <details className="review-row" key={i}><summary><span className="review-row__body">
        <span className="review-severity" data-level="medium">Needs review</span><strong>{description?.[0] ?? f.rule}</strong>
        <span className="review-meta">{f.file} · line {f.line}</span></span></summary>
        <div className="review-row__expanded"><p>{description?.[1] ?? "Inspect the flagged line and its surrounding code to determine whether a fix is needed."}</p>
          <p>Semgrep rule <code>{f.rule}</code> · {f.severity}</p>
          {isCommit(revision) && <a href={`${repository}/blob/${revision}/${f.file.split("/").map(encodeURIComponent).join("/")}#L${f.line}`}>View scanned source</a>}
        </div>
      </details>;
    })}
    <details className="review-row"><summary><strong>Scan details</strong></summary><div className="review-row__expanded">
      <p>Semgrep Community Edition{source.version && ` ${source.version}`} · <ScanTime value={source.checkedAt} /></p>
      {source.scanErrors !== undefined && <p>Scanner errors: {source.scanErrors}.</p>}
      {source.rulesRevision && isCommit(source.rulesRevision) && <a href={`https://github.com/semgrep/semgrep-rules/tree/${source.rulesRevision}`}>View pinned rules</a>}
    </div></details>
  </>;
}

const missingEvidence: Record<string, string> = {
  dependency: "The report could not verify the package versions installed in the deployed app.",
  secret: "The report has no verified scan for exposed credentials in this release.",
  access: "The report lacks current results for protected pages and APIs.",
  data: "The report lacks complete evidence for data classification, access, encryption and retention.",
  login: "The report could not verify the app’s sign-in setup.",
  "entra-sign-in": "A live Microsoft Entra sign-in still needs verification for this release.",
  "chrome-login": "A sign-in using Chrome still needs verification for this release.",
};

function OtherChecks({ results }: { results: ReviewResults }) {
  const completed = results.checks.filter(c => c.outcome !== "coverage-gap");
  const gaps = results.checks.filter(c => c.outcome === "coverage-gap");
  return <>
    {completed.map(c => <section className="review-check" key={JSON.stringify([c.rule,c.component])}>
      <h4>{c.rule === "login" ? "Sign-in review" : checkNames[c.rule] ?? c.rule}</h4>
      <div className={c.outcome === "finding" ? "review-priority" : undefined}>
        <strong>{c.outcome === "pass" ? "Passed" : c.failedControls?.includes("branded-login") ? "Custom sign-in page missing" : "Needs attention"}</strong>
        {c.failedControls?.includes("branded-login") && <p>The deployed app did not pass the check for a custom sign-in page.</p>}
        <p className="review-meta"><code>{c.component}</code>{c.checkedAt && <> · <ScanTime value={c.checkedAt} /></>}</p>
      </div>
    </section>)}
    {(gaps.length > 0 || results.healthObservationMissing) && <section className="review-check"><h4>Checks awaiting evidence</h4>
      <p>{countText(gaps.length, "pilot check")}{results.healthObservationMissing && " and the app health export"} still {gaps.length === 1 && !results.healthObservationMissing ? "needs" : "need"} evidence.</p>
      <ul className="review-gap-list">{gaps.map(c => <li key={JSON.stringify([c.rule,c.component])}>
        <strong>{checkNames[c.rule] ?? c.rule}</strong>{c.component !== "application" && <> · <code>{c.component}</code></>}
        <p>{c.gapReason === "missing-deployed-revision" ? "The scan could not confirm which version was deployed." : missingEvidence[c.rule] ?? "A current result is unavailable for this check."}</p>
      </li>)}{results.healthObservationMissing && <li><strong>App health export</strong><p>The report has no current health observation. <a href="?section=health">Open App health</a></p></li>}</ul>
    </section>}
    {!results.checks.length && !results.healthObservationMissing && <p>No other app checks were recorded in this review.</p>}
  </>;
}

export function ReviewFindings({ results, repository }: { results: ReviewResults; repository: string }) {
  const initial = results.dependency ? "dependencies" : results.source ? "source" : "checks";
  const [tab, setTab] = useState<Section>(initial);
  const id = useId();
  const buttons = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const destinations: Record<string, number> = { ArrowRight: (index + 1) % sections.length, ArrowLeft: (index + sections.length - 1) % sections.length,
      Home: 0, End: sections.length - 1 };
    const next = destinations[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(sections[next]);
    buttons.current[sections[next]]?.focus();
  }
  const counts = { dependencies: results.dependency?.alerts.length, source: results.source ? results.source.findings.length + (results.deployedSource?.findings.length ?? 0) : undefined, checks: undefined };
  return <details className="card security-review__findings"><summary>Review the findings</summary>
    <div className="security-review__detail">
      {results.revision && <p className="review-meta">Reviewed deployment {isCommit(results.revision)
        ? <a href={`${repository}/commit/${results.revision}`}><code>{results.revision.slice(0,12)}</code></a> : <code>{results.revision}</code>}</p>}
      <div className="review-tabs" role="tablist" aria-label="Review results">{sections.map((section, i) =>
        <button type="button" role="tab" key={section} id={`${id}-${section}-tab`} aria-controls={`${id}-${section}`}
          aria-selected={tab === section} tabIndex={tab === section ? 0 : -1}
          ref={node => { buttons.current[section] = node; }} onClick={() => setTab(section)} onKeyDown={e => navigate(e,i)}>
          {sectionNames[section]} {counts[section] !== undefined && <span>{counts[section]}</span>}
        </button>)}</div>
      {sections.map(section => <div key={section} id={`${id}-${section}`} role="tabpanel" aria-labelledby={`${id}-${section}-tab`}
        tabIndex={0} hidden={tab !== section} className="review-panel">
        {section === "dependencies" && <DependencyFindings dependency={results.dependency} repository={repository} />}
        {section === "source" && <SourceFindings source={results.source} repository={repository} revision={results.source?.mainRevision ?? results.revision} />}
        {section === "source" && results.deployedSource &&
          <SourceFindings title="Warnings from the last reviewed deployment" source={results.deployedSource} repository={repository} revision={results.revision} />}
        {section === "checks" && <OtherChecks results={results} />}
      </div>)}
    </div>
  </details>;
}
