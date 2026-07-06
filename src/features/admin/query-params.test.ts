import { describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_SIZE,
  clampPage,
  parseAuditEventFilter,
  parseDateFilter,
  parsePage,
  parseSearch,
  totalPages,
} from "./query-params";

describe("parsePage", () => {
  it("parses a positive page number", () => {
    expect(parsePage("3")).toBe(3);
  });

  it.each([undefined, "", "0", "-2", "abc", "1.5", ["2", "3"]])(
    "defaults to 1 for %j",
    (value) => {
      expect(parsePage(value as string | string[] | undefined)).toBe(1);
    },
  );
});

describe("totalPages and clampPage", () => {
  it("computes total pages with a minimum of 1", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25)).toBe(1);
    expect(totalPages(26)).toBe(2);
  });

  it("clamps out-of-range pages", () => {
    expect(clampPage(9, 26)).toBe(2);
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe("parseSearch", () => {
  it("trims and returns the search text", () => {
    expect(parseSearch("  SUP-123  ")).toBe("SUP-123");
  });

  it.each([undefined, "", "   ", ["a", "b"]])("returns null for %j", (value) => {
    expect(parseSearch(value as string | string[] | undefined)).toBeNull();
  });
});

describe("parseAuditEventFilter", () => {
  it("accepts a known audit event", () => {
    expect(parseAuditEventFilter("SIGN_IN")).toBe("SIGN_IN");
  });

  it.each([undefined, "", "NOT_AN_EVENT", ["SIGN_IN"]])(
    "returns null for %j",
    (value) => {
      expect(
        parseAuditEventFilter(value as string | string[] | undefined),
      ).toBeNull();
    },
  );
});

describe("parseDateFilter", () => {
  it("parses a start-of-day boundary", () => {
    const date = parseDateFilter("2026-07-01", "start");

    expect(date).toEqual(new Date("2026-07-01T00:00:00"));
  });

  it("parses an end-of-day boundary", () => {
    const date = parseDateFilter("2026-07-01", "end");

    expect(date).toEqual(new Date("2026-07-01T23:59:59.999"));
  });

  it.each([undefined, "", "07/01/2026", "2026-13-45", ["2026-07-01"]])(
    "returns null for %j",
    (value) => {
      expect(
        parseDateFilter(value as string | string[] | undefined, "start"),
      ).toBeNull();
    },
  );
});

describe("ADMIN_PAGE_SIZE", () => {
  it("is 25", () => {
    expect(ADMIN_PAGE_SIZE).toBe(25);
  });
});
