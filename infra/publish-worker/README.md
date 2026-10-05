# Publishing worker infrastructure

Deploy `main.bicep` in the existing import worker hosting resource group using existing import-worker infrastructure. Copy `main.bicepparam.example` to the ignored `main.bicepparam`, replace placeholders, and populate its referenced Key Vault secrets before deployment. The image must already exist at the specified digest. Set `publishingResourceGroupName` to the managed-app target group; it defaults to `workerEnvironment.AZURE_PUBLISH_RESOURCE_GROUP` and may differ from the hosting group. This creates a dedicated worker identity, publishing queue, an event-triggered job, a recovery job scheduled every five minutes, and scoped role assignments.

Deployment also requires Microsoft Graph consent and shared app-registration ownership for the new managed identity. See [the publishing worker runbook](../../docs/portal/publishing-worker.md) for prerequisites, migration order, local development, administrative recovery, and live verification requirements.
