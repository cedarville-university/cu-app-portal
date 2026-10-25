import { expect, it } from "vitest";
import { encodeLogCursor, decodeLogCursor } from "./cursor";
it("round trips strict cursor state but rejects URLs, oversized and malformed positions", () => {
  const state = {
    version: 1 as const, appId: "app", attemptId: "p", targetKey: "a".repeat(64), source: "both" as const, logKind: "both" as const, maxLines: 200, github: {
      page: 1, index: 0, offset: 30, jobId: "2"
    }, azure: null
  };
  expect(decodeLogCursor(encodeLogCursor(state))).toEqual(state);
  for (const value of [
    "!bad", "a".repeat(4097), Buffer.from(JSON.stringify({ ...state, url: "https://evil.test" })).toString("base64url"), Buffer.from(JSON.stringify({ ...state, github: {
        page: -1, index: 0, offset: 0
      } })).toString("base64url")
  ])
    expect(() => decodeLogCursor(value)).toThrow();
});
