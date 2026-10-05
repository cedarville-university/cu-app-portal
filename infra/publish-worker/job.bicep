param jobName string
param location string
param environmentId string
param image string
param acrLoginServer string
param pullIdentityId string
param workerIdentityId string
param workerClientId string
param keyVaultUri string
param serviceBusNamespace string
param queueName string
param workerEnvironment object
param secretNames object
param recovery bool = false
param deploymentPrincipalId string = ''

var plainEnvironment = [for item in items(workerEnvironment): { name: item.key, value: string(item.value) }]
var secretEnvironment = [for item in items(secretNames): { name: item.key, secretRef: toLower(replace(item.key, '_', '-')) }]

resource job 'Microsoft.App/jobs@2025-01-01' = {
  name: jobName
  location: location
  tags: { workload: recovery ? 'publish-recovery' : 'publish-worker', managedBy: 'bicep' }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${workerIdentityId}': {}, '${pullIdentityId}': {} }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: recovery ? 'Schedule' : 'Event'
      replicaTimeout: recovery ? 600 : 3600
      replicaRetryLimit: 1
      scheduleTriggerConfig: recovery ? {
        cronExpression: '*/5 * * * *'
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      eventTriggerConfig: recovery ? null : {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: 5
          pollingInterval: 15
          rules: [{
            name: 'publishing'
            type: 'azure-servicebus'
            identity: workerIdentityId
            metadata: { namespace: serviceBusNamespace, queueName: queueName, messageCount: '1' }
          }]
        }
      }
      registries: [{ server: acrLoginServer, identity: pullIdentityId }]
      secrets: [for item in items(secretNames): {
        name: toLower(replace(item.key, '_', '-'))
        keyVaultUrl: '${keyVaultUri}secrets/${item.value}'
        identity: workerIdentityId
      }]
    }
    template: {
      containers: [{
        name: 'publish-worker'
        image: image
        resources: { cpu: json('1'), memory: '2Gi' }
        env: concat([
          { name: 'AZURE_CLIENT_ID', value: workerClientId }
          { name: 'PUBLISH_TRANSPORT', value: 'service-bus' }
          { name: 'PUBLISH_SERVICE_BUS_NAMESPACE', value: '${serviceBusNamespace}.servicebus.windows.net' }
          { name: 'PUBLISH_SERVICE_BUS_QUEUE', value: queueName }
          { name: 'PUBLISH_WORKER_MODE', value: recovery ? 'recovery' : 'worker' }
        ], plainEnvironment, secretEnvironment)
      }]
    }
  }
}
output jobId string = job.id

var jobContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4e3d2b60-56ae-4dc6-a233-09c8e5a82e68')
resource ciJobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  scope: job
  name: guid(job.id, deploymentPrincipalId, jobContributorRole)
  properties: { principalId: deploymentPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: jobContributorRole }
}
