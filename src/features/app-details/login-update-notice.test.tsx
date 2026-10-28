import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginUpdateNotice } from "./login-update-notice";

const props = { appRequestId: "app-1", userId: "user-1", prompt: "Update this app's /login page." };
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }),
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("LoginUpdateNotice", () => {
  it("explains the warning and copies the full update prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<LoginUpdateNotice {...props} />);
    expect(screen.getByText(/Chrome may show a.*Dangerous site/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy update prompt" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied"));
    expect(writeText).toHaveBeenCalledWith(props.prompt);
  });
  it("remembers dismissal for this app and user across remounts", () => {
    const view = render(<LoginUpdateNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss sign-in notice" }));
    expect(screen.queryByRole("region", { name: "Sign-in update" })).not.toBeInTheDocument();
    view.unmount();
    const same = render(<LoginUpdateNotice {...props} />);
    expect(screen.queryByRole("region", { name: "Sign-in update" })).not.toBeInTheDocument();
    same.unmount();
    const otherApp = render(<LoginUpdateNotice {...props} appRequestId="app-2" />);
    expect(screen.getByRole("region", { name: "Sign-in update" })).toBeInTheDocument();
    otherApp.unmount();
    render(<LoginUpdateNotice {...props} userId="user-2" />);
    expect(screen.getByRole("region", { name: "Sign-in update" })).toBeInTheDocument();
  });
  it("still dismisses when browser storage is unavailable and exposes a manual copy fallback", async () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error("blocked"); });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("blocked"); });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<LoginUpdateNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy update prompt" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Select and copy"));
    expect(screen.getByRole("textbox", { name: "Codex sign-in update prompt" })).toHaveValue(props.prompt);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss sign-in notice" }));
    expect(screen.queryByRole("region", { name: "Sign-in update" })).not.toBeInTheDocument();
  });
});
