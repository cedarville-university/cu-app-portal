param environmentName string
param jobName string
param location string
param logAnalyticsWorkspaceName string
param infrastructureSubnetResourceId string = ''
param image string
param acrLoginServer string
param workerIdentityId string
param workerIdentityClientId string
param pullIdentityId string
param keyVaultUri string
param databaseSecretName string
param githubPrivateKeySecretName string
param smtpPasswordSecretName string
param serviceBusNamespace string
param queueName string
param githubAppId string
param githubAllowedOrgs string
param githubDefaultOrg string
param githubInstallationsJson string
param portalAppUrl string
param smtpHost string
param smtpPort int
param smtpUsername string
param smtpFrom string
param smtpReplyTo string
param smtpTlsMode string
param applicationCommit string
param deploymentPrincipalId string = ''
param tags object = {}

var jobContributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4e3d2b60-56ae-4dc6-a233-09c8e5a82e68')

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    vnetConfiguration: empty(infrastructureSubnetResourceId) ? null : {
      infrastructureSubnetId: infrastructureSubnetResourceId
      internal: true
    }
  }
}

resource job 'Microsoft.App/jobs@2025-01-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workerIdentityId}': {}
      '${pullIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: 5
          pollingInterval: 15
          rules: [
            {
              name: 'repository-imports'
              type: 'azure-servicebus'
              identity: workerIdentityId
              metadata: {
                namespace: serviceBusNamespace
                queueName: queueName
                messageCount: '1'
              }
            }
          ]
        }
      }
      registries: [
        {
          server: acrLoginServer
          identity: pullIdentityId
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVaultUri}secrets/${databaseSecretName}'
          identity: workerIdentityId
        }
        {
          name: 'github-app-private-key'
          keyVaultUrl: '${keyVaultUri}secrets/${githubPrivateKeySecretName}'
          identity: workerIdentityId
        }
        {
          name: 'smtp-password'
          keyVaultUrl: '${keyVaultUri}secrets/${smtpPasswordSecretName}'
          identity: workerIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'repository-import-worker'
          image: image
          resources: {
            cpu: json('1')
            memory: '2Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID', value: workerIdentityClientId }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'GITHUB_APP_PRIVATE_KEY', secretRef: 'github-app-private-key' }
            { name: 'GITHUB_APP_ID', value: githubAppId }
            { name: 'GITHUB_ALLOWED_ORGS', value: githubAllowedOrgs }
            { name: 'GITHUB_DEFAULT_ORG', value: githubDefaultOrg }
            { name: 'GITHUB_DEFAULT_REPO_VISIBILITY', value: 'private' }
            { name: 'GITHUB_APP_INSTALLATIONS_JSON', value: githubInstallationsJson }
            { name: 'PORTAL_APP_URL', value: portalAppUrl }
            { name: 'SMTP_HOST', value: smtpHost }
            { name: 'SMTP_PORT', value: string(smtpPort) }
            { name: 'SMTP_USERNAME', value: smtpUsername }
            { name: 'SMTP_PASSWORD', secretRef: 'smtp-password' }
            { name: 'SMTP_TLS_MODE', value: smtpTlsMode }
            { name: 'SMTP_FROM', value: smtpFrom }
            { name: 'SMTP_REPLY_TO', value: smtpReplyTo }
            { name: 'REPOSITORY_IMPORT_TRANSPORT', value: 'service-bus' }
            { name: 'REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE', value: '${serviceBusNamespace}.servicebus.windows.net' }
            { name: 'REPOSITORY_IMPORT_SERVICE_BUS_QUEUE', value: queueName }
            { name: 'APP_COMMIT_SHA', value: applicationCommit }
            { name: 'CONTAINER_IMAGE_DIGEST', value: image }
          ]
        }
      ]
    }
  }
}

resource deploymentJobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(job.id, deploymentPrincipalId, jobContributorRoleDefinitionId)
  scope: job
  properties: {
    roleDefinitionId: jobContributorRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output environmentId string = environment.id
output jobId string = job.id
output jobName string = job.name
