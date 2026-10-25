import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const checkName = vi.hoisted(() => vi.fn());
vi.mock("@/app/create/name-availability-action", () => ({ checkAppNameAvailability: checkName }));
import { AppNameField } from "./app-name-field";

describe("AppNameField", () => {
  beforeEach(() => { vi.useFakeTimers(); checkName.mockReset().mockResolvedValue(true); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const input = () => screen.getByLabelText("App Name") as HTMLInputElement;
  const change = (value: string) => fireEvent.change(input(), { target: { value } });
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it("waits until typing pauses for 500ms before checking", async () => {
    render(<AppNameField />);
    change("Campus"); await advance(400); change("Campus Hub"); await advance(499);
    expect(checkName).not.toHaveBeenCalled();
    await advance(1);
    expect(checkName).toHaveBeenCalledTimes(1);
    expect(checkName).toHaveBeenCalledWith("Campus Hub");
    expect(input().validity.valid).toBe(true);
  });

  it("keeps a successfully checked name valid when blur precedes submit", async () => {
    render(<AppNameField />); change("Campus Hub"); await advance(500);
    expect(input().validity.valid).toBe(true);
    checkName.mockReturnValueOnce(new Promise<boolean>(() => {}));
    fireEvent.blur(input());
    expect(input().validity.valid).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(checkName).toHaveBeenCalledTimes(2);
  });

  it("checks immediately on blur and cancels the pending timer", async () => {
    checkName.mockResolvedValue(false);
    render(<AppNameField />); change("Campus Hub");
    await act(async () => { fireEvent.blur(input()); });
    expect(screen.getByRole("alert")).toHaveTextContent("That app name is already in use. Please try another name.");
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input().validity.valid).toBe(false);
    await advance(500); expect(checkName).toHaveBeenCalledTimes(1);
  });

  it("clears a conflict when the user enters an available name", async () => {
    checkName.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<AppNameField />); change("Taken"); await advance(500);
    change("Unused"); await advance(500);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input().validity.valid).toBe(true);
  });

  it("ignores a stale response even before the new debounce finishes", async () => {
    let resolveOld!: (value: boolean) => void;
    checkName.mockReturnValueOnce(new Promise<boolean>(resolve => { resolveOld = resolve; }));
    render(<AppNameField />); change("Old name"); await advance(500); change("New name");
    await act(async () => { resolveOld(false); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await advance(500); expect(input().validity.valid).toBe(true);
  });

  it("keeps submission blocked while a name is unchecked", async () => {
    render(<AppNameField />); change("Campus Hub");
    expect(input().validity.valid).toBe(false);
    await advance(500); expect(input().validity.valid).toBe(true);
  });

  it("shows a retry message on lookup failure and retries on blur", async () => {
    checkName.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(true);
    render(<AppNameField />); change("Campus Hub"); await advance(500);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not check.*try again/i);
    expect(input().validity.valid).toBe(false);
    await act(async () => { fireEvent.blur(input()); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input().validity.valid).toBe(true);
  });

  it("does not query empty names and cancels checks when unmounted", async () => {
    const view = render(<AppNameField />); change("  "); await advance(500);
    expect(checkName).not.toHaveBeenCalled();
    change("Campus Hub"); view.unmount(); await advance(500);
    expect(checkName).not.toHaveBeenCalled();
  });
});
