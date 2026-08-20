import React from "react";

export function CodexPreparationChecklist({
  appName,
  folderKind,
}: {
  appName: string;
  folderKind: "new" | "existing" | "new-or-existing";
}) {
  return (
    <section className="info-box" aria-labelledby="codex-preparation-heading">
      <h2 id="codex-preparation-heading">Before opening Codex</h2>
      <p>
        Git keeps a change history on your computer. GitHub keeps
        Cedarville&apos;s managed online copy for publishing. A local Codex
        project keeps Codex connected to the correct app folder.
      </p>
      <ol>
        <li>
          <strong>Make sure Git is installed.</strong> On Windows, open{" "}
          <strong>Company Portal</strong>, search for <strong>Git</strong>, and
          select Install. On macOS, open <strong>CedarNet 2.0</strong>, search
          for <strong>Git</strong>, and select Install. If Git is already
          installed, you can continue.
        </li>
        <li>
          After installing Git, completely quit and reopen Codex so it can find
          the new software.
        </li>
        <li>
          {folderKind === "new" ? (
            <>
              Create a new, empty folder named <strong>{appName}</strong> on
              your computer. Do not put other files in it.
            </>
          ) : folderKind === "existing" ? (
            <>
              Find the folder that already contains your app. Do not move or
              delete its files.
            </>
          ) : (
            <>
              If this app is already on this computer, find its existing
              folder. Otherwise, create a new, empty folder named{" "}
              <strong>{appName}</strong>. Do not put unrelated files in the
              folder.
            </>
          )}
        </li>
        <li>
          In Codex, open Projects and create a <strong>local project</strong>{" "}
          using that folder. Make it the primary folder. This tells Codex which
          files belong to this app.
        </li>
        <li>
          Open that local project and start this task inside it.{" "}
          <strong>
            Do not use Quick chat or start a standalone task outside the
            project.
          </strong>
        </li>
        <li>
          Copy the complete prompt below and paste it into the task inside the
          project. Codex will check Git and handle the technical commands for
          you.
        </li>
      </ol>
      <p>
        <a
          href="https://learn.chatgpt.com/docs/projects"
          target="_blank"
          rel="noreferrer"
        >
          How to add a local Codex project
        </a>
      </p>
    </section>
  );
}
