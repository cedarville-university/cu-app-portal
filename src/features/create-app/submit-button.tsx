import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";

type SubmitButtonProps = {
  idleLabel?: string;
  pendingLabel?: string;
  statusText?: string;
  variant?: "primary-solid" | "secondary-solid";
  name?: string;
  value?: string;
};

export function SubmitButton({
  idleLabel = "Create and Publish",
  pendingLabel = "Publishing...",
  statusText = "Creating your app and starting Azure publishing.",
  variant = "primary-solid",
  name = "createIntent",
  value = "createAndPublish",
}: SubmitButtonProps) {
  return (
    <PendingSubmitButton
      idleLabel={idleLabel}
      pendingLabel={pendingLabel}
      statusText={statusText}
      variant={variant}
      name={name}
      value={value}
    />
  );
}
