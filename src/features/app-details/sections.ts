export const appDetailsSections = {
  overview: { title: "Overview" },
  security: { title: "Security review" },
  deployment: { title: "Deployment", description: "Publish to Azure and review the latest deployment." },
  health: { title: "App health", description: "Check whether the app responds at its published address." },
  listing: { title: "Cedarville listing", description: "Manage whether the app appears in the Cedarville Apps directory." },
  collaborators: { title: "Collaborators", description: "See who can manage this app in CU Launch." },
  repository: { title: "Code repository", description: "Find your private repository and set up access for Codex." },
  environment: { title: "Environment variables", description: "Manage configuration for this app." },
  support: { title: "Support and deletion", description: "Find your support reference and review options for removing app resources." },
} satisfies Record<string, { title: string; description?: string }>;

export type AppDetailsSection = keyof typeof appDetailsSections;

export const appDetailsGroups: Array<{ title: string; open: boolean; sections: AppDetailsSection[] }> = [
  { title: "Publishing", open: true, sections: ["deployment", "health"] },
  { title: "Sharing and access", open: true, sections: ["listing", "collaborators"] },
  { title: "Advanced", open: false, sections: ["repository", "environment", "support"] },
];

export function getAppDetailsSection(
  requested: string | string[] | undefined,
  publishFailed: boolean,
): AppDetailsSection {
  if (typeof requested === "string" && Object.hasOwn(appDetailsSections, requested)) {
    return requested as AppDetailsSection;
  }
  return publishFailed ? "deployment" : "overview";
}

export function appDetailsSectionHref(section: AppDetailsSection) {
  return `?section=${section}`;
}
