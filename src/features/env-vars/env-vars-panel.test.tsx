import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  saveEnvVarsFormAction: vi.fn().mockResolvedValue({ error: null, saved: true }),
  saveEnvVarFormAction: vi.fn(),
  deleteEnvVarFormAction: vi.fn(),
}));

import { saveEnvVarsFormAction } from "./actions";

import { EnvVarsPanel } from "./env-vars-panel";

beforeEach(() => {
  vi.mocked(saveEnvVarsFormAction).mockClear();
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("EnvVarsPanel", () => {
  it("lists variables, masks secret values, and offers deletion", () => {
    render(
      <EnvVarsPanel
        appRequestId="req-1"
        isPublished
        envVars={[
          {
            key: "FEATURE_FLAG",
            isSecret: false,
            value: "on",
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
          {
            key: "API_KEY",
            isSecret: true,
            value: null,
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
    expect(screen.getByDisplayValue("FEATURE_FLAG")).toBeInTheDocument();
    expect(screen.getByLabelText("Value for FEATURE_FLAG")).toBeInTheDocument();
    expect(screen.getByDisplayValue("API_KEY")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Leave blank to keep saved secret")).toBeInTheDocument();
    expect(screen.getByLabelText("Store API_KEY as a secret")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete FEATURE_FLAG" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state and pre-publish note when unpublished", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished={false} envVars={[]} />);

    expect(screen.getByText("No environment variables yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/applied when the app is published/i),
    ).toBeInTheDocument();
  });

  it("explains the live-restart behavior for published apps", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={[]} />);

    expect(screen.getByText(/briefly restart/i)).toBeInTheDocument();
  });
});


const variables = [
  { key: "FIRST", value: "one", isSecret: false, updatedAt: new Date() },
  { key: "SECOND", value: "two", isSecret: false, updatedAt: new Date() },
  { key: "SECRET", value: null, isSecret: true, updatedAt: new Date() },
];

it("stages multiple edits and a deletion until Save Changes is submitted", async () => {
  render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={variables} />);
  fireEvent.change(screen.getByLabelText("Value for FIRST"), { target: { value: "updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete SECOND" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Variable" }));
  fireEvent.change(screen.getByLabelText("Name for new variable 1"), { target: { value: "THIRD" } });
  fireEvent.change(screen.getByLabelText("Value for THIRD"), { target: { value: "three" } });
  expect(saveEnvVarsFormAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(saveEnvVarsFormAction).toHaveBeenCalledTimes(1));
  const data = vi.mocked(saveEnvVarsFormAction).mock.calls[0][2];
  expect(JSON.parse(String(data.get("changes")))).toEqual([
    { operation: "set", key: "FIRST", value: "updated", isSecret: false },
    { operation: "delete", key: "SECOND" },
    { operation: "set", key: "THIRD", value: "three", isSecret: false },
  ]);
});

it("discards draft additions, edits, and deletions", () => {
  render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={variables} />);
  fireEvent.change(screen.getByLabelText("Value for FIRST"), { target: { value: "updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete SECOND" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Variable" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
  expect(screen.getByLabelText("Value for FIRST")).toHaveValue("one");
  expect(screen.getByLabelText("Value for SECOND")).toHaveValue("two");
  expect(screen.queryByLabelText("Name for new variable 1")).not.toBeInTheDocument();
  expect(saveEnvVarsFormAction).not.toHaveBeenCalled();
});

it("preserves draft values when submission fails", async () => {
  vi.mocked(saveEnvVarsFormAction).mockResolvedValueOnce({ error: "Could not save changes.", saved: false });
  render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={variables} />);
  fireEvent.change(screen.getByLabelText("Value for FIRST"), { target: { value: "updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save changes.");
  expect(screen.getByLabelText("Value for FIRST")).toHaveValue("updated");
});

it("replaces a secret without requiring its key and clears the replacement after saving", async () => {
  render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={variables} />);
  fireEvent.change(screen.getByLabelText("Value for SECRET"), { target: { value: "replacement" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await screen.findByText("Environment variable changes saved.");
  await waitFor(() => expect(screen.getByLabelText("Value for SECRET")).toHaveValue(""));
  expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  const data = vi.mocked(saveEnvVarsFormAction).mock.calls[0][2];
  expect(JSON.parse(String(data.get("changes")))).toEqual([
    { operation: "set", key: "SECRET", value: "replacement", isSecret: true },
  ]);
});

it("discards a later edit back to the last successfully saved value", async () => {
  render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={variables} />);
  fireEvent.change(screen.getByLabelText("Value for FIRST"), { target: { value: "saved" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await screen.findByText("Environment variable changes saved.");
  fireEvent.change(screen.getByLabelText("Value for FIRST"), { target: { value: "unsaved" } });
  fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
  expect(screen.getByLabelText("Value for FIRST")).toHaveValue("saved");
});
