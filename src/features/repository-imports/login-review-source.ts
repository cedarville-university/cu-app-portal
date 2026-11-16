export const LOGIN_SOURCE_PATHS = [
  "auth.ts", "auth.js", "auth.config.ts", "src/auth.ts", "src/auth.js", "src/auth.config.ts", "src/auth/config.ts",
  "app/login/page.tsx", "app/login/actions.ts", "src/app/login/page.tsx", "src/app/login/actions.ts",
  "pages/auth/signin.tsx", "pages/login.tsx", "pages/api/auth/[...nextauth].ts",
  "src/lib/login-redirect.ts", "middleware.ts", "src/middleware.ts",
  "server.js", "server.mjs", "server/app.mjs", "server/entra-auth.mjs", "src/server.ts",
  "main.py", "app.py",
];

export type LoginSourceFinding = { code: "DEFAULT_AUTHJS_SIGNIN" | "LOGIN_REVIEW_REQUIRED"; message: string };

export function inspectImportedLoginSource(files: Record<string, string>, framework: string | null) {
  const sourcePaths = Object.keys(files).filter(path => /\.(?:[cm]?[jt]sx?|py)$/.test(path) && files[path]?.trim());
  const sources = sourcePaths.map(path => files[path]).join("\n");
  const findings: LoginSourceFinding[] = [];
  // This is an advisory check for the familiar inline Auth.js configuration.
  // Indirect/dynamic configurations remain unknown and need explicit review.
  if (framework === "nextjs" && /NextAuth\s*\(\s*\{/.test(sources) &&
      !/\bsignIn\s*:\s*["']\/(?!\/|api\/auth(?:\/|["']))[^"']*["']/.test(sources)) {
    findings.push({ code: "DEFAULT_AUTHJS_SIGNIN", message: "The inspected Auth.js configuration appears to use its default sign-in screen. Add or verify a custom public sign-in page before recording the review." });
  }
  findings.push({ code: "LOGIN_REVIEW_REQUIRED", message: "Inspect the login page and server-side sign-in, protected routes, safe return destinations, OAuth validation, and relevant tests. Source patterns alone do not verify behavior or clear a browser warning." });
  return { findings, sourcePaths };
}
