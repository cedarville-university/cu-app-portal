# Repository import worker infrastructure

This deployment creates a dedicated Azure Container Apps Job and its least-privilege dependencies: ACR, Service Bus queue, two user-assigned identities, Key Vault, Log Analytics, and queue health alerts.

The portal identity receives Service Bus Data Sender only on the queue. The worker identity receives Data Receiver only on that queue and Secrets User only on this vault. A separate pull identity receives AcrPull only on this registry. The template intentionally contains no secret values.

Before deployment, an administrator must create an ignored parameter file from `main.bicepparam.example`, populate the named Key Vault secrets after the vault exists, and ensure the PostgreSQL network path accepts traffic from the optional Container Apps infrastructure subnet. Required secret names default to `repository-import-database-url` and `github-app-private-key`.

Validate without changing Azure:

```bash
az bicep build --file infra/repository-import-worker/main.bicep
az deployment group what-if \
  --resource-group rg-cu-app-portal \
  --template-file infra/repository-import-worker/main.bicep \
  --parameters infra/repository-import-worker/main.bicepparam
```

The real `main.bicepparam` is administrator-owned and ignored. Deploy only after reviewing the what-if output and confirming it contains only the documented worker resources and scoped role assignments.
