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
      screen.getByRole("heading", { name: "Launch New App" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /recommended templates/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /developer starters/i }),
    ).toBeInTheDocument();
    const formCard = screen
      .getByText("Department Form + Approval")
      .closest(".card");
    const publicPageCard = screen
      .getByText("Public Information Page")
      .closest(".card");
    const webAppCard = screen
      .getByText("Custom Web App")
      .closest(".card");
    const fastApiCard = screen
      .getByText("API / Automation Service")
      .closest(".card");

    expect(formCard).not.toBeNull();
    expect(publicPageCard).not.toBeNull();
    expect(webAppCard).not.toBeNull();
    expect(fastApiCard).not.toBeNull();

    const form = within(formCard as HTMLElement);
    const publicPage = within(publicPageCard as HTMLElement);
    const webApp = within(webAppCard as HTMLElement);
    const fastApi = within(fastApiCard as HTMLElement);

    expect(form.getByRole("link", { name: "Launch App" })).toHaveAttribute(
      "href",
      "/create/department-form-approval",
    );
    expect(publicPage.getByRole("link", { name: "Launch App" })).toHaveAttribute(
      "href",
      "/create/public-information-page",
    );
    expect(webApp.getByRole("link", { name: "Launch App" })).toHaveAttribute(
      "href",
      "/create/web-app",
    );
    expect(fastApi.getByRole("link", { name: "Launch App" })).toHaveAttribute(
      "href",
      "/create/python-fastapi",
    );

    expect(
      form.getByText(/structured request form with reviewer approval/i),
    ).toBeInTheDocument();
    expect(form.getByText(/database: required/i)).toBeInTheDocument();
    expect(form.getByText(/access: choose sign-in or public/i)).toBeInTheDocument();

    expect(
      publicPage.getByText(/polished web page or small site/i),
    ).toBeInTheDocument();
    expect(publicPage.getByText(/database: unsupported/i)).toBeInTheDocument();
    expect(publicPage.getByText(/access: choose sign-in or public/i)).toBeInTheDocument();

    expect(
      webApp.getByText(
        /start from a blank cedarville-styled web app/i,
      ),
    ).toBeInTheDocument();
    expect(webApp.queryByText("Node.js 24 / Next.js")).not.toBeInTheDocument();
    expect(webApp.getByText("Staff-facing web apps")).toBeInTheDocument();
    expect(webApp.getByText(/database: optional/i)).toBeInTheDocument();
    expect(webApp.getByText(/access: choose sign-in or public/i)).toBeInTheDocument();

    expect(
      fastApi.getByText(
        /use this when the app's main job is processing data/i,
      ),
    ).toBeInTheDocument();
    expect(
      fastApi.getByText(
        /add a database and will explicitly choose cedarville sign-in or openly public access/i,
      ),
    ).toBeInTheDocument();
    expect(fastApi.queryByText("Python 3.14 / FastAPI")).not.toBeInTheDocument();
    expect(fastApi.getByText("Python APIs")).toBeInTheDocument();
    expect(fastApi.getByText(/database: optional/i)).toBeInTheDocument();
    expect(fastApi.getByText(/access: choose sign-in or public/i)).toBeInTheDocument();
  });

  it("keeps introductory Codex and GitHub guidance in Help", async () => {
    render(await CreatePage());

    expect(screen.queryByText("What is GitHub?")).not.toBeInTheDocument();
  });
});
