import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const helpDocumentSlugs = [
  "quick-start",
  "guide",
  "troubleshooting",
  "faq",
  "glossary",
] as const;

export type HelpDocumentSlug = (typeof helpDocumentSlugs)[number];

export type HelpDocument = {
  slug: HelpDocumentSlug;
  title: string;
  description: string;
  lastReviewed: string;
  owner: string;
  body: string;
};

function parseFrontmatter(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Help document is missing frontmatter.");
  }

  const metadata = Object.fromEntries(
    match[1]
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) {
          throw new Error(`Invalid help frontmatter line: ${line}`);
        }
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );

  return { metadata, body: match[2].trim() };
}

export function isHelpDocumentSlug(value: string): value is HelpDocumentSlug {
  return helpDocumentSlugs.includes(value as HelpDocumentSlug);
}

export async function getHelpDocument(slug: HelpDocumentSlug): Promise<HelpDocument> {
  const path = join(process.cwd(), "docs", "user", `${slug}.md`);
  const source = await readFile(path, "utf8");
  const { metadata, body } = parseFrontmatter(source);
  const required = ["title", "description", "lastReviewed", "owner"] as const;

  for (const key of required) {
    if (!metadata[key]) {
      throw new Error(`Help document ${slug} is missing ${key}.`);
    }
  }

  return {
    slug,
    title: metadata.title,
    description: metadata.description,
    lastReviewed: metadata.lastReviewed,
    owner: metadata.owner,
    body,
  };
}

export async function getHelpDocuments() {
  return Promise.all(helpDocumentSlugs.map(getHelpDocument));
}

