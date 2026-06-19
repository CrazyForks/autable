import { describe, expect, it } from "vitest";
import { compactRoleGrants } from "./PermissionPanel";
import type { PermissionGrant } from "../api";

describe("compactRoleGrants", () => {
  it("keeps positive set and field grants", () => {
    const grants: PermissionGrant[] = [
      { subject_id: "role:workspace:editor", scope: "field_set", resource: "workspace.contacts", field: "", level: 2 },
      { subject_id: "role:workspace:editor", scope: "field", resource: "workspace.contacts", field: "email", level: 1 }
    ];

    expect(compactRoleGrants(grants)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "field_set", resource: "workspace.contacts", field: "", level: 2 }),
        expect.objectContaining({ scope: "field", resource: "workspace.contacts", field: "email", level: 1 })
      ])
    );
    expect(compactRoleGrants(grants)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: "field", field: "legacy" })])
    );
  });

  it("drops none grants", () => {
    const grants: PermissionGrant[] = [
      { subject_id: "role:workspace:editor", scope: "field_set", resource: "workspace.contacts", field: "", level: 0 },
      { subject_id: "role:workspace:editor", scope: "field", resource: "workspace.contacts", field: "email", level: 0 },
      { subject_id: "role:workspace:editor", scope: "workflow", resource: "1", field: "", level: 0 }
    ];

    expect(compactRoleGrants(grants)).toEqual([]);
  });
});
