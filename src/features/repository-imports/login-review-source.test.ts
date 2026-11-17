import { describe, expect, it } from "vitest";
import { inspectImportedLoginSource } from "./login-review-source";

describe("imported login source findings", () => {
  it("flags the default Auth.js flow without returning source content", () => {
    const result = inspectImportedLoginSource({
      "src/auth.ts": 'export const { auth } = NextAuth({ providers: [MicrosoftEntraID] }); // secret-marker',
    }, "nextjs");
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "DEFAULT_AUTHJS_SIGNIN" }));
    expect(JSON.stringify(result)).not.toContain("secret-marker");
  });
  it("does not treat an empty login page as a reviewed implementation", () => {
    const result = inspectImportedLoginSource({ "src/app/login/page.tsx": "export default function Login() { return <div>Login</div>; }" }, "nextjs");
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "LOGIN_REVIEW_REQUIRED" }));
    expect(result).not.toHaveProperty("reviewed", true);
  });
  it("reports custom source as evidence that still requires code and test review", () => {
    const result = inspectImportedLoginSource({
      "src/auth.ts": 'NextAuth({ pages: { signIn: "/login" }, providers: [MicrosoftEntraID] })',
      "src/app/login/page.tsx": 'export default function Login() { return <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }} />; }',
    }, "nextjs");
    expect(result.findings.map((f) => f.code)).not.toContain("DEFAULT_AUTHJS_SIGNIN");
    expect(result.findings.map((f) => f.code)).toContain("LOGIN_REVIEW_REQUIRED");
    expect(result.sourcePaths).toContain("src/auth.ts");
  });
  it("keeps unknown Express implementations actionable", () => {
    const result = inspectImportedLoginSource({ "server.mjs": "app.get('/login', showLogin);" }, "express");
    expect(result.findings.map((f) => f.code)).toContain("LOGIN_REVIEW_REQUIRED");
  });
});
