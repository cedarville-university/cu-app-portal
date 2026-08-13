import { describe, expect, it, vi } from "vitest";
import { loginAction } from "./login";

const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  signIn: mockSignIn,
}));

describe("loginAction", () => {
  it("starts the Microsoft Entra sign-in flow and returns users home", async () => {
    await loginAction(new FormData());

    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/",
    });
  });

  it("only accepts local redirect destinations", async () => {
    const formData = new FormData();
    formData.set("redirectTo", "https://example.com");

    await loginAction(formData);

    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/",
    });
  });
});
