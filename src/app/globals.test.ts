import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = resolve(process.cwd(), "src/app/globals.css");

describe("CU Launch global styles", () => {
  it("uses contrasting focus rings for light surfaces, the dark header, and its white account menu", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain(":focus-visible {\n  outline: 3px solid var(--launch-navy);");
    expect(css).toContain(
      ".site-header__nav > .site-header__nav-links > a:focus-visible,",
    );
    expect(css).toContain(".site-header__user-name:focus-visible");
    expect(css).toContain("outline-color: var(--launch-gold);");
    expect(css).toContain(".site-header__account-menu-content a:focus-visible,");
    expect(css).toContain("outline-color: var(--launch-navy);");
    expect(css).toContain(".hero :focus-visible {\n  outline-color: var(--launch-gold);");
  });

  it("keeps the account flyout outside the horizontally scrolling mobile link strip", async () => {
    const css = await readFile(globalStyles, "utf8");
    const mobileRules = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobileRules).toContain(".site-header__nav-links {");
    expect(mobileRules).toContain("overflow-x: auto;");
    expect(mobileRules).toContain(".site-header__nav-links > a {");
    expect(mobileRules).toContain("flex: 0 0 auto;");
    expect(mobileRules).toContain("white-space: nowrap;");
    expect(mobileRules).not.toMatch(/\.site-header__nav\s*{[^}]*overflow-x:\s*auto/s);
  });

  it("keeps account-menu links navy on the white flyout at every viewport", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toMatch(
      /\.site-header__account-menu-content a \{\n  color: var\(--launch-navy\);/,
    );
  });

  it("reverses the star and orbit colors for the navy header mark", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain(
      ".site-header .cu-launch-brand__star { fill: var(--launch-navy); }",
    );
    expect(css).toContain(
      ".site-header .cu-launch-brand__orbit { fill: var(--launch-white); }",
    );
  });

  it("keeps hero branding safe at 320px", async () => {
    const css = await readFile(globalStyles, "utf8");

    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain(".hero h1 .cu-launch-brand {\n    align-items: flex-start;\n    flex-direction: column;");
  });
});
