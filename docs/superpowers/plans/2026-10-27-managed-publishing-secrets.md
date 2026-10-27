# Managed publishing secrets implementation plan

**Goal:** Keep portal-managed database and authentication credentials in each app's Key Vault and put only references in App Service settings.

**Architecture:** Reuse the existing Key Vault client, secret naming, reference format, system identity and RBAC model. A shared helper provisions the vault, grants runtime access, and stores managed secrets before returning references. Publishing and repair both call it; setup checks flag legacy raw settings. Keep feature selection, public identifiers, custom settings, and actor authorization behavior.

**Scope:** Local source and verification. Existing Azure apps migrate when repaired or republished after rollout; this change does not itself deploy or mutate live resources.

- [x] Add failing integration regressions for publishing with managed secrets but no custom secrets, legacy repair, setup validation, disabled features, and secret-store failures.
- [x] Implement shared secret provisioning and wire vault client dependencies into publishing and repair. Persist vault metadata and reject raw/misdirected managed settings in preflight without returning secret values.
- [x] Update existing expectations to reference semantics and verify custom secrets, no-feature apps, auth callbacks, custom domains, credential encoding, and per-mutation authorization remain supported.
- [x] Document migration and runtime permissions in README and portal operations/setup docs.
- [x] Run focused tests, type/build checks and the test suite. Review the complete candidate for surviving plaintext writes and regressions.

Verification: `npm test` passed (175 files, 1,484 tests); `npm run build` passed; `npm run build:publish-worker` passed; the local Bicep compiler built `publishing-permissions.bicep`; `git diff --check` passed. Independent security-boundary review reported no actionable bypasses or regressions. The standalone `tsc --noEmit` command remains red on existing test-fixture typing issues: the unchanged HEAD baseline had 286 diagnostics, the candidate had 260 after tightening the runtime test fixture, and neither had production-source diagnostics. Live Azure permissions and reference resolution were not exercised. At local verification, no commit, push, deployment, or live migration had been performed.

Azure permission rollout (2026-10-27): verified the existing worker identity `cu-launch-publish-worker` and target `rg-cu-apps-published`. The portal already had Key Vault Secrets Officer. Applied only the new worker Key Vault Secrets Officer resource from the Bicep in incremental deployment `publish-worker-keyvault-permission-20261027` (subscription `33e13fd4-7e2f-4be5-a1ec-c4ae6e1c1ecc`); Azure reported Succeeded and the assignment was read back. The full permissions template cannot be redeployed by the current delegated Owner account because its existing RBAC Administrator resource is excluded by the account's assignment condition. The focused deployment left both existing worker roles intact. App code deployment, existing-app repair, and live reference resolution remain separate rollout steps.
