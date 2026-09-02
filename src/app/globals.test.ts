import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = resolve(process.cwd(), "src/app/globals.css");

describe("CU Launch global styles", () => {
  it("keeps light-surface focus rings contrasting and hero branding safe at 320px", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain(":focus-visible {\n  outline: 3px solid var(--launch-sky);");
    expect(css).toContain(".site-header__brand:focus-visible,");
    expect(css).toContain("outline-color: var(--launch-gold);");
    expect(css).toContain(".hero :focus-visible {\n  outline-color: var(--launch-gold);");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain(".hero h1 .cu-launch-brand {\n    align-items: flex-start;\n    flex-direction: column;");
  });
});
