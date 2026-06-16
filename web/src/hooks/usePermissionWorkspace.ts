import { useEffect, useMemo, useState } from "react";
import { compactMembers, replaceRole } from "../appState";
import {
  createRole,
  listRoles,
  saveRoleGrants,
  saveRoleMembers,
  type DatabaseMetadata,
  type PermissionGrant,
  type RoleDefinition
} from "../api";
import { compactRoleGrants } from "../permissionState";

type UsePermissionWorkspaceOptions = {
  currentUserID?: string;
  database: DatabaseMetadata;
  onStatus: (message: string) => void;
};

export function usePermissionWorkspace({ currentUserID, database, onStatus }: UsePermissionWorkspaceOptions) {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [roleDraftGrants, setRoleDraftGrants] = useState<PermissionGrant[]>([]);
  const [roleDraftMembers, setRoleDraftMembers] = useState<string[]>([]);
  const [newRoleMemberID, setNewRoleMemberID] = useState("");

  const selectedRole = useMemo(
    () => roles.find((item) => item.name === selectedRoleName) ?? roles[0],
    [roles, selectedRoleName]
  );

  useEffect(() => {
    setRoleDraftGrants(selectedRole?.grants ?? []);
    setRoleDraftMembers(selectedRole?.members ?? []);
    setNewRoleMemberID("");
  }, [selectedRole?.subject_id]);

  useEffect(() => {
    let cancelled = false;
    if (!database.name || !currentUserID) {
      clearRoles();
      return () => {
        cancelled = true;
      };
    }
    void loadRoles(database.name).catch(() => {
      if (!cancelled) {
        clearRoles();
      }
    });
    return () => {
      cancelled = true;
    };

    async function loadRoles(dbName: string) {
      const nextRoles = await listRoles(dbName);
      if (cancelled) {
        return;
      }
      applyRoles(nextRoles);
    }
  }, [currentUserID, database.name]);

  function applyRoles(nextRoles: RoleDefinition[]) {
    setRoles(nextRoles);
    setSelectedRoleName(nextRoles[0]?.name ?? "");
  }

  function clearRoles() {
    applyRoles([]);
  }

  async function refreshRoles(dbName = database.name) {
    if (!currentUserID || !dbName) {
      clearRoles();
      return [];
    }
    const nextRoles = await listRoles(dbName).catch(() => []);
    applyRoles(nextRoles);
    return nextRoles;
  }

  async function createRoleFromSidebar() {
    if (!database.name) {
      onStatus("Select a database before creating a role");
      return;
    }
    const name = newRoleName.trim();
    if (!name) {
      onStatus("Role name is required");
      return;
    }
    try {
      const saved = await createRole(database.name, name);
      setRoles((current) => replaceRole(current, saved));
      setSelectedRoleName(saved.name);
      setNewRoleName("");
      onStatus(`Created role ${saved.name}`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Role creation failed");
    }
  }

  async function persistRoleGrants() {
    if (!database.name || !selectedRole) {
      onStatus("Select a role before saving permissions");
      return;
    }
    try {
      await saveRoleGrants(database.name, selectedRole.name, compactRoleGrants(roleDraftGrants, database));
      const saved = await saveRoleMembers(database.name, selectedRole.name, compactMembers(roleDraftMembers));
      setRoles((current) => replaceRole(current, saved));
      setSelectedRoleName(saved.name);
      setRoleDraftMembers(saved.members ?? []);
      onStatus(`Saved role ${saved.name}`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Role save failed");
    }
  }

  function updateRoleGrant(scope: PermissionGrant["scope"], resource: string, field: string, level: PermissionGrant["level"]) {
    if (!selectedRole) {
      return;
    }
    setRoleDraftGrants((current) => {
      const next = current.filter((grant) => grant.scope !== scope || grant.resource !== resource || grant.field !== field);
      if (level === 0) {
        return next;
      }
      return [
        ...next,
        {
          subject_id: selectedRole.subject_id,
          scope,
          resource,
          field,
          level
        }
      ];
    });
  }

  function addRoleMember() {
    const memberID = newRoleMemberID.trim();
    if (!memberID) {
      onStatus("Role member user id is required");
      return;
    }
    setRoleDraftMembers((current) => compactMembers([...current, memberID]));
    setNewRoleMemberID("");
  }

  function removeRoleMember(memberID: string) {
    setRoleDraftMembers((current) => current.filter((item) => item !== memberID));
  }

  return {
    newRoleMemberID,
    newRoleName,
    roleDraftGrants,
    roleDraftMembers,
    roles,
    selectedRole,
    addRoleMember,
    clearRoles,
    createRoleFromSidebar,
    persistRoleGrants,
    refreshRoles,
    removeRoleMember,
    setNewRoleMemberID,
    setNewRoleName,
    setSelectedRoleName,
    updateRoleGrant
  };
}
