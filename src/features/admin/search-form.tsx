import Link from "next/link";
import React from "react";

export function AdminSearchForm({
  basePath,
  defaultValue,
  placeholder,
}: {
  basePath: string;
  defaultValue: string | null;
  placeholder: string;
}) {
  return (
    <form
      method="get"
      action={basePath}
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        marginBottom: "1rem",
        flexWrap: "wrap",
      }}
    >
      <input
        type="search"
        name="q"
        className="form-control"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        style={{ maxWidth: "320px" }}
      />
      <button type="submit" className="btn btn--secondary btn--sm">
        Search
      </button>
      {defaultValue ? (
        <Link href={basePath} className="btn btn--ghost btn--sm">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
