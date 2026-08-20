---
title: Glossary
description: Plain-language definitions for portal, GitHub, and Azure terms.
lastReviewed: 2026-08-20
owner: Cedarville IT
---

# Glossary

## App

A website or service created, tracked, and published through the portal.

## App owner

The primary person responsible for an app. Owners can manage collaborators and delete scoped resources.

## Azure

Microsoft's cloud platform. The portal uses Azure to host running apps and related app-specific resources.

## Codex

An AI coding assistant that can help create or change an app's files. Finished changes must reach the managed GitHub repository before the portal can publish them.

## Collaborator

A Cedarville coworker invited to help manage an app in the portal. GitHub repository access is requested separately.

## Database

Structured storage used when an app must remember records such as requests, approvals, or tracker entries.

## Deployment

A particular attempt to build and send the app to Azure. Publishing starts a deployment.

## Environment variable

A named runtime setting supplied outside the app's code. It may contain a normal configuration value or a secret.

## Git

The software that records a history of changes in the app folder on your computer. For portal work, install it from Company Portal on Windows or CedarNet 2.0 on macOS. Codex runs the Git commands for you.

## GitHub

The service Cedarville uses to store app code, record changes, collaborate, and run publishing workflows.

## Local Codex project

A Codex project connected to a folder on your computer. Open or create this project before starting an app task so Codex works with the correct files.

## Managed repository

The private GitHub repository created or imported by the portal and treated as the supported source of truth.

## Pull request

A GitHub review page that shows proposed file changes before they are merged into the app. The portal uses one instead of overwriting conflicting publishing files.

## Microsoft Entra login

Cedarville sign-in used to identify users and control who may enter an app.

## Primary folder

The main folder attached to a local Codex project. Codex uses it as the starting location for files and Git work. It should be the new empty app folder for a generated app or the existing app folder for a local app.

## Publish

Build and send the current managed GitHub version to Azure so it can run in a web browser.

## Publishing setup

The GitHub workflow, Azure resources, secrets, and credentials that allow the portal to publish an app safely.

## Quick chat

A conversation that is not attached to the app's local Codex project. Do not use Quick chat for a portal Git handoff; open the local project and start the task inside it.

## Source of truth

The managed GitHub copy that Cedarville tools treat as the current app. Local changes must be uploaded there before the portal can publish them.

## Support reference

A safe identifier that helps Cedarville IT find technical records for a failed or important action.

## Template

An approved starting point that supplies common app files, features, and Cedarville defaults.
