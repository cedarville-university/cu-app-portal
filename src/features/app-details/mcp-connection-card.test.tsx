import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { McpConnectionCard } from "./mcp-connection-card";
describe("MCP connection guidance", () => {
  it("does not invent an endpoint before setup and publishing", () => {
    render(<McpConnectionCard connection={null} />);
    expect(screen.getByText(/available after identity setup/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Sites is not required/)).toBeTruthy();
  });
});
