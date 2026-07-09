import { describe, expect, it } from "vitest";
import {
  isRepositoryImportInputError,
  repositoryImportInputError,
} from "./errors";

describe("repository import input errors", () => {
  it("tags errors so form handlers can surface them to the user", () => {
    const error = repositoryImportInputError("Enter a GitHub repository URL.");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Enter a GitHub repository URL.");
    expect(isRepositoryImportInputError(error)).toBe(true);
  });

  it("does not match untagged errors", () => {
    expect(isRepositoryImportInputError(new Error("boom"))).toBe(false);
    expect(isRepositoryImportInputError(null)).toBe(false);
    expect(isRepositoryImportInputError("Enter a GitHub repository URL.")).toBe(
      false,
    );
  });
});
