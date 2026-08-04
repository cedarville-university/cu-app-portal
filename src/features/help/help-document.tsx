import React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { HelpDocument } from "./docs";

export function HelpDocumentContent({ document }: { document: HelpDocument }) {
  return (
    <article className="help-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
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

