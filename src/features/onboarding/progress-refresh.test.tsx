import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { OnboardingProgressRefresh } from "./progress-refresh";

describe("OnboardingProgressRefresh", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.useRealTimers();
  });

  it("announces automatic progress checks and refreshes at the requested interval", () => {
    vi.useFakeTimers();

    render(<OnboardingProgressRefresh intervalMs={1000} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "This page checks progress automatically. You can leave it open.",
    );

    vi.advanceTimersByTime(1000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
