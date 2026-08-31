import { describe, expect, it } from "vitest";
import { buildPythonFastApiGeneratedFiles } from "./python-fastapi-source";

const baseInput = {
  templateSlug: "python-fastapi",
  appName: "Reports API",
  description: "Department reports",
  hostingTarget: "Azure App Service" as const,
};

describe("buildPythonFastApiGeneratedFiles", () => {
  it("keeps the default FastAPI starter compact", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(files["requirements.txt"]).toContain("fastapi==");
    expect(files["requirements.txt"]).toContain("gunicorn==");
    expect(files["requirements.txt"]).not.toContain("psycopg");
    expect(files["requirements.txt"]).not.toContain("authlib");
    expect(files[".env.example"]).toContain(
      "This starter does not require local environment variables by default.",
    );
    expect(files["main.py"]).toContain('@app.get("/api/health")');
    expect(files["main.py"]).not.toContain("/login");
    expect(files["main.py"]).not.toContain("/api/data-status");
  });

  it("adds PostgreSQL helper code when selected", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "postgresql",
      entraLogin: false,
    });

    expect(files["requirements.txt"]).toContain("psycopg[binary]");
    expect(files[".env.example"]).toContain("DATABASE_URL=");
    expect(files["main.py"]).toContain("psycopg.connect");
    expect(files["main.py"]).toContain('@app.get("/api/data-status")');
    expect(files["README.md"]).toContain("PostgreSQL");
  });

  it("adds browser Entra login routes when selected", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "none",
      entraLogin: true,
    });

    expect(files["requirements.txt"]).toContain("authlib");
    expect(files["requirements.txt"]).toContain("itsdangerous");
    expect(files[".env.example"]).toContain("AUTH_MICROSOFT_ENTRA_ID_ID=");
    expect(files["main.py"]).toContain('@app.get("/login")');
    expect(files["main.py"]).toContain('@app.get("/auth/callback")');
    expect(files["main.py"]).toContain('@app.get("/logout")');
    expect(files["main.py"]).toContain('@app.get("/protected")');
    expect(files["main.py"]).toContain('@app.middleware("http")');
    expect(files["main.py"]).toContain("return RedirectResponse(url=\"/login\")");
    expect(files["main.py"]).toContain(
      'public_paths = {"/login", "/auth/callback", "/api/health"}',
    );
    expect(files["main.py"]).not.toContain('"/docs"');
    expect(files["main.py"]).not.toContain('"/openapi.json"');
    expect(files["main.py"].indexOf("app.add_middleware(")).toBeGreaterThan(
      files["main.py"].indexOf('@app.middleware("http")'),
    );
    expect(files["main.py"]).not.toContain('"database": os.environ.get');
    expect(files["main.py"]).not.toContain('"entraLogin":');
  });
});
