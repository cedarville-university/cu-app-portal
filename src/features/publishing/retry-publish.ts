import {
  defaultQueuePublishDependencies,
  queuePublishAttemptForActor,
  type PublishActorInput,
  type QueuedPublishResult,
  type QueuePublishDependencies,
} from "./queue-publish";

export async function retryPublishForActor(
  input: PublishActorInput,
  dependencies: QueuePublishDependencies = defaultQueuePublishDependencies,
): Promise<QueuedPublishResult> {
  return queuePublishAttemptForActor(
    input,
    {
      allowedPublishStatuses: ["FAILED"],
      allowFailedSetupRetry: true,
    },
    dependencies,
  );
}
