targetScope = 'resourceGroup'

@minLength(2)
@maxLength(18)
param namePrefix string
param location string = resourceGroup().location
param portalPrincipalId string
@description('Object ID of the GitHub Actions OIDC service principal. Leave empty when CI deployment is not configured.')
param deploymentPrincipalId string = ''
@description('Image content digest in sha256:<64 hex> form.')
param imageDigest string
param imageRepository string = 'repository-import-worker'
@description('Set false for the first deployment so Key Vault secrets can be populated before Container Apps validates their references.')
param deployJob bool = true
param infrastructureSubnetResourceId string = ''
param githubAppId string
param githubAllowedOrgs string
param githubDefaultOrg string
param githubInstallationsJson string
param databaseSecretName string = 'repository-import-database-url'
param githubPrivateKeySecretName string = 'github-app-private-key'
param applicationCommit string = 'unknown'
param tags object = {
  workload: 'repository-import-worker'
  managedBy: 'bicep'
}

var suffix = uniqueString(resourceGroup().id, namePrefix)
var safePrefix = toLower(replace(namePrefix, '-', ''))
var registryName = take('${safePrefix}${suffix}', 50)
var namespaceName = take('${namePrefix}-sb-${suffix}', 50)
var queueName = 'repository-imports'
var workerIdentityName = take('${namePrefix}-import-worker', 128)
var pullIdentityName = take('${namePrefix}-import-pull', 128)
var keyVaultName = take('${safePrefix}-${suffix}-kv', 24)
var workspaceName = take('${namePrefix}-import-logs', 63)
var environmentName = take('${namePrefix}-import-env', 60)
var jobName = take('${namePrefix}-import-job', 31)
var readerRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')

resource deploymentReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(resourceGroup().id, deploymentPrincipalId, readerRoleDefinitionId)
  properties: {
    roleDefinitionId: readerRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
  }
}

module registry 'modules/registry.bicep' = {
  name: 'repository-import-registry'
  params: {
    name: registryName
    location: location
    deploymentPrincipalId: deploymentPrincipalId
    tags: tags
  }
}

module identity 'modules/identity.bicep' = {
  name: 'repository-import-identities'
  params: {
    workerIdentityName: workerIdentityName
    pullIdentityName: pullIdentityName
    keyVaultName: keyVaultName
    location: location
    registryId: registry.outputs.id
    tags: tags
  }
}

module messaging 'modules/messaging.bicep' = {
  name: 'repository-import-messaging'
  params: {
    namespaceName: namespaceName
    queueName: queueName
    location: location
    portalPrincipalId: portalPrincipalId
    workerPrincipalId: identity.outputs.workerPrincipalId
    tags: tags
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'repository-import-monitoring'
  params: {
    workspaceName: workspaceName
    location: location
    serviceBusNamespaceId: messaging.outputs.namespaceId
    queueName: queueName
    tags: tags
  }
}

module job 'modules/job.bicep' = if (deployJob) {
  name: 'repository-import-job'
  params: {
    environmentName: environmentName
    jobName: jobName
    location: location
    logAnalyticsWorkspaceName: monitoring.outputs.workspaceName
    infrastructureSubnetResourceId: infrastructureSubnetResourceId
    image: '${registry.outputs.loginServer}/${imageRepository}@${imageDigest}'
    acrLoginServer: registry.outputs.loginServer
    workerIdentityId: identity.outputs.workerIdentityId
    pullIdentityId: identity.outputs.pullIdentityId
    keyVaultUri: identity.outputs.keyVaultUri
    databaseSecretName: databaseSecretName
    githubPrivateKeySecretName: githubPrivateKeySecretName
    serviceBusNamespace: messaging.outputs.namespaceName
    queueName: messaging.outputs.queueName
    githubAppId: githubAppId
    githubAllowedOrgs: githubAllowedOrgs
    githubDefaultOrg: githubDefaultOrg
    githubInstallationsJson: githubInstallationsJson
    applicationCommit: applicationCommit
    deploymentPrincipalId: deploymentPrincipalId
    tags: tags
  }
}

output serviceBusNamespace string = messaging.outputs.fullyQualifiedNamespace
output serviceBusQueue string = messaging.outputs.queueName
output acrLoginServer string = registry.outputs.loginServer
output jobName string = jobName
output workerIdentityId string = identity.outputs.workerIdentityId
output pullIdentityId string = identity.outputs.pullIdentityId
output keyVaultUri string = identity.outputs.keyVaultUri
output logAnalyticsWorkspaceId string = monitoring.outputs.workspaceId
