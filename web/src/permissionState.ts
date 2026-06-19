import type { PermissionGrant } from "./api";

export function compactRoleGrants(grants: PermissionGrant[]): PermissionGrant[] {
  const compacted = new Map<string, PermissionGrant>();
  for (const grant of grants) {
    compacted.set(grantKey(grant.scope, grant.resource, grant.field), grant);
  }
  return Array.from(compacted.values()).filter((grant) => grant.level > 0);
}

function grantKey(scope: PermissionGrant["scope"], resource: string, field: string) {
  return `${scope}:${resource}:${field}`;
}
