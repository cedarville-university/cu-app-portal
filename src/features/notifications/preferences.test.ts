import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  canReceiveNotificationCategory,
  parseNotificationPreferenceForm,
} from "./preferences";

describe("notification preferences", () => {
  it("defaults every email category to on", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      emailNotificationsEnabled: true,
      collaborationEmailsEnabled: true,
      appLifecycleEmailsEnabled: true,
      publishingEmailsEnabled: true,
    });
  });

  it("allows category mail when no row exists", () => {
    expect(canReceiveNotificationCategory(null, "COLLABORATION")).toBe(true);
    expect(canReceiveNotificationCategory(null, "APP_LIFECYCLE")).toBe(true);
    expect(canReceiveNotificationCategory(null, "PUBLISHING")).toBe(true);
  });

  it("global opt-out blocks every normal category", () => {
    const preference = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      emailNotificationsEnabled: false,
    };

    expect(canReceiveNotificationCategory(preference, "COLLABORATION")).toBe(
      false,
    );
    expect(canReceiveNotificationCategory(preference, "APP_LIFECYCLE")).toBe(
      false,
    );
    expect(canReceiveNotificationCategory(preference, "PUBLISHING")).toBe(
      false,
    );
  });

  it("category opt-out blocks only that category", () => {
    const preference = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      publishingEmailsEnabled: false,
    };

    expect(canReceiveNotificationCategory(preference, "COLLABORATION")).toBe(
      true,
    );
    expect(canReceiveNotificationCategory(preference, "APP_LIFECYCLE")).toBe(
      true,
    );
    expect(canReceiveNotificationCategory(preference, "PUBLISHING")).toBe(
      false,
    );
  });

  it("parses checkbox form values into booleans", () => {
    const formData = new FormData();
    formData.set("emailNotificationsEnabled", "on");
    formData.set("collaborationEmailsEnabled", "on");
    formData.set("publishingEmailsEnabled", "on");

    expect(parseNotificationPreferenceForm(formData)).toEqual({
      emailNotificationsEnabled: true,
      collaborationEmailsEnabled: true,
      appLifecycleEmailsEnabled: false,
      publishingEmailsEnabled: true,
    });
  });
});
