# Maintaining CU Launch User Documentation

The Markdown files in this directory are the source of truth for CU Launch web help and downloadable PDFs.

## Editing

1. Edit the relevant Markdown file.
2. Update its `lastReviewed` date.
3. Preview the matching `/help/...` page with `npm run dev`.
4. Install the PDF requirements with `python3 -m pip install -r scripts/docs/requirements.txt`, then run `npm run docs:pdf`.
5. Run `npm test -- src/features/help docs/user` and `npm run build`.
6. Open the rendered PDF pages and check page breaks, tables, links, and the one-page Quick Start constraint.

Keep instructions task-focused and define technical terms on first use. Do not include real credentials, environment-variable values, private repository addresses, or other secrets.

The complete guide PDF combines `guide.md`, `troubleshooting.md`, `faq.md`, and `glossary.md`. The Quick Start PDF uses `quick-start.md` only. The public download names are `cu-launch-quick-start.pdf` and `cu-launch-user-guide.pdf`.
