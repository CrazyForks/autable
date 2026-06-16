import type { DatabaseMetadata, PermissionGrant } from "./api";

export function compactRoleGrants(grants: PermissionGrant[], database?: DatabaseMetadata): PermissionGrant[] {
  const compacted = new Map<string, PermissionGrant>();
  for (const grant of grants) {
    compacted.set(grantKey(grant.scope, grant.resource, grant.field), grant);
  }

  if (database) {
    for (const table of database.tables) {
      const resource = `${database.name}.${table.name}`;
      const tableGrant = compacted.get(grantKey("table", resource, ""));
      if (!tableGrant || tableGrant.level === 0) {
        continue;
      }
      for (const field of table.fields) {
        if (field.deleted) {
          continue;
        }
        const fieldKey = grantKey("field", resource, field.name);
        if (!compacted.has(fieldKey)) {
          compacted.set(fieldKey, {
            subject_id: tableGrant.subject_id,
            scope: "field",
            resource,
            field: field.name,
            level: 0
          });
        }
      }
    }
  }

  const tableLevels = new Map<string, PermissionGrant["level"]>();
  for (const grant of compacted.values()) {
    if (grant.scope === "table" && grant.field === "" && grant.level > 0) {
      tableLevels.set(grant.resource, grant.level);
    }
  }

  return Array.from(compacted.values()).filter(
    (grant) => grant.level > 0 || (grant.scope === "field" && (tableLevels.get(grant.resource) ?? 0) > 0)
  );
}

function grantKey(scope: PermissionGrant["scope"], resource: string, field: string) {
  return `${scope}:${resource}:${field}`;
}
