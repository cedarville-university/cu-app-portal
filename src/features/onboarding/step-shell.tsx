import React, { type ReactNode } from "react";

export const onboardingStages = [
  "Start",
  "Develop",
  "Prepare",
  "Publish",
] as const;

export type OnboardingStage = (typeof onboardingStages)[number];

export function OnboardingProgress({
  currentStage,
}: {
  currentStage: OnboardingStage;
}) {
  const currentStageIndex = onboardingStages.indexOf(currentStage);

  return (
    <ol className="onboarding-progress" aria-label="App setup progress">
      {onboardingStages.map((stage, index) => {
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
  );
}

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
  const currentStageIndex = onboardingStages.indexOf(currentStage);

  return (
    <section className="onboarding-step-shell" aria-labelledby="onboarding-step-title">
      <header className="onboarding-step-shell__header">
        <p className="eyebrow">Setting up {appName}</p>
        <p className="onboarding-step-shell__step-count">
          Step {currentStageIndex + 1} of {onboardingStages.length}
        </p>
      </header>

      <OnboardingProgress currentStage={currentStage} />

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
