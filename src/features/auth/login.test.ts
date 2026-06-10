import { describe, expect, it, vi } from "vitest";
import { loginAction } from "./login";

const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  signIn: mockSignIn,
}));

describe("loginAction", () => {
  it("starts the Microsoft Entra sign-in flow and returns users home", async () => {
    await loginAction();

    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/",
    });
  });
});
