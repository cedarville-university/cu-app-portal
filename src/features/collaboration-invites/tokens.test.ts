import { describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken } from "./tokens";

describe("collaboration invite tokens", () => {
  it("creates URL-safe invite tokens", () => {
    const token = createInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("creates invite tokens longer than 30 characters", () => {
    expect(createInviteToken().length).toBeGreaterThan(30);
  });

  it("hashes invite tokens stably", () => {
    const token = "invite-token-123";

    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("does not return the original token as the hash", () => {
    const token = "invite-token-123";

    expect(hashInviteToken(token)).not.toBe(token);
  });
});
