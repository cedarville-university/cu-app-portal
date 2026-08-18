import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddExistingAppPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/repository-imports/actions", () => ({
  addExistingAppFormAction: vi.fn(),
  createManagedRepositoryForLocalAppAction: vi.fn(),
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { createManagedRepositoryForLocalAppAction } from "@/features/repository-imports/actions";

const emptyPageProps = {
  searchParams: Promise.resolve({}),
};

function findElementsByType(
  element: React.ReactNode,
  type: string,
): React.ReactElement[] {
  if (!React.isValidElement(element)) {
    return [];
  }

  const matches = element.type === type ? [element] : [];
  const children = React.Children.toArray(
    (element.props as { children?: React.ReactNode }).children,
  );

  return [
    ...matches,
    ...children.flatMap((child) => findElementsByType(child, type)),
  ];
}

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddExistingAppPage", () => {
  it("redirects unauthenticated users home", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(null);

    await expect(AddExistingAppPage(emptyPageProps)).rejects.toThrow("redirect:/");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("renders breadcrumb navigation and the repository analysis form", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(createManagedRepositoryForLocalAppAction).mockResolvedValue({
      requestId: "req_local_app",
    });

    const page = await AddExistingAppPage(emptyPageProps);
    render(page);

    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    });
    expect(within(breadcrumb).getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(breadcrumb).getByRole("link", { name: /my apps/i }),
    ).toHaveAttribute("href", "/apps");
    expect(
      within(breadcrumb).getByText("Add Existing App"),
    ).toHaveAttribute("aria-current", "page");

    expect(
      screen.getByRole("heading", { name: /add existing app/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/help you put it online when you.re ready/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cedarville org/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "type",
      "url",
    );
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "required",
    );
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "placeholder",
      "https://github.com/owner/repo",
    );
    expect(screen.getByLabelText(/^app name$/i)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/^app name$/i)).toHaveAttribute("required");
    expect(screen.getByLabelText(/^description$/i)).toHaveAttribute("rows", "4");
    expect(
      screen.getByRole("button", { name: /check repository/i }),
    ).toHaveAttribute("type", "submit");
  });

  it("shows an expandable GitHub explanation help box", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage(emptyPageProps));

    const helpToggle = screen.getByText("What is GitHub?");
    const helpBox = helpToggle.closest("details");

    expect(helpBox).not.toBeNull();
    expect(helpBox).not.toHaveAttribute("open");

    fireEvent.click(helpToggle);

    expect(helpBox).toHaveAttribute("open");
    expect(
      within(helpBox as HTMLElement).getByText(
        /github is a secure website where app files can be saved/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(helpBox as HTMLElement).getByText(
        /online folder that holds an app is called a repository/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps compatibility jargon inside optional help", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage(emptyPageProps));

    const technicalHelp = screen.getByText(/what kinds of apps can i add/i).closest("details");

    expect(technicalHelp).not.toBeNull();
    expect(technicalHelp).not.toHaveAttribute("open");
    expect(
      screen.getByText(/paste your app.s web address. the portal will check it/i),
    ).toBeInTheDocument();
  });

  it("renders a local app path that creates an online home first", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(createManagedRepositoryForLocalAppAction).mockResolvedValue({
      requestId: "req_local_app",
    });

    const page = await AddExistingAppPage(emptyPageProps);
    render(page);

    expect(
      screen.getByRole("heading", { name: /only on my computer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the portal will create an empty online home for your app/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Codex instructions/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create online home/i }),
    ).toHaveAttribute("type", "submit");

    const forms = findElementsByType(page, "form");
    const localFormAction = forms[0]?.props.action as (
      formData: FormData,
    ) => Promise<void>;
    const formData = new FormData();
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Local app built with Codex.");

    await expect(localFormAction(formData)).rejects.toThrow(
      "redirect:/onboarding/req_local_app",
    );
    expect(createManagedRepositoryForLocalAppAction).toHaveBeenCalledWith(
      formData,
    );
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding/req_local_app");
  });

  it("puts the GitHub form first and marks it as the current step when selected", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(
      await AddExistingAppPage({
        searchParams: Promise.resolve({ source: "github" }),
      }),
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings[0]).toHaveAccessibleName(/already on github/i);
    expect(headings[1]).toHaveAccessibleName(/only on my computer/i);
    expect(
      headings[0].closest(".card"),
    ).toHaveTextContent(/current step/i);
  });

  it("prefills a failed import restart from the original request values", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(
      await AddExistingAppPage({
        searchParams: Promise.resolve({
          source: "github",
          repositoryUrl:
            "https://github.com/external-org/campus-dashboard",
          appName: "Campus Dashboard",
        }),
      }),
    );

    expect(screen.getByLabelText(/github repository url/i)).toHaveValue(
      "https://github.com/external-org/campus-dashboard",
    );
    expect(screen.getByLabelText(/^app name$/i)).toHaveValue(
      "Campus Dashboard",
    );
  });

  it("puts the computer-only form first and marks it as the current step when selected", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(
      await AddExistingAppPage({
        searchParams: Promise.resolve({ source: "local" }),
      }),
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings[0]).toHaveAccessibleName(/only on my computer/i);
    expect(headings[1]).toHaveAccessibleName(/already on github/i);
    expect(
      headings[0].closest(".card"),
    ).toHaveTextContent(/current step/i);
    expect(screen.getByLabelText(/github repository url/i)).toBeInTheDocument();
  });

  it("disables repository analysis and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage(emptyPageProps));

    expect(
      screen.getByRole("button", { name: /checking repository/i }),
    ).toBeDisabled();
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          /checking your repository for compatibility/i.test(
            status.textContent ?? "",
          ),
        ),
    ).toBe(true);
  });
});
