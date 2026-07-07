import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { searchAuditLog, summarizeDetails } from "./audit-log";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

const noFilters = { event: null, from: null, to: null, search: null } as const;

function queryArg(callIndex: number): Prisma.Sql {
  return vi.mocked(prisma.$queryRaw).mock.calls[callIndex][0] as Prisma.Sql;
}

describe("searchAuditLog", () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockReset();
  });

  it("returns entries and a numeric total count", async () => {
    const createdAt = new Date("2026-07-06T12:00:00.000Z");
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        { id: "a1", event: "SIGN_IN", details: { x: 1 }, createdAt },
      ])
      .mockResolvedValueOnce([{ count: 1n }]);

    const result = await searchAuditLog(noFilters, 1, 25);

    expect(result.entries).toEqual([
      { id: "a1", event: "SIGN_IN", details: { x: 1 }, createdAt },
    ]);
    expect(result.totalCount).toBe(1);
  });

  it("applies no WHERE clause when there are no filters", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);

    await searchAuditLog(noFilters, 1, 25);

    expect(queryArg(0).sql).not.toContain("WHERE");
  });

  it("binds event, date range, and search filters as parameters", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    const from = new Date("2026-07-01T00:00:00");
    const to = new Date("2026-07-06T23:59:59.999");

    await searchAuditLog(
      { event: "SIGN_IN", from, to, search: "SUP-123" },
      1,
      25,
    );

    const listQuery = queryArg(0);

    expect(listQuery.sql).toContain("WHERE");
    expect(listQuery.sql).toContain("ILIKE");
    expect(listQuery.values).toContain("SIGN_IN");
    expect(listQuery.values).toContain(from);
    expect(listQuery.values).toContain(to);
    expect(listQuery.values).toContain("%SUP-123%");
    // Raw user input must only appear as a bound value, never in the SQL text.
    expect(listQuery.sql).not.toContain("SUP-123");

    const countQuery = queryArg(1);

    expect(countQuery.sql).toContain("COUNT");
    expect(countQuery.values).toContain("%SUP-123%");
  });

  it("paginates with LIMIT and OFFSET", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 60n }]);

    await searchAuditLog(noFilters, 3, 25);

    const listQuery = queryArg(0);

    expect(listQuery.sql).toContain("LIMIT");
    expect(listQuery.sql).toContain("OFFSET");
    expect(listQuery.values).toContain(25);
    expect(listQuery.values).toContain(50);
  });
});

describe("summarizeDetails", () => {
  it("shows the first three key/value pairs", () => {
    expect(
      summarizeDetails({ a: "1", b: 2, c: "3", d: "4" }),
    ).toBe("a: 1, b: 2, c: 3");
  });

  it("truncates long summaries to 120 characters", () => {
    const summary = summarizeDetails({ key: "x".repeat(200) });

    expect(summary.length).toBe(120);
    expect(summary.endsWith("...")).toBe(true);
  });

  it.each([null, undefined, "text", 42, ["a"]])(
    "returns an empty string for non-object details %j",
    (details) => {
      expect(summarizeDetails(details)).toBe("");
    },
  );

  it("substitutes a resolved label for a key when labelFor returns a string", () => {
    const labelFor = (key: string) =>
      key === "actorUserId" ? "Ada Admin" : null;

    expect(
      summarizeDetails({ actorUserId: "user-1", other: "value" }, labelFor),
    ).toBe("actorUserId: Ada Admin, other: value");
  });

  it("keeps the raw value when labelFor returns null", () => {
    const labelFor = () => null;

    expect(summarizeDetails({ a: "1", b: 2 }, labelFor)).toBe("a: 1, b: 2");
  });

  it("behaves exactly as before when labelFor is omitted", () => {
    expect(summarizeDetails({ a: "1", b: 2, c: "3", d: "4" })).toBe(
      "a: 1, b: 2, c: 3",
    );
  });

  it("applies the 120-char truncation rule to substituted text", () => {
    const labelFor = (key: string) =>
      key === "key" ? "y".repeat(200) : null;

    const summary = summarizeDetails({ key: "x" }, labelFor);

    expect(summary.length).toBe(120);
    expect(summary.endsWith("...")).toBe(true);
  });
});
