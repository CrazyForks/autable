import {
  Button,
  Combobox,
  CounterBadge,
  List,
  ListItem,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Select,
  Text
} from "@fluentui/react-components";
import { AddRegular, DismissRegular, PeopleRegular, SaveRegular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import {
  type DatabaseMetadata,
  type FormDefinition,
  type PermissionGrant,
  type RoleDefinition,
  type AuthUser,
  type WorkflowDefinition
} from "../api";
export { compactRoleGrants } from "../permissionState";

const permissionLevels = [0, 1, 2] as const;

type PermissionPanelProps = {
  database: DatabaseMetadata;
  forms: FormDefinition[];
  grants: PermissionGrant[];
  members: string[];
  memberOptions: AuthUser[];
  memberUsers: AuthUser[];
  newMemberEmail: string;
  onAddMember: (user?: AuthUser) => void;
  onGrantChange: (
    scope: PermissionGrant["scope"],
    resource: string,
    field: string,
    level: PermissionGrant["level"]
  ) => void;
  onMemberRemove: (memberID: string) => void;
  onNewMemberEmailChange: (value: string) => void;
  onSave: () => void;
  role?: RoleDefinition;
  workflows: WorkflowDefinition[];
};

export function PermissionPanel({
  database,
  forms,
  grants,
  members,
  memberOptions,
  memberUsers,
  newMemberEmail,
  onAddMember,
  onGrantChange,
  onMemberRemove,
  onNewMemberEmailChange,
  onSave,
  role,
  workflows
}: PermissionPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="permission-view">
      <div className="section-header">
        <div>
          <Text weight="semibold">{role?.name ?? t("permission.noRoleSelected")}</Text>
          <Text size={200}>{t("permission.roleAccessMatrix", { database: database.name })}</Text>
        </div>
        {role && (
          <div className="permission-actions">
            <MembersControl
              members={members}
              memberOptions={memberOptions}
              memberUsers={memberUsers}
              newMemberEmail={newMemberEmail}
              onAddMember={onAddMember}
              onMemberRemove={onMemberRemove}
              onNewMemberEmailChange={onNewMemberEmailChange}
            />
            <Button icon={<SaveRegular />} appearance="primary" onClick={onSave}>
              {t("common.save")}
            </Button>
          </div>
        )}
      </div>
      {role ? (
        <PermissionMatrix
          database={database}
          forms={forms}
          grants={grants}
          onGrantChange={onGrantChange}
          workflows={workflows}
        />
      ) : (
        <div className="empty-state">
          <Text>{t("permission.empty")}</Text>
        </div>
      )}
    </div>
  );
}

function MembersControl({
  members,
  memberOptions,
  memberUsers,
  newMemberEmail,
  onAddMember,
  onMemberRemove,
  onNewMemberEmailChange
}: Pick<
  PermissionPanelProps,
  "members" | "memberOptions" | "memberUsers" | "newMemberEmail" | "onAddMember" | "onMemberRemove" | "onNewMemberEmailChange"
>) {
  const { t } = useTranslation();
  const memberByID = new Map(memberUsers.map((member) => [member.id, member]));
  const memberItems = members.map((memberID) => ({
    id: memberID,
    email: memberByID.get(memberID)?.email ?? memberID
  }));
  return (
    <Popover positioning="below-end" trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Button icon={<PeopleRegular />}>
          {t("permission.members")}
          <CounterBadge
            className="members-count"
            appearance="filled"
            color="brand"
            count={members.length}
            showZero
          />
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="members-popover" aria-label={t("permission.members")}>
        <div className="create-rowline">
          <Combobox
            aria-label={t("permission.roleMemberEmail")}
            placeholder={t("permission.searchEmail")}
            open={newMemberEmail.trim().length >= 2 && memberOptions.length > 0}
            value={newMemberEmail}
            onChange={(event) => onNewMemberEmailChange(event.currentTarget.value)}
            onOptionSelect={(_, data) => {
              const selected = memberOptions.find((member) => member.id === data.optionValue);
              if (selected) {
                onAddMember(selected);
              }
            }}
          >
            {memberOptions.map((member) => (
              <Option key={member.id} value={member.id} text={member.email}>
                {member.email}
              </Option>
            ))}
          </Combobox>
          <Button icon={<AddRegular />} aria-label={t("permission.addRoleMember")} onClick={() => onAddMember()} />
        </div>
        {members.length === 0 ? (
          <Text size={200}>{t("permission.noMembers")}</Text>
        ) : (
          <List navigationMode="items" aria-label={t("permission.members")}>
            {memberItems.map((member) => (
              <ListItem key={member.id}>
                <div className="member-list-item">
                  <Text truncate>{member.email}</Text>
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    aria-label={t("permission.removeMember", { email: member.email })}
                    onClick={() => onMemberRemove(member.id)}
                  />
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </PopoverSurface>
    </Popover>
  );
}

function PermissionMatrix({
  database,
  forms,
  grants,
  onGrantChange,
  workflows
}: Pick<PermissionPanelProps, "database" | "forms" | "grants" | "onGrantChange" | "workflows">) {
  const { t } = useTranslation();
  return (
    <div className="permission-grid">
      <div className="permission-card">
        <Text weight="semibold">{t("permission.tables")}</Text>
        {database.tables.map((table) => (
          <div key={table.name} className="permission-resource">
            <Text size={200} weight="semibold">
              {table.display_name || table.name}
            </Text>
            <PermissionScopeRow
              ariaLabel={`${table.name} fields permission`}
              grants={grants}
              items={table.fields
                .filter((field) => !field.deleted)
                .map((field) => ({
                  key: field.name,
                  label: field.name,
                  scope: "field" as const,
                  resource: `${database.name}.${table.name}`,
                  field: field.name
                }))}
              label={t("permission.fields")}
              onGrantChange={onGrantChange}
              partialAriaLabel={`${table.name} fields partial permissions`}
              value={grantLevel(grants, "field_set", `${database.name}.${table.name}`, "")}
              onChange={(level) => onGrantChange("field_set", `${database.name}.${table.name}`, "", level)}
            />
            <PermissionScopeRow
              ariaLabel={`${table.name} views permission`}
              grants={grants}
              items={table.views.map((view) => ({
                key: view.name,
                label: view.display_name || view.name,
                scope: "view" as const,
                resource: `${database.name}.${table.name}`,
                field: view.name
              }))}
              label={t("permission.views")}
              onGrantChange={onGrantChange}
              partialAriaLabel={`${table.name} views partial permissions`}
              value={grantLevel(grants, "view_set", `${database.name}.${table.name}`, "")}
              onChange={(level) => onGrantChange("view_set", `${database.name}.${table.name}`, "", level)}
            />
          </div>
        ))}
      </div>
      <div className="permission-card">
        <Text weight="semibold">{t("permission.workflows")}</Text>
        <PermissionScopeRow
          ariaLabel={`${t("permission.workflowSet")} permission`}
          grants={grants}
          items={workflows.map((workflow) => ({
            key: String(workflow.id ?? workflow.name),
            label: workflow.name,
            scope: "workflow" as const,
            resource: String(workflow.id ?? 0),
            field: ""
          }))}
          label={t("permission.workflowSet")}
          onGrantChange={onGrantChange}
          partialAriaLabel={t("permission.workflowPartialPermissions")}
          value={grantLevel(grants, "workflow_set", database.name, "")}
          onChange={(level) => onGrantChange("workflow_set", database.name, "", level)}
        />
      </div>
      <div className="permission-card">
        <Text weight="semibold">{t("permission.forms")}</Text>
        <PermissionScopeRow
          ariaLabel={`${t("permission.formSet")} permission`}
          grants={grants}
          items={forms.map((form) => ({
            key: String(form.id ?? form.name),
            label: form.name,
            scope: "form" as const,
            resource: String(form.id ?? 0),
            field: ""
          }))}
          label={t("permission.formSet")}
          onGrantChange={onGrantChange}
          partialAriaLabel={t("permission.formPartialPermissions")}
          value={grantLevel(grants, "form_set", database.name, "")}
          onChange={(level) => onGrantChange("form_set", database.name, "", level)}
        />
      </div>
    </div>
  );
}

function PermissionScopeRow(props: {
  ariaLabel: string;
  grants: PermissionGrant[];
  items: Array<{
    key: string;
    label: string;
    scope: PermissionGrant["scope"];
    resource: string;
    field: string;
  }>;
  label: string;
  onChange: (level: PermissionGrant["level"]) => void;
  onGrantChange: (
    scope: PermissionGrant["scope"],
    resource: string,
    field: string,
    level: PermissionGrant["level"]
  ) => void;
  partialAriaLabel: string;
  value: PermissionGrant["level"];
}) {
  const { t } = useTranslation();
  return (
    <div className="permission-scope-row">
      <PermissionLevelSelect ariaLabel={props.ariaLabel} label={props.label} value={props.value} onChange={props.onChange} />
      <Popover positioning="below-end" trapFocus>
        <PopoverTrigger disableButtonEnhancement>
          <Button size="small" aria-label={props.partialAriaLabel} disabled={props.items.length === 0}>
            {t("permission.partial")}
          </Button>
        </PopoverTrigger>
        <PopoverSurface className="permission-partial-popover" aria-label={props.partialAriaLabel}>
          <Text weight="semibold">{props.label}</Text>
          {props.items.length === 0 ? (
            <Text size={200}>{t("permission.noPartialItems")}</Text>
          ) : (
            <div className="permission-partial-list">
              {props.items.map((item) => (
                <PermissionLevelSelect
                  key={item.key}
                  label={item.label}
                  value={grantLevel(props.grants, item.scope, item.resource, item.field)}
                  onChange={(level) => props.onGrantChange(item.scope, item.resource, item.field, level)}
                />
              ))}
            </div>
          )}
        </PopoverSurface>
      </Popover>
    </div>
  );
}

function grantLevel(
  grants: PermissionGrant[],
  scope: PermissionGrant["scope"],
  resource: string,
  field: string
): PermissionGrant["level"] {
  return grants.find((grant) => grant.scope === scope && grant.resource === resource && grant.field === field)?.level ?? 0;
}

function PermissionLevelSelect(props: {
  ariaLabel?: string;
  label: string;
  value: PermissionGrant["level"];
  onChange: (level: PermissionGrant["level"]) => void;
}) {
  const { t } = useTranslation();
  const permissionLevelLabels: Record<(typeof permissionLevels)[number], string> = {
    0: t("permission.levels.none"),
    1: t("permission.levels.read"),
    2: t("permission.levels.write")
  };
  return (
    <label className="permission-row">
      <span>{props.label}</span>
      <Select
        aria-label={props.ariaLabel ?? `${props.label} permission`}
        value={String(props.value)}
        onChange={(_, data) => props.onChange(Number(data.value) as PermissionGrant["level"])}
      >
        {permissionLevels.map((level) => (
          <option key={level} value={level}>
            {permissionLevelLabels[level]}
          </option>
        ))}
      </Select>
    </label>
  );
}
