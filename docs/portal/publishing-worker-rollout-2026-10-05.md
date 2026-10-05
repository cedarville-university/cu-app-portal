# Publishing worker rollout: October 5, 2026

## Applied

- Production migration `20261005150000_durable_publish_worker` applied successfully.
- Dedicated identity `cu-launch-publish-worker`, Service Bus `publishing` queue, and separate event and scheduled recovery jobs created in `rg-cu-app-portal`.
- Worker uses the existing import-worker environment, registry, pull identity, and vault. Publishing secrets were copied from the current portal values with explicit approval. Temporary per-secret setup permissions and the temporary database firewall rule were removed.
- Worker ownership of the shared `cu-apps-published-auth` registration is assigned.
- Portal deployment and the Next.js cache fix are live; portal health, FRED health, and the image optimizer return HTTP 200.
- Recovery verified FRED App's recorded GitHub run `37061385383` and public health endpoint. App `cmupylzvc000tr4h7l48mw4j8`, attempt `cmurf7o89003dnvh8f73xdekc`, support reference `SUP-20261001-0011E9F4` now record successful completion.

## Administrator grants still required

The rollout account could not grant Microsoft Graph application permission or assign Azure roles in `rg-cu-apps-published`. New publishing is explicitly disabled with `PUBLISH_TRANSPORT=disabled` until both grants are verified. Recovery remains active every five minutes.

Worker principal: `7bc4c952-3eb8-40b2-bbb6-651f0edb32b4`  
Worker client ID: `500632af-c130-45e1-ae9b-858c6c7a2cf8`

An administrator with permission to assign roles in the target publishing group should run this from the repository:

```sh
az deployment group create \
  --resource-group rg-cu-apps-published \
  --name publish-worker-target-permissions \
  --template-file infra/publish-worker/publishing-permissions.bicep \
  --parameters workerPrincipalId=7bc4c952-3eb8-40b2-bbb6-651f0edb32b4
```

This grants Contributor in that group and Role Based Access Control Administrator constrained to delegating only Key Vault Secrets User and Website Contributor.

An Entra Privileged Role Administrator or Global Administrator should grant the approved `Application.ReadWrite.OwnedBy` permission. Cloud Application Administrator cannot grant Microsoft Graph application permissions.

```sh
cat > /tmp/cu-publish-worker-graph-grant.json <<'JSON'
{
  "principalId": "7bc4c952-3eb8-40b2-bbb6-651f0edb32b4",
  "resourceId": "9384f89f-670a-49cd-9f81-3877a4e3a316",
  "appRoleId": "18a4783c-866b-4cc7-a460-3d5e5662c884"
}
JSON
az rest --method post \
  --url https://graph.microsoft.com/v1.0/servicePrincipals/9384f89f-670a-49cd-9f81-3877a4e3a316/appRoleAssignedTo \
  --body @/tmp/cu-publish-worker-graph-grant.json
```

After verifying both assignments and allowing identity permission propagation, enable the producer:

```sh
az webapp config appsettings set \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --settings PUBLISH_TRANSPORT=service-bus \
    PUBLISH_SERVICE_BUS_NAMESPACE=cula-rimp-sb-iqif7jtatmvw6.servicebus.windows.net \
    PUBLISH_SERVICE_BUS_QUEUE=publishing \
  --output none
```

Then complete the controlled publish and portal-restart verification described in [the worker runbook](publishing-worker.md). Check worker heartbeat, the recorded deployment, terminal status, and public `GET /api/health` before declaring new publishing ready.
