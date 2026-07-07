---
name: publish-to-azure
description: Use when older Cedarville App Portal prompts or generated app repositories ask Codex to publish to Azure.
---

# Publish to Azure

Use the `cu-app-portal` skill first.

The Cedarville App Portal now treats portal-managed GitHub repositories and portal-managed Azure publishing as the supported path. Direct Azure-first publishing is a recovery path, not the default path. Read `app-portal/deployment-manifest.json` when working inside a managed app, and use portal publish or Repair Publishing Setup before falling back to manual `gh` or `az` operations.
