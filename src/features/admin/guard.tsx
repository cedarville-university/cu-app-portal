import Link from "next/link";
import { redirect } from "next/navigation";
import React from "react";
import { isAdminUser } from "@/features/admin/roles";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";

export async function getAdminUserIdOrNull() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  return (await isAdminUser(userId)) ? userId : null;
}

export function AdminNotAuthorized() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Not Authorized</h1>
      <p className="empty-state__desc">
        You do not have permission to use the admin tools.
      </p>
      <Link href="/apps" className="btn btn--primary-solid">
        Go to My Apps
      </Link>
    </div>
  );
}
