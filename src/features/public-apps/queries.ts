import { prisma } from "@/lib/db";

export type PublicAppListItem = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
};

function getSubmittedDescription(submittedConfig: unknown): string | null {
  if (
    !submittedConfig ||
    typeof submittedConfig !== "object" ||
    Array.isArray(submittedConfig)
  ) {
    return null;
  }

  const description = (submittedConfig as Record<string, unknown>).description;

  if (typeof description !== "string") {
    return null;
  }

  const trimmed = description.trim();

  return trimmed.length ? trimmed : null;
}

export async function listPublicApps(): Promise<PublicAppListItem[]> {
  const appRequests = await prisma.appRequest.findMany({
    where: { isPubliclyListed: true },
    orderBy: { appName: "asc" },
    select: {
      id: true,
      appName: true,
      submittedConfig: true,
      publishUrl: true,
      primaryPublishUrl: true,
    },
  });

  return appRequests.map((appRequest) => ({
    id: appRequest.id,
    name: appRequest.appName,
    description: getSubmittedDescription(appRequest.submittedConfig),
    url: appRequest.publishUrl ?? appRequest.primaryPublishUrl,
  }));
}
