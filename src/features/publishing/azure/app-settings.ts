type AppServiceRuntimeDescriptor = {
  framework?: string;
};

const DEPLOYMENT_SETTING_NAMES = [
  "SCM_DO_BUILD_DURING_DEPLOYMENT",
  "ENABLE_ORYX_BUILD",
  "WEBSITE_RUN_FROM_PACKAGE",
] as const;

export function appServiceDeploymentSettings(
  runtime: AppServiceRuntimeDescriptor,
): Record<string, string> {
  if (runtime.framework === "fastapi") {
    return {
      SCM_DO_BUILD_DURING_DEPLOYMENT: "true",
      ENABLE_ORYX_BUILD: "true",
    };
  }

  return {
    SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
    ENABLE_ORYX_BUILD: "false",
    WEBSITE_RUN_FROM_PACKAGE: "1",
  };
}

export function forbiddenAppServiceDeploymentSettingNames(
  runtime: AppServiceRuntimeDescriptor,
): string[] {
  return runtime.framework === "fastapi" ? ["WEBSITE_RUN_FROM_PACKAGE"] : [];
}

export function applyAppServiceDeploymentSettings(
  existingSettings: Record<string, string>,
  runtime: AppServiceRuntimeDescriptor,
) {
  const settings = { ...existingSettings };

  for (const settingName of DEPLOYMENT_SETTING_NAMES) {
    delete settings[settingName];
  }

  return {
    ...settings,
    ...appServiceDeploymentSettings(runtime),
  };
}
