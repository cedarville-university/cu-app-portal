import React from "react";

export function ImportFeatureFields() {
  return (
    <fieldset className="form-stack">
      <legend>Database and login</legend>
      <div className="form-group">
        <label className="form-label" htmlFor="databaseProvider">Add a database</label>
        <select id="databaseProvider" name="databaseProvider" className="form-control" defaultValue="none">
          <option value="none">No new database</option>
          <option value="postgresql">Add a PostgreSQL database</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="entraLogin">Require Cedarville login</label>
        <select id="entraLogin" name="entraLogin" className="form-control" defaultValue="true">
          <option value="true">Yes — sign in with Cedarville</option>
          <option value="false">No — openly public access</option>
        </select>
      </div>
      <p className="form-help">
        CU Launch supplies the selected services during publishing setup. Use the
        Codex instructions on the next steps to connect your app to them and test
        it before publishing. Existing data is not copied automatically. Static
        sites need a server added by Codex to use either service.
      </p>
    </fieldset>
  );
}
