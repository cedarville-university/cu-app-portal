param namespaceName string
param queueName string
param location string
param portalPrincipalId string
param workerPrincipalId string
param tags object = {}

var senderRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39')
var receiverRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    disableLocalAuth: true
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
  }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: queueName
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P1D'
    enableBatchedOperations: true
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
  }
}

resource portalSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, portalPrincipalId, senderRoleId)
  properties: {
    roleDefinitionId: senderRoleId
    principalId: portalPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource workerReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, workerPrincipalId, receiverRoleId)
  properties: {
    roleDefinitionId: receiverRoleId
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output namespaceName string = serviceBus.name
output namespaceId string = serviceBus.id
output fullyQualifiedNamespace string = '${serviceBus.name}.servicebus.windows.net'
output queueName string = queue.name
output queueId string = queue.id
