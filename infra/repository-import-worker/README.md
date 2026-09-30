# Repository import worker infrastructure

This deployment creates a dedicated Azure Container Apps Job and its least-privilege dependencies: ACR, Service Bus queue, two user-assigned identities, Key Vault, Log Analytics, and queue health alerts.

The portal identity receives Service Bus Data Sender only on the queue. The worker identity receives Data Receiver only on that queue and Secrets User only on this vault. A separate pull identity receives AcrPull only on this registry. The template intentionally contains no secret values.

Set `deploymentPrincipalId` to the object ID of the GitHub Actions OIDC service principal. The template grants that identity resource-group Reader for tag-based discovery, AcrPush on only this registry, and Container Apps Jobs Contributor on only this job. Leave the parameter empty when CI deployment is not configured.

Before deployment, an administrator must create an ignored parameter file from `main.bicepparam.example` and ensure the PostgreSQL network path accepts traffic from the optional Container Apps infrastructure subnet. Required secret names default to `repository-import-database-url` and `github-app-private-key`.

For a new environment, deploy in two phases. First set `deployJob = false` and deploy the supporting resources. A vault administrator then grants the operator narrowly scoped, temporary secret-write access, populates the two named secrets without printing their values, and removes that temporary access. Finally set `deployJob = true` and deploy again. Container Apps validates Key Vault references while creating the job, so a one-phase first deployment cannot succeed before those secrets exist. Subsequent idempotent deployments keep `deployJob = true`.

Validate without changing Azure:

```bash
az bicep build --file infra/repository-import-worker/main.bicep
az deployment group what-if \
  --resource-group rg-cu-app-portal \
  --template-file infra/repository-import-worker/main.bicep \
  --parameters infra/repository-import-worker/main.bicepparam
```

The real `main.bicepparam` is administrator-owned and ignored. Deploy only after reviewing the what-if output and confirming it contains only the documented worker resources and scoped role assignments.
