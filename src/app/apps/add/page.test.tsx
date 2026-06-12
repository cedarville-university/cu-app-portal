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
  addExistingAppAction: vi.fn(),
  createManagedRepositoryForLocalAppAction: vi.fn(),
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import {
  addExistingAppAction,
  createManagedRepositoryForLocalAppAction,
} from "@/features/repository-imports/actions";

function findElementByType(
  element: React.ReactNode,
  type: string,
): React.ReactElement | null {
  if (!React.isValidElement(element)) {
    return null;
  }

  if (element.type === type) {
    return element;
  }

  const children = React.Children.toArray(
    (element.props as { children?: React.ReactNode }).children,
  );

  for (const child of children) {
    const found = findElementByType(child, type);

    if (found) {
      return found;
    }
  }

  return null;
}

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

    await expect(AddExistingAppPage()).rejects.toThrow("redirect:/");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("renders breadcrumb navigation and the repository analysis form", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(addExistingAppAction).mockResolvedValue({
      requestId: "req_imported_app",
    });
    vi.mocked(createManagedRepositoryForLocalAppAction).mockResolvedValue({
      requestId: "req_local_app",
    });

    const page = await AddExistingAppPage();
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
      screen.getByText(
        /currently detects root next.js apps, python fastapi apps, and plain static python apps/i,
      ),
    ).toBeInTheDocument();
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

    const formAction = findElementByType(page, "form")?.props.action as (
      formData: FormData,
    ) => Promise<void>;
    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/owner/repo");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Tracks campus metrics.");

    await expect(formAction(formData)).rejects.toThrow(
      "redirect:/download/req_imported_app",
    );
    expect(addExistingAppAction).toHaveBeenCalledWith(formData);
    expect(mockRedirect).toHaveBeenCalledWith("/download/req_imported_app");
  });

  it("shows an expandable GitHub explanation help box", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage());

    const helpToggle = screen.getByText("What is GitHub?");
    const helpBox = helpToggle.closest("details");

    expect(helpBox).not.toBeNull();
    expect(helpBox).not.toHaveAttribute("open");

    fireEvent.click(helpToggle);

    expect(helpBox).toHaveAttribute("open");
    expect(
      screen.getByText(/github is a secure place to store app code/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the portal uses github so codex/i),
    ).toBeInTheDocument();
  });

  it("renders a local Codex app path that creates a managed repository first", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(createManagedRepositoryForLocalAppAction).mockResolvedValue({
      requestId: "req_local_app",
    });

    const page = await AddExistingAppPage();
    render(page);

    expect(
      screen.getByRole("heading", { name: /not on github yet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the portal will create an empty managed github repository/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create managed repository/i }),
    ).toHaveAttribute("type", "submit");

    const forms = findElementsByType(page, "form");
    const localFormAction = forms[1]?.props.action as (
      formData: FormData,
    ) => Promise<void>;
    const formData = new FormData();
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Local app built with Codex.");

    await expect(localFormAction(formData)).rejects.toThrow(
      "redirect:/download/req_local_app",
    );
    expect(createManagedRepositoryForLocalAppAction).toHaveBeenCalledWith(
      formData,
    );
    expect(mockRedirect).toHaveBeenCalledWith("/download/req_local_app");
  });

  it("disables repository analysis and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage());

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
