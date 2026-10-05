"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";
import { saveEnvVarsFormAction, type EnvVarsFormState } from "./actions";
import type { EnvVarListItem } from "./env-vars-panel";
import type { EnvVarChange } from "./service";

type DraftRow = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  original: { value: string; isSecret: boolean } | null;
  deleted: boolean;
};

function createRows(envVars: EnvVarListItem[]): DraftRow[] {
  return envVars.map((variable) => ({
    id: variable.key,
    key: variable.key,
    value: variable.isSecret ? "" : variable.value ?? "",
    isSecret: variable.isSecret,
    original: { value: variable.isSecret ? "" : variable.value ?? "", isSecret: variable.isSecret },
    deleted: false,
  }));
}

function getChanges(rows: DraftRow[]): EnvVarChange[] {
  return rows.flatMap((row): EnvVarChange[] => {
    if (row.deleted) return row.original ? [{ operation: "delete", key: row.key }] : [];
    const changed = !row.original || (row.isSecret ? row.value !== "" : row.value !== row.original.value);
    return changed ? [{ operation: "set", key: row.key.trim(), value: row.value, isSecret: row.isSecret }] : [];
  });
}

const initialState: EnvVarsFormState = { error: null, saved: false };

export function EnvVarForm({ appRequestId, envVars }: { appRequestId: string; envVars: EnvVarListItem[] }) {
  const [rows, setRows] = useState(() => createRows(envVars));
  const nextId = useRef(1);
  const [showFeedback, setShowFeedback] = useState(false);
  const [state, formAction, pending] = useActionState(saveEnvVarsFormAction.bind(null, appRequestId), initialState);
  const changes = getChanges(rows);

  useEffect(() => {
    if (state.saved) {
      setRows((current) => current.filter((row) => !row.deleted).map((row) => ({
        ...row,
        key: row.key.trim(),
        value: row.isSecret ? "" : row.value,
        original: { value: row.isSecret ? "" : row.value, isSecret: row.isSecret },
      })));
    }
  }, [state]);

  useEffect(() => {
    setRows((current) => getChanges(current).length ? current : createRows(envVars));
  }, [envVars]);

  function updateRow(id: string, update: Partial<DraftRow>) {
    setShowFeedback(false);
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...update } : row));
  }

  return (
    <form action={formAction} onSubmit={() => setShowFeedback(true)}>
      <input type="hidden" name="changes" value={JSON.stringify(changes)} />
      <fieldset disabled={pending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div className="status-table">
          {rows.map((row) => (
            <div key={row.id} className="status-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0.75rem", padding: "1rem 0" }}>
              <label style={{ display: "grid", gap: "0.25rem", flex: "1 1 180px" }}>
                <span>Name</span>
                <input className="form-control" aria-label={row.original ? `Name for ${row.key}` : `Name for new variable ${row.id.replace("new-", "")}`}
                  value={row.key} readOnly={!!row.original} disabled={row.deleted} required={!row.deleted}
                  placeholder="API_KEY" autoComplete="off" spellCheck={false}
                  onChange={(event) => updateRow(row.id, { key: event.target.value })} />
              </label>
              {row.deleted ? <p style={{ flex: "2 1 260px", color: "var(--text-secondary)" }}>Will be deleted when you save changes.</p> : (
                <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 260px" }}>
                  <span>{row.isSecret && row.original ? "Replacement secret" : "Value"}</span>
                  <input className="form-control" aria-label={`Value for ${row.key || row.id}`}
                    type={row.isSecret ? "password" : "text"} value={row.value}
                    placeholder={row.isSecret && row.original ? "Leave blank to keep saved secret" : "value"}
                    autoComplete="off" spellCheck={false}
                    onChange={(event) => updateRow(row.id, { value: event.target.value })} />
                </label>
              )}
              <label style={{ display: "flex", gap: "0.375rem", alignItems: "center", paddingBottom: "0.5rem" }}>
                <input type="checkbox" aria-label={`Store ${row.key || row.id} as a secret`} checked={row.isSecret}
                  disabled={!!row.original || row.deleted}
                  onChange={(event) => updateRow(row.id, { isSecret: event.target.checked })} />
                <span>Store as a secret</span>
              </label>
              <button type="button" className={`btn btn--${row.deleted ? "secondary" : "danger"} btn--sm`}
                aria-label={`${row.deleted ? "Undo deletion of" : "Delete"} ${row.key || "new variable"}`}
                onClick={() => {
                  if (row.original) updateRow(row.id, { deleted: !row.deleted });
                  else { setShowFeedback(false); setRows((current) => current.filter((item) => item.id !== row.id)); }
                }}>{row.deleted ? "Undo" : "Delete"}</button>
            </div>
          ))}
        </div>
        {!rows.length ? <p style={{ color: "var(--text-secondary)" }}>No environment variables yet.</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", marginTop: "1rem", alignItems: "center" }}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => {
            setShowFeedback(false);
            setRows((current) => [...current, { id: `new-${nextId.current++}`, key: "", value: "", isSecret: false, original: null, deleted: false }]);
          }}>Add Variable</button>
          <button type="submit" className="btn btn--primary-solid btn--sm" disabled={!changes.length || pending}>{pending ? "Saving..." : "Save Changes"}</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!changes.length} onClick={() => {
            setShowFeedback(false);
            setRows((current) => current.filter((row) => row.original).map((row) => ({
              ...row, value: row.original!.value, isSecret: row.original!.isSecret, deleted: false,
            })));
          }}>Discard Changes</button>
          {changes.length ? <span style={{ color: "var(--text-secondary)" }}>{changes.length} unsaved {changes.length === 1 ? "change" : "changes"}</span> : null}
        </div>
      </fieldset>
      {pending ? <p role="status">Saving environment variable changes.</p> : null}
      {showFeedback && state.error ? <p role="alert" className="error-box">{state.error} Your draft is kept. Some changes may already have been applied; retry to finish saving.</p> : null}
      {showFeedback && state.saved && !pending ? <p role="status">Environment variable changes saved.</p> : null}
    </form>
  );
}
