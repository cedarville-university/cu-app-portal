const REPOSITORY_IMPORT_INPUT_ERROR_NAME = "RepositoryImportInputError";
const REPOSITORY_COMPATIBILITY_ERROR_NAME = "RepositoryCompatibilityError";

export function repositoryImportInputError(message: string) {
  return Object.assign(new Error(message), {
    name: REPOSITORY_IMPORT_INPUT_ERROR_NAME,
  });
}

export function isRepositoryImportInputError(error: unknown): error is Error {
  return (
    error instanceof Error && error.name === REPOSITORY_IMPORT_INPUT_ERROR_NAME
  );
}

export function repositoryCompatibilityError(message: string) {
  return Object.assign(new Error(message), {
    name: REPOSITORY_COMPATIBILITY_ERROR_NAME,
  });
}

export function isRepositoryCompatibilityError(error: unknown): error is Error {
  return (
    error instanceof Error && error.name === REPOSITORY_COMPATIBILITY_ERROR_NAME
  );
}
