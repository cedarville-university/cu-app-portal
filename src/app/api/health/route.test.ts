import { describe, expect, it } from "vitest";
import { GET, dynamic } from "./route";

describe("GET /api/health", () => {
  it("returns an independent public process-health response", async () => {
    const response = await GET();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
