"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  appDetailsGroups,
  appDetailsSectionHref,
  appDetailsSections,
  type AppDetailsSection,
} from "./sections";

export function AppDetailsSectionLayout({
  section,
  publishFailed,
  children,
}: {
  section: AppDetailsSection;
  publishFailed: boolean;
  children: ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousSection = useRef(section);
  const selected = appDetailsSections[section];

  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    setPickerOpen(false);
    const heading = headingRef.current;
    heading?.focus({ preventScroll: true });
    if (heading && heading.getBoundingClientRect().top < 80) {
      heading.scrollIntoView({ block: "start" });
    }
  }, [section]);

  function sectionLink(id: AppDetailsSection) {
    return (
      <Link
        key={id}
        href={appDetailsSectionHref(id)}
        scroll={false}
        prefetch={false}
        aria-current={id === section ? "page" : undefined}
        onNavigate={() => {
          setPickerOpen(false);
          if (id === section) headingRef.current?.focus();
        }}
      >
        {appDetailsSections[id].title}
        {id === "deployment" && publishFailed ? (
          <span className="app-sections__attention" role="img" aria-label="Publish failed" />
        ) : null}
      </Link>
    );
  }

  return (
    <div className="app-sections">
      <div
        className="app-sections__sidebar"
        onKeyDown={(event) => {
          if (event.key === "Escape" && pickerOpen) {
            setPickerOpen(false);
            pickerRef.current?.focus();
          }
        }}
      >
        <button
          type="button"
          ref={pickerRef}
          className="app-sections__picker"
          aria-controls="app-details-sections"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <span>Sections <strong>{selected.title}</strong></span>
          <span className="app-sections__chevron" aria-hidden="true" />
        </button>
        <nav className="app-sections__nav" id="app-details-sections" aria-label="App details sections">
          <p className="app-sections__label">App sections</p>
          {sectionLink("overview")}
          {appDetailsGroups.map((group) => (
            <details key={group.title} open={group.open || group.sections.includes(section)}>
              <summary>{group.title}</summary>
              <div className="app-sections__branch">{group.sections.map(sectionLink)}</div>
            </details>
          ))}
        </nav>
      </div>
      <div className="app-sections__content">
        <div className="app-sections__section-header">
          <h2 id="app-section-title" tabIndex={-1} ref={headingRef}>{selected.title}</h2>
          {"description" in selected ? <p>{selected.description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
