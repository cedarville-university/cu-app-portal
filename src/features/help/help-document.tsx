import React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { HelpDocument } from "./docs";

export function HelpDocumentContent({
  document,
  embedded = false,
}: {
  document: HelpDocument;
  embedded?: boolean;
}) {
  const Title = embedded ? "h2" : "h1";

  return (
    <article className="help-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          h1: ({ id, children }) => <Title id={id} className="help-document__title">{children}</Title>,
          ...(embedded ? {
            h2: ({ id, children }) => <h3 id={id}>{children}</h3>,
            h3: ({ id, children }) => <h4 id={id}>{children}</h4>,
          } : {}),
          a: ({ href = "", children }) => {
            const external = href.startsWith("http://") || href.startsWith("https://");
            return external ? (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ) : (
              <Link href={href}>{children}</Link>
            );
          },
          table: ({ children }) => (
            <div className="help-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {document.body}
      </ReactMarkdown>
      <footer className="help-document__meta">
        Last reviewed {document.lastReviewed} by {document.owner}.
      </footer>
    </article>
  );
}

