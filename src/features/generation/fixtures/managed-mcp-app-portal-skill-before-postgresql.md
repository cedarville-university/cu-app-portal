---
name: cu-app-portal
description: Use when customizing, publishing, or connecting this CU Launch-managed MCP server to a user-owned plugin.
---

# CU Launch MCP server

Read app-portal/deployment-manifest.json, docs/mcp-server.md, and docs/plugin-creator-handoff.md. Use the managed GitHub repository as the source of truth. Preserve custom code and require the normal CU Launch publish, repair, and retry authorization. Ask permission before using the CU Launch connector unless already authorized. Use secure Git authentication; never extract credentials.

Keep GET /api/health and OAuth discovery public. Require validated per-server delegated Entra bearer auth before every MCP dispatch. Browser sessions, portal tokens, app-only tokens, and API keys are not substitutes. Keep canonical identity stable. Authorize data/actions separately for every tool and never forward incoming MCP tokens downstream.

Test with npm test, npm run typecheck, and npm run build before committing and pushing authorized changes. After first publish, default-branch pushes deploy automatically when auto-deploy is enabled; explain that effect. Preserve the exact health endpoint independently of external dependencies.

When a plugin is requested, read Plugin Creator's installed existing-MCP-server and package instructions. Use this app's verified Azure endpoint; do not create a Site or second server. Preserve an existing plugin's identity and sharing. Keep secrets out of chat/archives. Package creation, OAuth connection, tool discovery, and a verified harmless tool call are separate stages. Report missing host/identity setup honestly; no anonymous or Sites fallback.
