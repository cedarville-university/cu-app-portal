-- Existing app modes are preserved; their GitHub workflows must not be relabeled.
ALTER TABLE "AppRequest" ALTER COLUMN "deploymentTriggerMode" SET DEFAULT 'PUSH_TO_DEPLOY';
