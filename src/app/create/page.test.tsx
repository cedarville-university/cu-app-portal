import {
  cleanup,
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
      screen.getByRole("heading", { name: /recommended templates/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /developer starters/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /use department form \+ approval/i }),
    ).toHaveAttribute("href", "/create/department-form-approval");
    expect(
      screen.getByRole("link", { name: /use simple data tracker/i }),
    ).toHaveAttribute("href", "/create/simple-data-tracker");
    expect(
      screen.getByRole("link", { name: /use public information page/i }),
    ).toHaveAttribute("href", "/create/public-information-page");
    expect(
      screen.getByRole("link", { name: /use custom web app/i }),
    ).toHaveAttribute("href", "/create/web-app");
    expect(
      screen.getByRole("link", { name: /use api \/ automation service/i }),
    ).toHaveAttribute("href", "/create/python-fastapi");

    const formCard = screen
      .getByRole("link", { name: /use department form \+ approval/i })
      .closest(".card");
    const publicPageCard = screen
      .getByRole("link", { name: /use public information page/i })
      .closest(".card");
    const webAppCard = screen
      .getByRole("link", { name: /use custom web app/i })
      .closest(".card");
    const fastApiCard = screen
      .getByRole("link", { name: /use api \/ automation service/i })
      .closest(".card");

    expect(formCard).not.toBeNull();
    expect(publicPageCard).not.toBeNull();
    expect(webAppCard).not.toBeNull();
    expect(fastApiCard).not.toBeNull();

    const form = within(formCard as HTMLElement);
    const publicPage = within(publicPageCard as HTMLElement);
    const webApp = within(webAppCard as HTMLElement);
    const fastApi = within(fastApiCard as HTMLElement);

    expect(
      form.getByText(/structured request form with reviewer approval/i),
    ).toBeInTheDocument();
    expect(form.getByText(/database: required/i)).toBeInTheDocument();
    expect(form.getByText(/login: entra available/i)).toBeInTheDocument();

    expect(
      publicPage.getByText(/polished web page or small site/i),
    ).toBeInTheDocument();
    expect(publicPage.getByText(/database: unsupported/i)).toBeInTheDocument();
    expect(publicPage.getByText(/login: no entra/i)).toBeInTheDocument();

    expect(
      webApp.getByText(
        /start from a blank cedarville-styled web app/i,
      ),
    ).toBeInTheDocument();
    expect(webApp.getByText("Node.js 24 / Next.js")).toBeInTheDocument();
    expect(webApp.getByText("Staff-facing web apps")).toBeInTheDocument();
    expect(webApp.getByText(/database: optional/i)).toBeInTheDocument();
    expect(webApp.getByText(/login: entra available/i)).toBeInTheDocument();

    expect(
      fastApi.getByText(
        /use this when the app's main job is processing data/i,
      ),
    ).toBeInTheDocument();
    expect(
      fastApi.getByText(/database and entra login can be enabled/i),
    ).toBeInTheDocument();
    expect(fastApi.getByText("Python 3.14 / FastAPI")).toBeInTheDocument();
    expect(fastApi.getByText("Python APIs")).toBeInTheDocument();
    expect(fastApi.getByText(/database: optional/i)).toBeInTheDocument();
    expect(fastApi.getByText(/login: entra available/i)).toBeInTheDocument();
  });

  it("keeps introductory Codex and GitHub guidance in Help", async () => {
    render(await CreatePage());

    expect(screen.queryByText("What is GitHub?")).not.toBeInTheDocument();
  });
});
