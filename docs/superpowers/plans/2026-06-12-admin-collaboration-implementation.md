# Admin Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portal-managed admin roles and collaborator access so admins can manage users/apps while collaborators can actively work on shared apps.

**Architecture:** Keep `AppRequest.userId` as the single primary owner, add `UserRole` and `AppAccess` records, and route all app authorization through shared helpers. Admin-only pages/actions use an explicit admin guard, while existing owner-only app routes/actions are widened to owner, collaborator, or admin where the approved design allows it.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Auth.js, Vitest, React Testing Library

---

## Proposed File Structure

### Database

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260612120000_admin_collaboration/migration.sql`

### Authorization And Admin Domain

- Create: `src/features/admin/roles.ts`
- Create: `src/features/admin/roles.test.ts`
- Create: `src/features/app-requests/access.ts`
- Create: `src/features/app-requests/access.test.ts`
- Create: `src/features/admin/actions.ts`
- Create: `src/features/admin/actions.test.ts`

### Admin UI

- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/page.test.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/site-header.test.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/middleware.test.ts`

### Existing App Routes And Actions

- Modify: `src/auth/config.ts`
- Modify: `src/auth/config.test.ts`
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/api/download/[requestId]/route.ts`
- Modify: `src/app/api/download/download-route.test.ts`
- Modify: `src/features/repositories/actions.ts`
- Modify: `src/features/repositories/actions.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/setup/actions.ts`
- Modify: `src/features/publishing/setup/actions.test.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`
- Modify: `src/features/app-deletion/actions.ts`
- Modify: `src/features/app-deletion/actions.test.ts`
- Modify: `src/lib/audit.ts`

### Documentation

- Modify: `README.md`
- Modify: `docs/portal/setup.md`

## Task 1: Add Role And Collaborator Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260612120000_admin_collaboration/migration.sql`
- Test: `src/features/app-requests/access.test.ts`
- Create: `src/features/app-requests/access.ts`

- [ ] **Step 1: Write failing access tests for the intended data shape**

Create `src/features/app-requests/access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appAccessWhere,
  canDeleteApp,
  userHasAdminRole,
} from "./access";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: {
      findFirst: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

describe("app request access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a query predicate that allows owner, collaborator, or admin access", () => {
    expect(appAccessWhere("request-123", "user-123", false)).toEqual({
      id: "request-123",
      OR: [
        { userId: "user-123" },
        { collaborators: { some: { userId: "user-123" } } },
      ],
    });

    expect(appAccessWhere("request-123", "admin-123", true)).toEqual({
      id: "request-123",
    });
  });

  it("detects portal admins from UserRole records", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

    await expect(userHasAdminRole("user-123")).resolves.toBe(true);
  });

  it("allows app deletion only for owners or admins", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(canDeleteApp("owner-123", "request-123")).resolves.toBe(true);
    await expect(canDeleteApp("collaborator-123", "request-123")).resolves.toBe(
      false,
    );

    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

    await expect(canDeleteApp("admin-123", "request-123")).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/app-requests/access.test.ts`

Expected: FAIL because `src/features/app-requests/access.ts` does not exist and Prisma has no `userRole` relation in generated types yet.

- [ ] **Step 3: Add the Prisma schema models and migration**

Modify `prisma/schema.prisma`:

```prisma
model User {
  id              String        @id @default(cuid())
  entraOid        String        @unique
  email           String        @unique
  displayName     String
  githubUsername  String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  appRequests     AppRequest[]
  roles           UserRole[]
  appAccess       AppAccess[]
}

model AppRequest {
  id               String             @id @default(cuid())
  userId           String
  templateId       String
  templateVersion  String
  appName          String
  submittedConfig  Json
  generationStatus GenerationStatus
  supportReference String
  visibility       String?
  deploymentTarget String?
  deploymentTriggerMode DeploymentTriggerMode @default(PORTAL_DISPATCH)
  sourceOfTruth    SourceOfTruth      @default(PORTAL_MANAGED_REPO)
  repositoryProvider RepositoryProvider?
  repositoryOwner  String?
  repositoryName   String?
  repositoryUrl    String?
  repositoryDefaultBranch String?
  repositoryVisibility String?
  repositoryStatus RepositoryStatus   @default(PENDING)
  repositoryAccessStatus RepositoryAccessStatus @default(NOT_REQUESTED)
  repositoryAccessNote String?
  publishStatus    PublishStatus      @default(NOT_STARTED)
  publishUrl       String?
  publishErrorSummary String?
  publishingSetupStatus PublishingSetupStatus @default(NOT_CHECKED)
  publishingSetupCheckedAt DateTime?
  publishingSetupRepairedAt DateTime?
  publishingSetupErrorSummary String?
  lastPublishedAt  DateTime?
  azureResourceGroup    String?
  azureAppServicePlan   String?
  azureWebAppName       String?
  azurePostgresServer   String?
  azureDatabaseName     String?
  azureDefaultHostName  String?
  customDomain          String?
  primaryPublishUrl     String?
  publishedAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  user             User               @relation(fields: [userId], references: [id])
  template         Template           @relation(fields: [templateId], references: [id])
  artifact         GeneratedArtifact?
  publishAttempts  PublishAttempt[]
  repositoryImport RepositoryImport?
  publishSetupChecks PublishSetupCheck[]
  collaborators    AppAccess[]
}

model UserRole {
  id        String     @id @default(cuid())
  userId    String
  role      PortalRole
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, role])
  @@index([role])
}

model AppAccess {
  id           String     @id @default(cuid())
  appRequestId String
  userId       String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  appRequest   AppRequest @relation(fields: [appRequestId], references: [id], onDelete: Cascade)
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([appRequestId, userId])
  @@index([userId])
}

enum PortalRole {
  ADMIN
}
```

Create `prisma/migrations/20260612120000_admin_collaboration/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('ADMIN');

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PortalRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAccess" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "AppAccess_userId_idx" ON "AppAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppAccess_appRequestId_userId_key" ON "AppAccess"("appRequestId", "userId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAccess" ADD CONSTRAINT "AppAccess_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAccess" ADD CONSTRAINT "AppAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Generate Prisma client**

Run: `npx prisma generate`

Expected: Prisma client generated successfully.

- [ ] **Step 5: Add minimal access helper implementation**

Create `src/features/app-requests/access.ts`:

```ts
import { prisma } from "@/lib/db";

export function appAccessWhere(
  requestId: string,
  userId: string,
  isAdmin: boolean,
) {
  if (isAdmin) {
    return { id: requestId };
  }

  return {
    id: requestId,
    OR: [
      { userId },
      {
        collaborators: {
          some: { userId },
        },
      },
    ],
  };
}

export async function userHasAdminRole(userId: string) {
  const role = await prisma.userRole.findFirst({
    where: {
      userId,
      role: "ADMIN",
    },
  });

  return Boolean(role);
}

export async function canDeleteApp(userId: string, requestId: string) {
  if (await userHasAdminRole(userId)) {
    return true;
  }

  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  return Boolean(appRequest);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/features/app-requests/access.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260612120000_admin_collaboration/migration.sql src/features/app-requests/access.ts src/features/app-requests/access.test.ts
git commit -m "feat: add admin and collaborator data model"
```

## Task 2: Bootstrap And Guard Portal Admins

**Files:**
- Create: `src/features/admin/roles.ts`
- Create: `src/features/admin/roles.test.ts`
- Modify: `src/auth/config.ts`
- Modify: `src/auth/config.test.ts`

- [ ] **Step 1: Write failing admin role helper tests**

Create `src/features/admin/roles.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureInitialAdminRole,
  getInitialAdminEmails,
  requireAdminUserId,
} from "./roles";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: {
      count: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("admin roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("parses initial admin emails case-insensitively", () => {
    vi.stubEnv(
      "PORTAL_INITIAL_ADMIN_EMAILS",
      "Owner@Cedarville.edu, second@cedarville.edu ",
    );

    expect(getInitialAdminEmails()).toEqual([
      "owner@cedarville.edu",
      "second@cedarville.edu",
    ]);
  });

  it("bootstraps ADMIN for a configured email idempotently", async () => {
    vi.stubEnv("PORTAL_INITIAL_ADMIN_EMAILS", "owner@cedarville.edu");
    vi.mocked(prisma.userRole.upsert).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.upsert>>);

    await ensureInitialAdminRole({
      userId: "user-123",
      email: "Owner@Cedarville.edu",
    });

    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: {
        userId_role: {
          userId: "user-123",
          role: "ADMIN",
        },
      },
      update: {},
      create: {
        userId: "user-123",
        role: "ADMIN",
      },
    });
  });

  it("does not bootstrap ADMIN for unconfigured users", async () => {
    vi.stubEnv("PORTAL_INITIAL_ADMIN_EMAILS", "owner@cedarville.edu");

    await ensureInitialAdminRole({
      userId: "user-456",
      email: "staff@cedarville.edu",
    });

    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("requires the current user to be an admin", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("admin-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

    await expect(requireAdminUserId()).resolves.toBe("admin-123");
  });

  it("rejects non-admin users", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("staff-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);

    await expect(requireAdminUserId()).rejects.toThrow(
      "Administrator access is required.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/admin/roles.test.ts`

Expected: FAIL because `src/features/admin/roles.ts` does not exist.

- [ ] **Step 3: Implement admin role helpers**

Create `src/features/admin/roles.ts`:

```ts
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

export function getInitialAdminEmails() {
  return (process.env.PORTAL_INITIAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function ensureInitialAdminRole({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!getInitialAdminEmails().includes(normalizedEmail)) {
    return;
  }

  await prisma.userRole.upsert({
    where: {
      userId_role: {
        userId,
        role: "ADMIN",
      },
    },
    update: {},
    create: {
      userId,
      role: "ADMIN",
    },
  });
}

export async function isAdminUser(userId: string) {
  const role = await prisma.userRole.findFirst({
    where: {
      userId,
      role: "ADMIN",
    },
  });

  return Boolean(role);
}

export async function requireAdminUserId() {
  const userId = await resolveCurrentUserId();

  if (!(await isAdminUser(userId))) {
    throw new Error("Administrator access is required.");
  }

  return userId;
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npm test -- src/features/admin/roles.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing auth bootstrap test**

Modify `src/auth/config.test.ts` to mock `ensureInitialAdminRole`:

```ts
vi.mock("@/features/admin/roles", () => ({
  ensureInitialAdminRole: vi.fn(),
}));
```

Add this assertion to the sign-in sync test:

```ts
const { ensureInitialAdminRole } = await import("@/features/admin/roles");
expect(ensureInitialAdminRole).toHaveBeenCalledWith({
  userId: "user_123",
  email: "staff@cedarville.edu",
});
```

- [ ] **Step 6: Run the auth test to verify it fails**

Run: `npm test -- src/auth/config.test.ts`

Expected: FAIL because `authConfig` does not call `ensureInitialAdminRole`.

- [ ] **Step 7: Wire bootstrap into sign-in**

Modify `src/auth/config.ts` inside the successful `prisma.user.upsert` block:

```ts
const { ensureInitialAdminRole } = await import("@/features/admin/roles");

await ensureInitialAdminRole({
  userId: syncedUser.id,
  email: syncedUser.email,
});
```

Place this after `user.id = syncedUser.id;` and before `recordAuditEvent("SIGN_IN", ...)`.

- [ ] **Step 8: Run relevant tests**

Run: `npm test -- src/features/admin/roles.test.ts src/auth/config.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/admin/roles.ts src/features/admin/roles.test.ts src/auth/config.ts src/auth/config.test.ts
git commit -m "feat: bootstrap portal admin roles"
```

## Task 3: Centralize App Access Reads

**Files:**
- Modify: `src/features/app-requests/access.ts`
- Modify: `src/features/app-requests/access.test.ts`
- Modify: `src/app/api/download/[requestId]/route.ts`
- Modify: `src/app/api/download/download-route.test.ts`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`

- [ ] **Step 1: Extend access tests for loader behavior**

Add to `src/features/app-requests/access.test.ts`:

```ts
import {
  appListWhereForUser,
  loadAccessibleAppRequest,
} from "./access";

it("loads an app through owner, collaborator, or admin access", async () => {
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    userId: "owner-123",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

  await expect(loadAccessibleAppRequest("request-123", "user-123")).resolves.toEqual(
    expect.objectContaining({ id: "request-123" }),
  );
  expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
    where: {
      id: "request-123",
      OR: [
        { userId: "user-123" },
        { collaborators: { some: { userId: "user-123" } } },
      ],
    },
  });
});

it("builds a list predicate for apps visible to a user", async () => {
  expect(appListWhereForUser("user-123", false)).toEqual({
    OR: [
      { userId: "user-123" },
      { collaborators: { some: { userId: "user-123" } } },
    ],
  });
  expect(appListWhereForUser("admin-123", true)).toEqual({});
});
```

- [ ] **Step 2: Run access tests to verify failure**

Run: `npm test -- src/features/app-requests/access.test.ts`

Expected: FAIL because `loadAccessibleAppRequest` and `appListWhereForUser` do not exist.

- [ ] **Step 3: Implement the additional access helpers**

Modify `src/features/app-requests/access.ts`:

```ts
export function appListWhereForUser(userId: string, isAdmin: boolean) {
  if (isAdmin) {
    return {};
  }

  return {
    OR: [
      { userId },
      {
        collaborators: {
          some: { userId },
        },
      },
    ],
  };
}

export async function loadAccessibleAppRequest(
  requestId: string,
  userId: string,
) {
  const isAdmin = await userHasAdminRole(userId);

  return prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
  });
}
```

- [ ] **Step 4: Run access tests to verify pass**

Run: `npm test -- src/features/app-requests/access.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing download route tests for collaborator/admin access**

Modify `src/app/api/download/download-route.test.ts`:

```ts
it("returns the artifact for a collaborator", async () => {
  getServerSessionMock.mockResolvedValue({ user: { id: "collaborator-123" } });
  isMissingFileErrorMock.mockReturnValue(false);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "req_123",
    supportReference: "SUP-20260423-ABCD1234",
    submittedConfig: {
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    },
    artifact: {
      storagePath: "/tmp/.artifacts/campus-dashboard.zip",
      filename: "campus-dashboard.zip",
      contentType: "application/zip",
    },
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  loadArtifactMock.mockResolvedValue(Buffer.from("zip-data"));

  const response = await GET(new Request("http://localhost/api/download/req_123"), {
    params: Promise.resolve({ requestId: "req_123" }),
  });

  expect(response.status).toBe(200);
  expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { userId: "collaborator-123" },
          { collaborators: { some: { userId: "collaborator-123" } } },
        ]),
      }),
    }),
  );
});
```

- [ ] **Step 6: Run the route test to verify failure**

Run: `npm test -- src/app/api/download/download-route.test.ts`

Expected: FAIL because the route still queries `where: { id, userId }`.

- [ ] **Step 7: Update download route authorization**

Modify `src/app/api/download/[requestId]/route.ts`:

```ts
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
```

Replace the `findFirst` `where` block:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequest = await prisma.appRequest.findFirst({
  where: appAccessWhere(requestId, userId, isAdmin),
  select: {
    id: true,
    supportReference: true,
    submittedConfig: true,
    artifact: {
      select: {
        storagePath: true,
        filename: true,
        contentType: true,
      },
    },
  },
});
```

- [ ] **Step 8: Update My Apps list to show owned and collaborated apps**

Modify `src/app/apps/page.tsx`:

```ts
import { appListWhereForUser, userHasAdminRole } from "@/features/app-requests/access";
```

Use:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequests = await prisma.appRequest.findMany({
  where: appListWhereForUser(userId, isAdmin),
  orderBy: { createdAt: "desc" },
  include: {
    repositoryImport: true,
  },
});
```

- [ ] **Step 9: Update app details page to use accessible app lookup**

Modify `src/app/download/[requestId]/page.tsx`:

```ts
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
```

Replace the `findFirst` `where` block:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequest = await prisma.appRequest.findFirst({
  where: appAccessWhere(requestId, userId, isAdmin),
  include: {
    artifact: true,
    publishAttempts: {
      orderBy: { createdAt: "desc" },
      take: 1,
    },
    repositoryImport: true,
    publishSetupChecks: {
      orderBy: { checkedAt: "desc" },
      take: 7,
    },
  },
});
```

- [ ] **Step 10: Adjust existing page/list mocks**

In tests that mock `@/lib/db`, add:

```ts
userRole: {
  findFirst: vi.fn(),
},
```

Set default non-admin behavior in `beforeEach`:

```ts
vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
```

- [ ] **Step 11: Run relevant tests**

Run: `npm test -- src/features/app-requests/access.test.ts src/app/api/download/download-route.test.ts src/app/apps/page.test.tsx src/app/download/[requestId]/page.test.tsx`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/features/app-requests/access.ts src/features/app-requests/access.test.ts src/app/api/download/[requestId]/route.ts src/app/api/download/download-route.test.ts src/app/apps/page.tsx src/app/apps/page.test.tsx src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx
git commit -m "feat: allow collaborators to access app views"
```

## Task 4: Widen Operational Actions And Protect Deletion

**Files:**
- Modify: `src/features/repositories/actions.ts`
- Modify: `src/features/repositories/actions.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/setup/actions.ts`
- Modify: `src/features/publishing/setup/actions.test.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`
- Modify: `src/features/app-deletion/actions.ts`
- Modify: `src/features/app-deletion/actions.test.ts`
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Write failing repository action test for collaborator GitHub access**

Modify `src/features/repositories/actions.test.ts`:

```ts
it("updates the acting collaborator's GitHub username when granting repository access", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("collaborator-123");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    userId: "owner-123",
    appName: "Campus Dashboard",
    supportReference: "CU-123",
    repositoryStatus: "READY",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "collaborator-123",
    githubUsername: null,
  } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

  const formData = new FormData();
  formData.set("githubUsername", "collabdev");

  await saveGitHubUsernameAndGrantAccessAction("request-123", formData);

  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: "collaborator-123" },
    data: { githubUsername: "collabdev" },
  });
});
```

Add `userRole.findFirst` to the Prisma mock:

```ts
userRole: {
  findFirst: vi.fn(),
},
```

- [ ] **Step 2: Run repository action test to verify failure**

Run: `npm test -- src/features/repositories/actions.test.ts`

Expected: FAIL because action updates `appRequest.userId`, not the acting collaborator.

- [ ] **Step 3: Update repository action authorization and acting user writes**

Modify `src/features/repositories/actions.ts`:

```ts
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
```

Replace owner-only `loadOwnedAppRequest` with:

```ts
async function loadAccessibleAppRequestForAction(requestId: string) {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return { appRequest, actorUserId: userId };
}
```

In `saveGitHubUsernameAndGrantAccessAction`, destructure:

```ts
const { appRequest, actorUserId } =
  await loadAccessibleAppRequestForAction(requestId);
```

Update the user write:

```ts
await prisma.user.update({
  where: { id: actorUserId },
  data: { githubUsername },
});
```

Keep repository access grants against `appRequest.repositoryOwner` and `appRequest.repositoryName`.

- [ ] **Step 4: Apply the same accessible-action pattern to publishing actions**

Modify `src/features/publishing/actions.ts` owner loader to use `appAccessWhere` and `userHasAdminRole`:

```ts
async function loadAccessibleAppRequestForAction(requestId: string) {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: {
      repositoryImport: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}
```

In the transaction update inside `queuePublishAttempt`, replace `userId: appRequest.userId` with only `id: requestId` plus status predicates. Access has already been checked before the transaction.

- [ ] **Step 5: Apply the same accessible-action pattern to publishing setup actions**

Modify `src/features/publishing/setup/actions.ts`:

```ts
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
```

Replace the owner-only `findFirst` with:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequest = await prisma.appRequest.findFirst({
  where: appAccessWhere(requestId, userId, isAdmin),
});
```

- [ ] **Step 6: Apply the same accessible-action pattern to repository import actions**

Modify `src/features/repository-imports/actions.ts` by importing the shared helpers:

```ts
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
```

In `prepareExistingAppAction`, replace:

```ts
const appRequest = await prisma.appRequest.findFirst({
  where: { id: requestId, userId },
  include: { repositoryImport: true },
});
```

with:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequest = await prisma.appRequest.findFirst({
  where: appAccessWhere(requestId, userId, isAdmin),
  include: { repositoryImport: true },
});
```

In `verifyExistingAppPreparationAction`, replace:

```ts
const appRequest = await prisma.appRequest.findFirst({
  where: { id: requestId, userId },
  include: { repositoryImport: true },
});
```

with:

```ts
const isAdmin = await userHasAdminRole(userId);
const appRequest = await prisma.appRequest.findFirst({
  where: appAccessWhere(requestId, userId, isAdmin),
  include: { repositoryImport: true },
});
```

Do not change `addExistingAppAction` or `createManagedRepositoryForLocalAppAction`; those actions create new app records for the acting user and should remain creator-owned.

- [ ] **Step 7: Write failing deletion test that collaborators cannot delete and admins can**

Modify `src/features/app-deletion/actions.test.ts`:

```ts
it("blocks collaborators from deleting app resources", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("collaborator-123");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

  await expect(
    deleteAppAction("request-123", deletionForm(["portal"])),
  ).rejects.toThrow("App request not found.");

  expect(deleteArtifact).not.toHaveBeenCalled();
});

it("allows admins to delete app resources they do not own", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("admin-123");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
    id: "role-123",
    userId: "admin-123",
    role: "ADMIN",
    createdAt: new Date("2026-06-12T12:00:00Z"),
    updatedAt: new Date("2026-06-12T12:00:00Z"),
  } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
    ownedRequest as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>,
  );

  await deleteAppAction("request-123", deletionForm(["portal"]));

  expect(deleteArtifact).toHaveBeenCalledWith(
    "/workspace/.artifacts/campus-dashboard.zip",
  );
});
```

Add `userRole.findFirst` to the test Prisma mock:

```ts
userRole: {
  findFirst: vi.fn(),
},
```

- [ ] **Step 8: Run deletion tests to verify failure**

Run: `npm test -- src/features/app-deletion/actions.test.ts`

Expected: FAIL because deletion still checks owner only and has no admin branch.

- [ ] **Step 9: Update deletion action authorization**

Modify `src/features/app-deletion/actions.ts`:

```ts
import { canDeleteApp, userHasAdminRole } from "@/features/app-requests/access";
```

Replace `loadOwnedAppRequest` with:

```ts
async function loadDeletableAppRequest(requestId: string) {
  const userId = await resolveCurrentUserId();

  if (!(await canDeleteApp(userId, requestId))) {
    throw new Error("App request not found.");
  }

  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: isAdmin ? { id: requestId } : { id: requestId, userId },
    include: {
      artifact: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return { appRequest, actorUserId: userId, actorIsAdmin: isAdmin };
}
```

In `deleteAppAction`, use:

```ts
const { appRequest, actorUserId, actorIsAdmin } =
  await loadDeletableAppRequest(requestId);
```

Add audit details:

```ts
actorUserId,
adminInitiated: actorIsAdmin && appRequest.userId !== actorUserId,
```

- [ ] **Step 10: Add audit event names**

Modify `src/lib/audit.ts` union to include:

```ts
| "ADMIN_ROLE_GRANTED"
| "ADMIN_ROLE_REMOVED"
| "APP_COLLABORATOR_ADDED"
| "APP_COLLABORATOR_REMOVED"
| "APP_OWNER_REASSIGNED"
| "ADMIN_APP_DELETION_REQUESTED"
| "ADMIN_APP_DELETION_SUCCEEDED"
| "ADMIN_APP_DELETION_FAILED"
```

- [ ] **Step 11: Run action tests**

Run: `npm test -- src/features/repositories/actions.test.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.test.ts src/features/repository-imports/actions.test.ts src/features/app-deletion/actions.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/features/repositories/actions.ts src/features/repositories/actions.test.ts src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.ts src/features/publishing/setup/actions.test.ts src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/features/app-deletion/actions.ts src/features/app-deletion/actions.test.ts src/lib/audit.ts
git commit -m "feat: authorize collaborator app operations"
```

## Task 5: Add Admin Server Actions

**Files:**
- Create: `src/features/admin/actions.ts`
- Create: `src/features/admin/actions.test.ts`

- [ ] **Step 1: Write failing admin action tests**

Create `src/features/admin/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminUserId } from "./roles";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  addAppCollaboratorAction,
  grantAdminRoleAction,
  reassignAppOwnerAction,
  removeAdminRoleAction,
  removeAppCollaboratorAction,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("./roles", () => ({
  requireAdminUserId: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    appRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appAccess: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminUserId).mockResolvedValue("admin-123");
    vi.mocked(recordAuditEvent).mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      if (typeof callback !== "function") {
        throw new Error("Unexpected batch transaction.");
      }
      return callback(prisma);
    });
  });

  it("grants the admin role to a user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-123",
      email: "staff@cedarville.edu",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await grantAdminRoleAction("user-123");

    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_role: { userId: "user-123", role: "ADMIN" } },
      update: {},
      create: { userId: "user-123", role: "ADMIN" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "ADMIN_ROLE_GRANTED",
      expect.objectContaining({
        actorUserId: "admin-123",
        targetUserId: "user-123",
      }),
    );
  });

  it("blocks removing the last admin", async () => {
    vi.mocked(prisma.userRole.count).mockResolvedValue(1);

    await expect(removeAdminRoleAction("admin-123")).rejects.toThrow(
      "At least one admin must remain.",
    );
  });

  it("adds and removes app collaborators idempotently", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "collab-123",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
      supportReference: "CU-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);

    await addAppCollaboratorAction("request-123", "collab-123");

    expect(prisma.appAccess.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_userId: {
          appRequestId: "request-123",
          userId: "collab-123",
        },
      },
      update: {},
      create: {
        appRequestId: "request-123",
        userId: "collab-123",
      },
    });

    await removeAppCollaboratorAction("request-123", "collab-123");

    expect(prisma.appAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        appRequestId: "request-123",
        userId: "collab-123",
      },
    });
  });

  it("reassigns owner and keeps the old owner as collaborator", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "new-owner-123",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      userId: "old-owner-123",
      supportReference: "CU-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);

    await reassignAppOwnerAction("request-123", "new-owner-123");

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: { userId: "new-owner-123" },
    });
    expect(prisma.appAccess.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_userId: {
          appRequestId: "request-123",
          userId: "old-owner-123",
        },
      },
      update: {},
      create: {
        appRequestId: "request-123",
        userId: "old-owner-123",
      },
    });
  });
});
```

- [ ] **Step 2: Run admin action tests to verify failure**

Run: `npm test -- src/features/admin/actions.test.ts`

Expected: FAIL because `src/features/admin/actions.ts` does not exist.

- [ ] **Step 3: Implement admin actions**

Create `src/features/admin/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireAdminUserId } from "./roles";

async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
}

async function ensureAppExists(appRequestId: string) {
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

function revalidateAdminViews(appRequestId?: string) {
  revalidatePath("/admin");
  revalidatePath("/apps");

  if (appRequestId) {
    revalidatePath(`/download/${appRequestId}`);
  }
}

export async function grantAdminRoleAction(userId: string) {
  const actorUserId = await requireAdminUserId();
  await ensureUserExists(userId);

  await prisma.userRole.upsert({
    where: {
      userId_role: {
        userId,
        role: "ADMIN",
      },
    },
    update: {},
    create: {
      userId,
      role: "ADMIN",
    },
  });

  await recordAuditEvent("ADMIN_ROLE_GRANTED", {
    actorUserId,
    targetUserId: userId,
  });

  revalidateAdminViews();
}

export async function removeAdminRoleAction(userId: string) {
  const actorUserId = await requireAdminUserId();
  const adminCount = await prisma.userRole.count({
    where: { role: "ADMIN" },
  });

  if (adminCount <= 1) {
    throw new Error("At least one admin must remain.");
  }

  await prisma.userRole.deleteMany({
    where: {
      userId,
      role: "ADMIN",
    },
  });

  await recordAuditEvent("ADMIN_ROLE_REMOVED", {
    actorUserId,
    targetUserId: userId,
  });

  revalidateAdminViews();
}

export async function addAppCollaboratorAction(
  appRequestId: string,
  userId: string,
) {
  const actorUserId = await requireAdminUserId();
  await ensureUserExists(userId);
  const appRequest = await ensureAppExists(appRequestId);

  if (appRequest.userId !== userId) {
    await prisma.appAccess.upsert({
      where: {
        appRequestId_userId: {
          appRequestId,
          userId,
        },
      },
      update: {},
      create: {
        appRequestId,
        userId,
      },
    });
  }

  await recordAuditEvent("APP_COLLABORATOR_ADDED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    targetUserId: userId,
  });

  revalidateAdminViews(appRequestId);
}

export async function removeAppCollaboratorAction(
  appRequestId: string,
  userId: string,
) {
  const actorUserId = await requireAdminUserId();
  const appRequest = await ensureAppExists(appRequestId);

  await prisma.appAccess.deleteMany({
    where: {
      appRequestId,
      userId,
    },
  });

  await recordAuditEvent("APP_COLLABORATOR_REMOVED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    targetUserId: userId,
  });

  revalidateAdminViews(appRequestId);
}

export async function reassignAppOwnerAction(
  appRequestId: string,
  newOwnerUserId: string,
) {
  const actorUserId = await requireAdminUserId();
  await ensureUserExists(newOwnerUserId);
  const appRequest = await ensureAppExists(appRequestId);
  const oldOwnerUserId = appRequest.userId;

  await prisma.$transaction(async (tx) => {
    await tx.appRequest.update({
      where: { id: appRequestId },
      data: { userId: newOwnerUserId },
    });

    if (oldOwnerUserId !== newOwnerUserId) {
      await tx.appAccess.upsert({
        where: {
          appRequestId_userId: {
            appRequestId,
            userId: oldOwnerUserId,
          },
        },
        update: {},
        create: {
          appRequestId,
          userId: oldOwnerUserId,
        },
      });
    }

    await tx.appAccess.deleteMany({
      where: {
        appRequestId,
        userId: newOwnerUserId,
      },
    });
  });

  await recordAuditEvent("APP_OWNER_REASSIGNED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    oldOwnerUserId,
    newOwnerUserId,
  });

  revalidateAdminViews(appRequestId);
}
```

- [ ] **Step 4: Run admin action tests**

Run: `npm test -- src/features/admin/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions.ts src/features/admin/actions.test.ts
git commit -m "feat: add admin management actions"
```

## Task 6: Build Admin Page And Header Link

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/page.test.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/site-header.test.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/middleware.test.ts`

- [ ] **Step 1: Write failing admin page tests**

Create `src/app/admin/page.test.tsx`:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";
import { requireAdminUserId } from "@/features/admin/roles";
import { prisma } from "@/lib/db";

vi.mock("@/features/admin/roles", () => ({
  requireAdminUserId: vi.fn(),
}));

vi.mock("@/features/admin/actions", () => ({
  addAppCollaboratorAction: vi.fn(),
  grantAdminRoleAction: vi.fn(),
  reassignAppOwnerAction: vi.fn(),
  removeAdminRoleAction: vi.fn(),
  removeAppCollaboratorAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    appRequest: {
      findMany: vi.fn(),
    },
  },
}));

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminUserId).mockResolvedValue("admin-123");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders users and apps for admins", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "owner-123",
        displayName: "Owner User",
        email: "owner@cedarville.edu",
        githubUsername: "ownerhub",
        roles: [],
        appRequests: [{ id: "request-123" }],
        appAccess: [],
      },
      {
        id: "admin-123",
        displayName: "Admin User",
        email: "admin@cedarville.edu",
        githubUsername: null,
        roles: [{ role: "ADMIN" }],
        appRequests: [],
        appAccess: [{ id: "access-123" }],
      },
    ] as Awaited<ReturnType<typeof prisma.user.findMany>>);

    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "request-123",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        publishStatus: "SUCCEEDED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: "https://campus-dashboard.azurewebsites.net",
        createdAt: new Date("2026-06-12T12:00:00Z"),
        user: {
          id: "owner-123",
          displayName: "Owner User",
          email: "owner@cedarville.edu",
        },
        collaborators: [
          {
            user: {
              id: "admin-123",
              displayName: "Admin User",
              email: "admin@cedarville.edu",
            },
          },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await AdminPage());

    expect(
      screen.getByRole("heading", { name: /admin/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Owner User")).toBeInTheDocument();
    expect(screen.getByText("owner@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByText("Campus Dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Admin User/)).toBeInTheDocument();

    const appsRegion = screen.getByRole("region", { name: /apps/i });
    expect(
      within(appsRegion).getByRole("link", { name: /app details/i }),
    ).toHaveAttribute("href", "/download/request-123");
  });
});
```

- [ ] **Step 2: Run admin page test to verify failure**

Run: `npm test -- src/app/admin/page.test.tsx`

Expected: FAIL because `src/app/admin/page.tsx` does not exist.

- [ ] **Step 3: Implement the admin page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { deleteAppAction } from "@/features/app-deletion/actions";
import { ConfirmDeleteForm } from "@/features/app-deletion/confirm-delete-form";
import {
  addAppCollaboratorAction,
  grantAdminRoleAction,
  reassignAppOwnerAction,
  removeAdminRoleAction,
  removeAppCollaboratorAction,
} from "@/features/admin/actions";
import { requireAdminUserId } from "@/features/admin/roles";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function AdminPage() {
  await requireAdminUserId();

  const [users, appRequests] = await Promise.all([
    prisma.user.findMany({
      orderBy: { displayName: "asc" },
      include: {
        roles: true,
        appRequests: { select: { id: true } },
        appAccess: { select: { id: true } },
      },
    }),
    prisma.appRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Admin</span>
      </nav>

      <div className="page-header">
        <h1>Admin</h1>
        <p>Manage portal users, app ownership, collaborators, and app resources.</p>
      </div>

      <section aria-label="Users" className="card">
        <p className="section-title">Users</p>
        <div className="status-table">
          {users.map((user) => {
            const isAdmin = user.roles.some((role) => role.role === "ADMIN");
            const roleAction = isAdmin
              ? removeAdminRoleAction.bind(null, user.id)
              : grantAdminRoleAction.bind(null, user.id);

            return (
              <div className="status-row" key={user.id}>
                <span>
                  <strong>{user.displayName}</strong>
                  <br />
                  <span className="text-muted">{user.email}</span>
                  {user.githubUsername ? (
                    <>
                      <br />
                      <span className="text-muted">@{user.githubUsername}</span>
                    </>
                  ) : null}
                </span>
                <span>
                  {isAdmin ? "Admin" : "User"} · Owns {user.appRequests.length} ·
                  Collaborates on {user.appAccess.length}
                </span>
                <form action={roleAction}>
                  <PendingSubmitButton
                    idleLabel={isAdmin ? "Remove Admin" : "Make Admin"}
                    pendingLabel="Saving..."
                    statusText="Updating portal role."
                    variant={isAdmin ? "ghost" : "primary-solid"}
                    size="sm"
                  />
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Apps" className="card">
        <p className="section-title">Apps</p>
        <div className="status-table">
          {appRequests.map((request) => {
            const deleteAction = deleteAppAction.bind(null, request.id);
            const displayPublishUrl =
              request.publishUrl ?? request.primaryPublishUrl;

            return (
              <div className="status-row" key={request.id}>
                <div>
                  <strong>{request.appName}</strong>
                  <br />
                  <span className="text-muted">
                    Owner: {request.user.displayName} ({request.user.email})
                  </span>
                  <br />
                  <span className="text-muted">
                    Collaborators:{" "}
                    {request.collaborators.length
                      ? request.collaborators
                          .map((access) => access.user.displayName)
                          .join(", ")
                      : "None"}
                  </span>
                  <br />
                  <span className="text-muted">
                    Created {request.createdAt.toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span>Generated: {formatStatus(request.generationStatus)}</span>
                  <br />
                  <span>Repository: {formatStatus(request.repositoryStatus)}</span>
                  <br />
                  <span>Published: {formatStatus(request.publishStatus)}</span>
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <Link href={`/download/${request.id}`} className="btn btn--ghost btn--sm">
                    App Details
                  </Link>
                  {request.repositoryUrl ? (
                    <a
                      href={request.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--ghost btn--sm"
                    >
                      Repository
                    </a>
                  ) : null}
                  {displayPublishUrl ? (
                    <a
                      href={displayPublishUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--ghost btn--sm"
                    >
                      Published App
                    </a>
                  ) : null}
                </div>
                <form action={addAppCollaboratorAction.bind(null, request.id)}>
                  <label>
                    <span className="visually-hidden">Add collaborator</span>
                    <select name="userId" defaultValue="">
                      <option value="" disabled>
                        Add collaborator
                      </option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PendingSubmitButton
                    idleLabel="Add"
                    pendingLabel="Adding..."
                    statusText="Adding collaborator."
                    variant="ghost"
                    size="sm"
                  />
                </form>
                <form action={reassignAppOwnerAction.bind(null, request.id)}>
                  <label>
                    <span className="visually-hidden">New owner</span>
                    <select name="userId" defaultValue="">
                      <option value="" disabled>
                        Reassign owner
                      </option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PendingSubmitButton
                    idleLabel="Reassign"
                    pendingLabel="Reassigning..."
                    statusText="Reassigning app owner."
                    variant="ghost"
                    size="sm"
                  />
                </form>
                {request.collaborators.map((access) => (
                  <form
                    action={removeAppCollaboratorAction.bind(
                      null,
                      request.id,
                      access.user.id,
                    )}
                    key={access.user.id}
                  >
                    <PendingSubmitButton
                      idleLabel={`Remove ${access.user.displayName}`}
                      pendingLabel="Removing..."
                      statusText="Removing collaborator."
                      variant="ghost"
                      size="sm"
                    />
                  </form>
                ))}
                <details className="delete-panel">
                  <summary>Delete App</summary>
                  <ConfirmDeleteForm action={deleteAction} className="form-stack">
                    <fieldset>
                      <legend>Resources to delete</legend>
                      <label>
                        <input name="deletePortal" type="checkbox" />
                        Remove portal record
                      </label>
                      <label>
                        <input name="deleteGithub" type="checkbox" />
                        Delete GitHub repository
                      </label>
                      <label>
                        <input name="deleteAzure" type="checkbox" />
                        Delete Azure deployment
                      </label>
                    </fieldset>
                    <label>
                      <input name="confirmDelete" type="checkbox" required />
                      I understand that checked items will be permanently deleted.
                    </label>
                    <PendingSubmitButton
                      idleLabel="Delete Selected Resources"
                      pendingLabel="Deleting..."
                      statusText="Deleting selected resources."
                      variant="danger"
                      size="sm"
                    />
                  </ConfirmDeleteForm>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Adapt admin actions to form `FormData` for page forms**

Modify `src/features/admin/actions.ts` so app actions accept either direct `userId` or form data:

```ts
function parseUserId(input: string | FormData) {
  if (typeof input === "string") {
    return input;
  }

  const value = input.get("userId");

  if (typeof value !== "string" || !value) {
    throw new Error("Choose a user.");
  }

  return value;
}
```

Then start each app action with:

```ts
const userId = parseUserId(userIdOrFormData);
```

Use function signatures:

```ts
export async function addAppCollaboratorAction(
  appRequestId: string,
  userIdOrFormData: string | FormData,
)
```

and

```ts
export async function reassignAppOwnerAction(
  appRequestId: string,
  newOwnerUserIdOrFormData: string | FormData,
)
```

- [ ] **Step 5: Run admin page tests**

Run: `npm test -- src/app/admin/page.test.tsx src/features/admin/actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing header link test**

Modify `src/components/site-header.test.tsx`:

```tsx
it("shows the admin link only to admins", async () => {
  getServerSessionMock.mockResolvedValue({
    user: { id: "admin-123", name: "Admin User", email: "admin@cedarville.edu" },
  });
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
    id: "role-123",
    userId: "admin-123",
    role: "ADMIN",
    createdAt: new Date("2026-06-12T12:00:00Z"),
    updatedAt: new Date("2026-06-12T12:00:00Z"),
  } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

  render(await SiteHeader());

  expect(screen.getByRole("link", { name: /admin/i })).toHaveAttribute(
    "href",
    "/admin",
  );
});
```

Add `prisma.userRole.findFirst` mock setup to that test file.

- [ ] **Step 7: Run header test to verify failure**

Run: `npm test -- src/components/site-header.test.tsx`

Expected: FAIL because the header does not render the admin link.

- [ ] **Step 8: Add conditional admin link**

Modify `src/components/site-header.tsx`:

```ts
import { userHasAdminRole } from "@/features/app-requests/access";
```

Inside `SiteHeader`:

```ts
const userId = session?.user?.id;
const isAdmin = typeof userId === "string" ? await userHasAdminRole(userId) : false;
```

Inside the nav:

```tsx
{isAdmin ? <Link href="/admin">Admin</Link> : null}
```

- [ ] **Step 9: Protect `/admin` in middleware matcher**

Modify `src/middleware.ts`:

```ts
export const config = {
  matcher: ["/create/:path*", "/download/:path*", "/apps/:path*", "/admin/:path*"],
};
```

Update `src/middleware.test.ts` to expect `/admin/:path*` in the matcher.

- [ ] **Step 10: Run UI and middleware tests**

Run: `npm test -- src/app/admin/page.test.tsx src/components/site-header.test.tsx src/middleware.test.ts`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx src/components/site-header.tsx src/components/site-header.test.tsx src/middleware.ts src/middleware.test.ts src/features/admin/actions.ts src/features/admin/actions.test.ts
git commit -m "feat: add admin management page"
```

## Task 7: Update Documentation And Verify

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`

- [ ] **Step 1: Run current docs tests before editing**

Run: `npm test -- docs/readme.test.ts docs/secret-hygiene.test.ts`

Expected: PASS. If this fails, stop and inspect the failure before editing docs so unrelated doc-test issues are not mixed into the feature work.

- [ ] **Step 2: Update README feature description**

Modify `README.md` to mention:

```md
Admins can manage portal users, grant portal admin access, see all apps, reassign app owners, add collaborators, and delete scoped app resources. Apps keep one primary owner, while collaborators can download app artifacts, request GitHub access, and publish app changes.
```

Add this near the current product capability list.

- [ ] **Step 3: Update setup docs for initial admin bootstrap**

Modify `docs/portal/setup.md` environment variables section:

```md
To bootstrap the first portal admin, set:

- `PORTAL_INITIAL_ADMIN_EMAILS`

Use a comma-separated list of Cedarville email addresses. On sign-in, matching users receive the portal-managed `ADMIN` role. After the first admin exists, use `/admin` to add or remove admin access for other portal users.
```

Add a short permissions note:

```md
Admin and collaboration model:

- Each app has one primary owner.
- Admins can see all users and apps, manage admin roles, reassign owners, manage collaborators, and delete scoped app resources.
- Collaborators can view app details, download artifacts, request GitHub repository access for themselves, repair publishing setup, and publish app changes.
- Collaborators cannot delete app resources or reassign ownership.
```

- [ ] **Step 4: Run docs tests**

Run: `npm test -- docs/readme.test.ts docs/secret-hygiene.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full unit suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Check git status**

Run: `git status --short`

Expected: only intentional doc changes before commit, then clean after commit.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/portal/setup.md
git commit -m "docs: document admin collaboration model"
```

## Task 8: Final Integration Review

**Files:**
- Review all changed files from Tasks 1-7.

- [ ] **Step 1: Inspect commit history**

Run: `git log --oneline --decorate -8`

Expected: commits for schema, bootstrap, access views, operations, admin actions/page, and docs are present on `codex/admin-collaboration`.

- [ ] **Step 2: Inspect cumulative diff**

Run: `git diff main...HEAD --stat`

Expected: changes are limited to Prisma schema/migration, admin/access features, guarded route/action updates, tests, and docs.

- [ ] **Step 3: Re-run final verification**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manual review checklist**

Confirm:

- `/admin` is protected by `requireAdminUserId`.
- Admin server actions call `requireAdminUserId`.
- App detail and download routes use centralized owner/collaborator/admin access.
- Collaborator actions update the acting collaborator user where user-specific data is saved.
- Deletion remains unavailable to collaborators.
- Last-admin removal is blocked.
- Old owner remains collaborator after reassignment.
- Quiet download `404` remains for unrelated users.

- [ ] **Step 5: Prepare completion summary**

Summarize:

```md
Implemented admin roles, initial admin bootstrap, collaborator app access, admin management UI, app access authorization updates, and docs.

Verification:
- npm test
- npm run build
```
