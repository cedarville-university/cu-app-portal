import { describe, expect, it } from "vitest";
import {
  IMPORTED_NEXT_RUNTIME,
  scanRepositoryCompatibility,
} from "./compatibility";

const UNSUPPORTED_RUNTIME_MESSAGE =
  "Repository must be a root Next.js, FastAPI, or Python static app for portal-managed Azure publishing.";

const AMBIGUOUS_RUNTIME_MESSAGE =
  "Repository matches multiple supported runtimes. Keep one root Next.js, FastAPI, or Python static app for portal-managed Azure publishing.";

const UNSUPPORTED_WORKSPACE_MESSAGE =
  "V1 supports single root Next.js, FastAPI, or Python static apps, not workspace roots.";

describe("scanRepositoryCompatibility", () => {
  it("accepts a root Next-style npm app that already has build and start scripts", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "package-lock.json": "{}",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("accepts a root FastAPI app with requirements.txt and main.py", () => {
    expect(
      scanRepositoryCompatibility({
        "requirements.txt":
          "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: expect.objectContaining({
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
      }),
    });
  });

  it("accepts a simple static Python http.server app with a root index.html", () => {
    expect(
      scanRepositoryCompatibility({
        "index.html": "<h1>Campus Reports</h1>",
        "styles.css": "body { font-family: sans-serif; }",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: {
        family: "python",
        framework: "http-server",
        displayName: "Python 3.14 / http.server",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand: "python app-portal/http_server_start.py",
        workflowFileName: "deploy-azure-app-service.yml",
      },
    });
  });

  it("accepts a root FastAPI app even when package.json is invalid", () => {
    expect(
      scanRepositoryCompatibility({
        "requirements.txt":
          "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "package.json": "not json",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: expect.objectContaining({
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
      }),
    });
  });

  it("accepts a root FastAPI app with pyproject.toml and app.py", () => {
    expect(
      scanRepositoryCompatibility({
        "pyproject.toml":
          '[project]\ndependencies = ["fastapi>=0.115", "gunicorn>=23", "uvicorn[standard]>=0.30"]\n',
        "app.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: expect.objectContaining({
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn app:app -k uvicorn.workers.UvicornWorker",
      }),
    });
  });

  it("accepts a root FastAPI app with Poetry-style pyproject dependencies", () => {
    expect(
      scanRepositoryCompatibility({
        "pyproject.toml": [
          "[tool.poetry.dependencies]",
          "python = \"^3.14\"",
          "fastapi = \"^0.115\"",
          "gunicorn = \"^23.0\"",
          "uvicorn = { extras = [\"standard\"], version = \"^0.32\" }",
        ].join("\n"),
        "app.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: expect.objectContaining({
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn app:app -k uvicorn.workers.UvicornWorker",
      }),
    });
  });

  it("rejects FastAPI apps without gunicorn", () => {
    const result = scanRepositoryCompatibility({
      "requirements.txt": "fastapi==0.115.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    });

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.runtime).toBeNull();
    expect(result.findings).toContainEqual({
      code: "MISSING_FASTAPI_SERVER_DEPENDENCY",
      severity: "error",
      message:
        "FastAPI imports must include gunicorn and uvicorn dependencies for the portal-managed startup command.",
    });
  });

  it("rejects FastAPI apps without uvicorn", () => {
    const result = scanRepositoryCompatibility({
      "requirements.txt": "fastapi==0.115.0\ngunicorn==23.0.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    });

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.runtime).toBeNull();
    expect(result.findings).toContainEqual({
      code: "MISSING_FASTAPI_SERVER_DEPENDENCY",
      severity: "error",
      message:
        "FastAPI imports must include gunicorn and uvicorn dependencies for the portal-managed startup command.",
    });
  });

  it("rejects FastAPI apps without a root entrypoint", () => {
    const result = scanRepositoryCompatibility({
      "requirements.txt":
        "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
    });

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.runtime).toBeNull();
    expect(result.findings).toContainEqual({
      code: "MISSING_FASTAPI_ENTRYPOINT",
      severity: "error",
      message:
        "FastAPI imports must include a root main.py or app.py entrypoint.",
    });
  });

  it("does not detect FastAPI from comment-only requirements lines", () => {
    expect(
      scanRepositoryCompatibility({
        "requirements.txt": "# fastapi\n# gunicorn\n# uvicorn[standard]\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("does not detect FastAPI from adjacent package names", () => {
    expect(
      scanRepositoryCompatibility({
        "requirements.txt":
          "fastapi-users==14.0.0\ngunicorn==23.0.0\nuvicorn==0.30.0\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("does not detect FastAPI from pyproject project metadata", () => {
    expect(
      scanRepositoryCompatibility({
        "pyproject.toml":
          '[project]\nname = "fastapi"\ndependencies = ["gunicorn>=23", "uvicorn>=0.30"]\n',
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("does not detect FastAPI from unrelated pyproject dependency arrays", () => {
    expect(
      scanRepositoryCompatibility({
        "pyproject.toml":
          '[tool.some-plugin]\ndependencies = ["fastapi>=0.115", "gunicorn>=23", "uvicorn[standard]>=0.32"]\n',
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("rejects ambiguous Next.js and FastAPI repositories", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
        engines: { node: ">=24" },
      }),
      "requirements.txt":
        "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    });

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.runtime).toBeNull();
    expect(result.findings).toContainEqual({
      code: "AMBIGUOUS_APP_RUNTIME",
      severity: "error",
      message: AMBIGUOUS_RUNTIME_MESSAGE,
    });
  });

  it("rejects ambiguous Next.js and root static repositories", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
        engines: { node: ">=24" },
      }),
      "package-lock.json": "{}",
      "index.html": "<h1>Static app</h1>",
    });

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.runtime).toBeNull();
    expect(result.findings).toContainEqual({
      code: "AMBIGUOUS_APP_RUNTIME",
      severity: "error",
      message: AMBIGUOUS_RUNTIME_MESSAGE,
    });
  });

  it("treats FastAPI apps with root static files as FastAPI", () => {
    const result = scanRepositoryCompatibility({
      "requirements.txt":
        "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      "index.html": "<h1>Docs</h1>",
    });

    expect(result).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
      runtime: expect.objectContaining({
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
      }),
    });
  });

  it("marks safe additions when start and engines are missing", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
      }),
    ).toEqual({
      status: "NEEDS_ADDITIONS",
      findings: [
        {
          code: "MISSING_START_SCRIPT",
          severity: "warning",
          message: "package.json is missing a start script; the portal can add \"next start\".",
        },
        {
          code: "MISSING_NODE_ENGINE",
          severity: "warning",
          message: "package.json is missing engines.node; the portal can add \">=24\".",
        },
      ],
      canDirectCommit: true,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects unsupported package manager lockfiles", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
        }),
        "pnpm-lock.yaml": "lockfileVersion: 9",
      }).status,
    ).toBe("UNSUPPORTED");
  });

  it("rejects repositories without a supported runtime", () => {
    expect(scanRepositoryCompatibility({})).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("marks invalid package.json content separately from missing package.json", () => {
    expect(scanRepositoryCompatibility({ "package.json": "" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be valid JSON.",
          path: "package.json",
        },
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("rejects null package.json root values as invalid JSON shape", () => {
    expect(scanRepositoryCompatibility({ "package.json": "null" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("rejects array package.json root values as invalid JSON shape", () => {
    expect(scanRepositoryCompatibility({ "package.json": "[]" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("rejects package.json files without a build script", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "MISSING_BUILD_SCRIPT",
          severity: "error",
          message: "package.json must include a build script.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects apps without a Next dependency", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "vite build", start: "vite preview" },
          dependencies: { vite: "7.0.0" },
          engines: { node: ">=24" },
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_RUNTIME",
          severity: "error",
          message: UNSUPPORTED_RUNTIME_MESSAGE,
        },
      ],
      canDirectCommit: false,
      runtime: null,
    });
  });

  it("rejects yarn.lock by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "yarn.lock": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects bun.lockb by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "bun.lockb": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects bun.lock by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "bun.lock": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("prioritizes conflicts over other compatibility errors", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { start: "vite preview" },
        dependencies: { vite: "7.0.0" },
      }),
      "app-portal/deployment-manifest.json": "{}",
    });

    expect(result.status).toBe("CONFLICTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.findings).toContainEqual({
      code: "FILE_CONFLICT",
      severity: "error",
      message: "app-portal/deployment-manifest.json already exists and will not be overwritten.",
      path: "app-portal/deployment-manifest.json",
    });
    expect(result.findings).toContainEqual({
      code: "UNSUPPORTED_APP_RUNTIME",
      severity: "error",
      message: UNSUPPORTED_RUNTIME_MESSAGE,
    });
  });

  it("rejects package.json workspaces as unsupported workspace roots", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
          workspaces: ["apps/*"],
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: UNSUPPORTED_WORKSPACE_MESSAGE,
          path: "package.json",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects turbo.json as an unsupported workspace root marker", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "turbo.json": "{}",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: UNSUPPORTED_WORKSPACE_MESSAGE,
          path: "turbo.json",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("rejects pnpm-workspace.yaml as an unsupported workspace root marker", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "pnpm-workspace.yaml": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: UNSUPPORTED_WORKSPACE_MESSAGE,
          path: "pnpm-workspace.yaml",
        },
      ],
      canDirectCommit: false,
      runtime: IMPORTED_NEXT_RUNTIME,
    });
  });

  it("records file conflicts without overwriting existing publishing files", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
      }),
      "app-portal/deployment-manifest.json": "{}",
    });

    expect(result.status).toBe("CONFLICTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.findings).toContainEqual({
      code: "FILE_CONFLICT",
      severity: "error",
      message: "app-portal/deployment-manifest.json already exists and will not be overwritten.",
      path: "app-portal/deployment-manifest.json",
    });
  });
});
