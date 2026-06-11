import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreatePage from "./page";

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("CreatePage", () => {
  it("lists active templates as selectable links", async () => {
    render(await CreatePage());
    expect(
      screen.getByRole("heading", { name: /create new app/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /use next.js web app/i }),
    ).toHaveAttribute("href", "/create/web-app");
    expect(
      screen.getByRole("link", { name: /use python fastapi/i }),
    ).toHaveAttribute("href", "/create/python-fastapi");

    const webAppCard = screen
      .getByRole("link", { name: /use next.js web app/i })
      .closest(".card");
    const fastApiCard = screen
      .getByRole("link", { name: /use python fastapi/i })
      .closest(".card");

    expect(webAppCard).not.toBeNull();
    expect(fastApiCard).not.toBeNull();

    const webApp = within(webAppCard as HTMLElement);
    const fastApi = within(fastApiCard as HTMLElement);

    expect(
      webApp.getByText(
        /choose this when you need pages, forms, server-side logic/i,
      ),
    ).toBeInTheDocument();
    expect(webApp.getByText("Node.js 24 / Next.js")).toBeInTheDocument();
    expect(webApp.getByText("Staff-facing web apps")).toBeInTheDocument();
    expect(webApp.getByText(/database: optional/i)).toBeInTheDocument();
    expect(webApp.getByText(/login: entra available/i)).toBeInTheDocument();

    expect(
      fastApi.getByText(
        /choose this for python-backed apis, automation endpoints/i,
      ),
    ).toBeInTheDocument();
    expect(fastApi.getByText("Python 3.14 / FastAPI")).toBeInTheDocument();
    expect(fastApi.getByText("Python APIs")).toBeInTheDocument();
    expect(fastApi.getByText(/database: unsupported/i)).toBeInTheDocument();
    expect(fastApi.getByText(/login: no entra/i)).toBeInTheDocument();
  });

  it("shows an expandable GitHub explanation help box", async () => {
    render(await CreatePage());

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
});
