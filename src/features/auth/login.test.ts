import { describe, expect, it, vi } from "vitest";
import { loginAction } from "./login";

const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  signIn: mockSignIn,
}));

describe("loginAction", () => {
  it("starts Microsoft Entra sign-in through the optional GitHub profile step", async () => {
    await loginAction(new FormData());

    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/onboarding/github?returnTo=%2F",
    });
  });

  it("only accepts local redirect destinations", async () => {
    const formData = new FormData();
    formData.set("redirectTo", "https://example.com");

    await loginAction(formData);

    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/onboarding/github?returnTo=%2F",
    });
  });

  it("resumes the requested app page after profile setup or skipping", async () => {
    const formData = new FormData();
    formData.set("redirectTo", "/download/request-123");
    await loginAction(formData);
    expect(mockSignIn).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/onboarding/github?returnTo=%2Fdownload%2Frequest-123",
    });
  });
});
