targetScope = 'resourceGroup'

param namePrefix string = 'cu-launch'
param location string = resourceGroup().location
@description('Existing repository-import worker environment, registry, pull identity and Service Bus namespace can be reused.')
param environmentId string
param acrLoginServer string
param pullIdentityId string
param serviceBusNamespaceName string
param keyVaultName string
param portalPrincipalId string
param deploymentPrincipalId string = ''
param imageDigest string
param workerEnvironment object
@description('Resource group where managed apps are published; it may differ from the worker hosting resource group.')
param publishingResourceGroupName string = string(workerEnvironment.AZURE_PUBLISH_RESOURCE_GROUP)
@description('Environment variable names mapped to existing Key Vault secret names. Never put secret values in parameters.')
param secretNames object = {
  DATABASE_URL: 'repository-import-database-url'
  GITHUB_APP_PRIVATE_KEY: 'github-app-private-key'
  AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: 'publish-postgres-admin-password'
  AZURE_PUBLISH_AUTH_SECRET: 'publish-auth-secret'
  AZURE_PUBLISH_ENTRA_CLIENT_SECRET: 'publish-entra-client-secret'
  SMTP_PASSWORD: 'smtp-password'
}

var senderRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39')
var receiverRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')
var secretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-publish-worker'
  location: location
  tags: { workload: 'publish-worker' }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: keyVaultName }
resource namespace 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = { name: serviceBusNamespaceName }
resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: namespace
  name: 'publishing'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
  }
}
resource portalSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, portalPrincipalId, senderRole)
  properties: { principalId: portalPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: senderRole }
}
resource workerReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, identity.id, receiverRole)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: receiverRole }
}
resource recoverySender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, identity.id, senderRole)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: senderRole }
}
resource secretReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, secretsUserRole)
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: secretsUserRole }
}
module publishingPermissions 'publishing-permissions.bicep' = {
  name: 'publish-worker-target-permissions'
  scope: resourceGroup(publishingResourceGroupName)
  params: { workerPrincipalId: identity.properties.principalId }
}
module jobs 'job.bicep' = [for recovery in [false, true]: {
  name: recovery ? 'publish-recovery-job' : 'publish-worker-job'
  dependsOn: [secretReader, workerReceiver, recoverySender, publishingPermissions]
  params: {
    jobName: recovery ? '${namePrefix}-publish-recovery' : '${namePrefix}-publish-worker'
    location: location
    environmentId: environmentId
    image: '${acrLoginServer}/publish-worker@${imageDigest}'
    acrLoginServer: acrLoginServer
    pullIdentityId: pullIdentityId
    workerIdentityId: identity.id
    workerClientId: identity.properties.clientId
    keyVaultUri: vault.properties.vaultUri
    serviceBusNamespace: namespace.name
    queueName: queue.name
    workerEnvironment: workerEnvironment
    secretNames: secretNames
    deploymentPrincipalId: deploymentPrincipalId
    recovery: recovery
  }
}]
output workerPrincipalId string = identity.properties.principalId
output workerClientId string = identity.properties.clientId
output serviceBusNamespace string = '${namespace.name}.servicebus.windows.net'
output serviceBusQueue string = queue.name
