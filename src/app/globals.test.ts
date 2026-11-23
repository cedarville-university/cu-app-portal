import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = resolve(process.cwd(), "src/app/globals.css");

describe("CU Launch global styles", () => {
  it("uses theme focus rings on content and gold focus rings on the navy header", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain(":focus-visible {\n  outline: 3px solid var(--focus-ring);");
    expect(css).toContain(
      ".site-header__nav > .site-header__nav-links > a:focus-visible,",
    );
    expect(css).toContain(".site-header__user-name:focus-visible");
    expect(css).toContain("outline-color: var(--launch-gold);");
    expect(css).toContain(".site-header__account-menu-content a:focus-visible,");
    expect(css).toContain("outline-color: var(--focus-ring);");
    expect(css).toContain(".hero :focus-visible {\n  outline-color: var(--launch-gold);");
  });

  it("wraps primary links and preserves mobile touch targets", async () => {
    const css = await readFile(globalStyles, "utf8");
    const mobileRules = css.slice(css.indexOf("@media (max-width: 880px)"));

    expect(mobileRules).toMatch(/\.site-header__nav-links \{[^}]*flex-wrap: wrap/);
    expect(mobileRules).toMatch(/\.site-header__nav-links > a \{[^}]*min-height: 2\.75rem/);
  });

  it("uses the current theme's text and surface colors in the account menu", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toMatch(
      /\.site-header__account-menu-content a \{\n  color: var\(--text-heading\);/,
    );
    expect(css).toMatch(/\.site-header__account-menu-content \{[^}]*background: var\(--bg-white\)/);
  });

  it("keeps hero branding safe at 320px", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain("@media (max-width: 360px)");
    expect(css).toContain(".hero h1 .cu-launch-brand {\n    align-items: flex-start;\n    flex-direction: column;");
  });
});
