param environmentName string
param jobName string
param location string
param logAnalyticsWorkspaceName string
param infrastructureSubnetResourceId string = ''
param image string
param acrLoginServer string
param workerIdentityId string
param pullIdentityId string
param keyVaultUri string
param databaseSecretName string
param githubPrivateKeySecretName string
param serviceBusNamespace string
param queueName string
param githubAppId string
param githubAllowedOrgs string
param githubDefaultOrg string
param githubInstallationsJson string
param applicationCommit string
param tags object = {}

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
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'GITHUB_APP_PRIVATE_KEY', secretRef: 'github-app-private-key' }
            { name: 'GITHUB_APP_ID', value: githubAppId }
            { name: 'GITHUB_ALLOWED_ORGS', value: githubAllowedOrgs }
            { name: 'GITHUB_DEFAULT_ORG', value: githubDefaultOrg }
            { name: 'GITHUB_DEFAULT_REPO_VISIBILITY', value: 'private' }
            { name: 'GITHUB_APP_INSTALLATIONS_JSON', value: githubInstallationsJson }
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

output environmentId string = environment.id
output jobId string = job.id
output jobName string = job.name
