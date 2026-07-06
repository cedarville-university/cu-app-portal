export function isE2EAuthBypassEnabled() {
  return (
    process.env.E2E_AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}
