import React, { type ReactNode } from "react";

const stages = ["Start", "Code", "Prepare", "Publish"] as const;

type OnboardingStage = (typeof stages)[number];

type OnboardingStepShellProps = {
  appName: string;
  currentStage: OnboardingStage;
  title: string;
  explanation: string;
  next: string;
  supportReference?: string;
  details?: ReactNode;
  children: ReactNode;
};

export function OnboardingStepShell({
  appName,
  currentStage,
  title,
  explanation,
  next,
  supportReference,
  details,
  children,
}: OnboardingStepShellProps) {
  const currentStageIndex = stages.indexOf(currentStage);

  return (
    <section className="onboarding-step-shell" aria-labelledby="onboarding-step-title">
      <header className="onboarding-step-shell__header">
        <p className="eyebrow">Setting up {appName}</p>
        <p className="onboarding-step-shell__step-count">
          Step {currentStageIndex + 1} of {stages.length}
        </p>
      </header>

      <ol className="onboarding-progress" aria-label="App setup progress">
        {stages.map((stage, index) => {
          const status = index < currentStageIndex
            ? "complete"
            : index === currentStageIndex
              ? "current"
              : "future";

          return (
            <li
              key={stage}
              className={`onboarding-progress__stage onboarding-progress__stage--${status}`}
              aria-current={status === "current" ? "step" : undefined}
              aria-disabled={status === "future" ? true : undefined}
            >
              {stage}
            </li>
          );
        })}
      </ol>

      <div className="onboarding-step-shell__content">
        <h1 id="onboarding-step-title">{title}</h1>
        <p className="onboarding-step-shell__explanation">{explanation}</p>

        <div className="onboarding-step-shell__primary-action">{children}</div>

        <section className="onboarding-step-shell__next" aria-labelledby="onboarding-next-heading">
          <h2 id="onboarding-next-heading">What happens next?</h2>
          <p>{next}</p>
        </section>

        {details ? (
          <aside className="onboarding-step-shell__details" aria-label="More help">
            {details}
          </aside>
        ) : null}

        {supportReference ? (
          <details className="onboarding-step-shell__support">
            <summary>Technical details for support</summary>
            <p>
              If you need help, share this support reference: <code>{supportReference}</code>
            </p>
          </details>
        ) : null}
      </div>
    </section>
  );
}
