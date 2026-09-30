param workspaceName string
param location string
param serviceBusNamespaceId string
param queueName string
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource deadLetterAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${workspaceName}-dead-letter'
  location: 'global'
  tags: tags
  properties: {
    description: 'Repository import messages entered the dead-letter queue.'
    severity: 1
    enabled: true
    scopes: [serviceBusNamespaceId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'DeadLetteredMessages'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'DeadletteredMessages'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Maximum'
          dimensions: [
            {
              name: 'EntityName'
              operator: 'Include'
              values: [queueName]
            }
          ]
          skipMetricValidation: false
        }
      ]
    }
    autoMitigate: false
    actions: []
  }
}

resource backlogAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${workspaceName}-queue-backlog'
  location: 'global'
  tags: tags
  properties: {
    description: 'Repository import queue backlog is above the worker concurrency bound.'
    severity: 2
    enabled: true
    scopes: [serviceBusNamespaceId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ActiveMessages'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'ActiveMessages'
          operator: 'GreaterThan'
          threshold: 25
          timeAggregation: 'Average'
          dimensions: [
            {
              name: 'EntityName'
              operator: 'Include'
              values: [queueName]
            }
          ]
          skipMetricValidation: false
        }
      ]
    }
    autoMitigate: true
    actions: []
  }
}

output workspaceId string = workspace.id
output workspaceName string = workspace.name
