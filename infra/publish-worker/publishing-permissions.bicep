targetScope = 'resourceGroup'
param workerPrincipalId string

var contributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var secretsOfficerRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
var rbacAdminRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f58310d9-a9f6-439a-9e8d-f62e7b41a168')

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, workerPrincipalId, contributorRole)
  properties: { principalId: workerPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: contributorRole }
}
resource constrainedRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, workerPrincipalId, rbacAdminRole)
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: rbacAdminRole
    conditionVersion: '2.0'
    condition: '((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/write\'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, de139f84-1756-47ae-9be6-808fbbe84772})) AND ((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/delete\'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, de139f84-1756-47ae-9be6-808fbbe84772}))'
  }
}

// The worker writes managed database/authentication secrets into each app's vault.
resource secretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, workerPrincipalId, secretsOfficerRole)
  properties: { principalId: workerPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: secretsOfficerRole }
}
