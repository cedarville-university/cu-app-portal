// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encode, getToken } from "next-auth/jwt";
import { buildSourceSnapshot } from "./build-source-snapshot";

const input = {
  templateSlug: "web-app", appName: "Groups", description: "Groups",
  hostingTarget: "Azure App Service" as const, databaseProvider: "none" as const, entraLogin: true,
};
const groupA = "11111111-1111-1111-1111-111111111111";
const groupB = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const graphUrl = "https://graph.microsoft.com/v1.0/me/transitiveMemberOf";

function execute(source: string, modules: Record<string, unknown>) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", output)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  }, module, module.exports);
  return module.exports;
}

async function starter() {
  const files = await buildSourceSnapshot(input);
  let config: any;
  const auth = execute(files["src/auth.ts"]!, {
    "next-auth": { default: (value: unknown) => { config = value; return {}; }, __esModule: true },
    "next-auth/providers/microsoft-entra-id": { default: (value: unknown) => value, __esModule: true },
  });
  return { files, config, auth };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("generated Next.js server group checks", () => {
  it("retains Graph credentials only in the encrypted JWT, never in the public session", async () => {
    const { config } = await starter();
    expect(config.providers[0].authorization.params.scope.split(" ")).toContain("User.Read");
    const jwt = await config.callbacks.jwt({ token: { sub: "user" }, account: {
      provider: "microsoft-entra-id", access_token: "private-token", expires_at: 2000000000,
    } });
    expect(jwt.graphAccessToken).toBe("private-token");
    expect(jwt.graphExpiresAt).toBe(2000000000);
    const session = await config.callbacks.session({ session: { user: { name: "User", email: "user@example.test" }, expires: "later" }, token: jwt });
    expect(session).toEqual({ user: { name: "User", email: "user@example.test", image: undefined }, expires: "later" });
    expect(JSON.stringify(session)).not.toContain("private-token");
    expect(await config.callbacks.jwt({ token: jwt, trigger: "update", session: { graphAccessToken: "injected" } })).toEqual(jwt);
  });

  async function helper(token: Record<string, unknown> | null = { graphAccessToken: "private-token", graphExpiresAt: 2000000000 }) {
    vi.stubEnv("AUTH_SECRET", "test-secret-that-is-long-enough-for-encryption");
    vi.stubEnv("AUTH_URL", "https://groups.example.test");
    const { files, auth } = await starter();
    const name = auth.sessionCookie.name;
    const value = token ? await encode({ token, secret: process.env.AUTH_SECRET!, salt: name }) : "";
    // Use the real Auth.js decoder, including chunked cookies.
    const cookie = value ? `${name}.0=${value.slice(0, 100)}; ${name}.1=${value.slice(100)}` : "";
    return execute(files["src/lib/user-groups.ts"]!, {
      "server-only": {}, "next/headers": { headers: async () => new Headers({ cookie }) },
      "next-auth/jwt": { getToken }, "@/auth": auth,
    });
  }

  it("loads every page, filters directory roles, deduplicates groups and checks IDs case-insensitively", async () => {
    const groups = await helper();
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      expect(options.headers).toMatchObject({ Authorization: "Bearer private-token" });
      expect(options.cache).toBe("no-store");
      expect(options.redirect).toBe("error");
      return Response.json(url.includes("skiptoken") ? {
        value: [{ id: groupB, "@odata.type": "#microsoft.graph.group" }],
      } : {
        value: [{ id: groupA, "@odata.type": "#microsoft.graph.group" }, { id: "role", "@odata.type": "#microsoft.graph.directoryRole" }, { id: groupA, "@odata.type": "#microsoft.graph.group" }],
        "@odata.nextLink": `${graphUrl}?$skiptoken=page2`,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await groups.getUserGroupIds()).toEqual([groupA, groupB]);
    expect(await groups.isUserInGroup(groupB.toUpperCase())).toBe(true);
    expect(await groups.isUserInGroup("22222222-2222-2222-2222-222222222222")).toBe(false);
  });

  it.each([null, {}, { graphAccessToken: "expired", graphExpiresAt: 1 }])("requires sign-in for missing or expired credentials: %s", async (token) => {
    const groups = await helper(token);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(groups.getUserGroupIds()).rejects.toThrow(/sign in again/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])("fails closed for Graph HTTP %s without leaking response details", async (status) => {
    const groups = await helper();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive Graph body", { status })));
    await expect(groups.isUserInGroup(groupA)).rejects.toThrow(status === 401 ? /sign in again/i : /unavailable/i);
  });

  it.each([
    { value: [], "@odata.nextLink": "https://evil.test/steal" },
    { value: [], "@odata.nextLink": `${graphUrl}?loop=1` },
    { value: null }, { value: [{ "@odata.type": "#microsoft.graph.group" }] },
  ])("rejects malformed or unsafe/infinite pagination responses", async (body) => {
    const groups = await helper();
    const fetchMock = vi.fn(async () => Response.json(body)); vi.stubGlobal("fetch", fetchMock);
    await expect(groups.getUserGroupIds()).rejects.toThrow(/unavailable/i);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("omits group helpers when login is disabled", async () => {
    for (const templateSlug of ["web-app", "python-fastapi"]) {
      const files = await buildSourceSnapshot({ ...input, templateSlug, entraLogin: false });
      expect(files["src/lib/user-groups.ts"]).toBeUndefined();
      expect(files["graph_groups.py"]).toBeUndefined();
    }
  });
});

describe("generated FastAPI server group checks", () => {
  it.skipIf(!process.env.STARTER_PYTHON)("executes generated auth and membership helpers against controlled Graph responses", async () => {
    const files = await buildSourceSnapshot({ ...input, templateSlug: "python-fastapi" });
    const directory = await mkdtemp(path.join(tmpdir(), "cu-launch-groups-"));
    try {
      for (const name of ["main.py", "graph_groups.py"]) await writeFile(path.join(directory, name), files[name]!);
      const tests = await readFile("src/features/generation/fixtures/starter_groups_test.py", "utf8");
      await writeFile(path.join(directory, "starter_groups_test.py"), tests);
      execFileSync(process.env.STARTER_PYTHON!, ["-m", "unittest", "-v", "starter_groups_test"], {
        cwd: directory, env: { ...process.env, AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters", AUTH_URL: "https://groups.example.test" }, encoding: "utf8",
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
