import { describe, expect, it } from "vitest";
import {
  isRepositoryCompatibilityError,
  isRepositoryImportInputError,
  repositoryCompatibilityError,
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

describe("repository compatibility errors", () => {
  it("tags deterministic compatibility failures for wizard recovery", () => {
    const error = repositoryCompatibilityError("Unsupported runtime.");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unsupported runtime.");
    expect(isRepositoryCompatibilityError(error)).toBe(true);
    expect(isRepositoryCompatibilityError(new Error("Unsupported runtime."))).toBe(
      false,
    );
  });
});
