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
            <PermissionLevelSelect
              label={t("permission.fieldSet", { table: table.name })}
              value={grantLevel(grants, "field_set", `${database.name}.${table.name}`, "")}
              onChange={(level) => onGrantChange("field_set", `${database.name}.${table.name}`, "", level)}
            />
            <PermissionLevelSelect
              label={t("permission.viewSet", { table: table.name })}
              value={grantLevel(grants, "view_set", `${database.name}.${table.name}`, "")}
              onChange={(level) => onGrantChange("view_set", `${database.name}.${table.name}`, "", level)}
            />
            <div className="permission-fields">
              {table.fields
                .filter((field) => !field.deleted)
                .map((field) => (
                  <PermissionLevelSelect
                    key={field.name}
                    label={field.name}
                    value={grantLevel(grants, "field", `${database.name}.${table.name}`, field.name)}
                    onChange={(level) => onGrantChange("field", `${database.name}.${table.name}`, field.name, level)}
                  />
                ))}
              {table.views.map((view) => (
                <PermissionLevelSelect
                  key={view.name}
                  label={t("permission.view", { view: view.name })}
                  value={grantLevel(grants, "view", `${database.name}.${table.name}`, view.name)}
                  onChange={(level) => onGrantChange("view", `${database.name}.${table.name}`, view.name, level)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="permission-card">
        <Text weight="semibold">{t("permission.workflows")}</Text>
        <PermissionLevelSelect
          label={t("permission.workflowSet")}
          value={grantLevel(grants, "workflow_set", database.name, "")}
          onChange={(level) => onGrantChange("workflow_set", database.name, "", level)}
        />
        {workflows.map((workflow) => (
          <PermissionLevelSelect
            key={workflow.id ?? workflow.name}
            label={workflow.name}
            value={grantLevel(grants, "workflow", String(workflow.id ?? 0), "")}
            onChange={(level) => onGrantChange("workflow", String(workflow.id ?? 0), "", level)}
          />
        ))}
      </div>
      <div className="permission-card">
        <Text weight="semibold">{t("permission.forms")}</Text>
        <PermissionLevelSelect
          label={t("permission.formSet")}
          value={grantLevel(grants, "form_set", database.name, "")}
          onChange={(level) => onGrantChange("form_set", database.name, "", level)}
        />
        {forms.map((form) => (
          <PermissionLevelSelect
            key={form.id ?? form.name}
            label={form.name}
            value={grantLevel(grants, "form", String(form.id ?? 0), "")}
            onChange={(level) => onGrantChange("form", String(form.id ?? 0), "", level)}
          />
        ))}
      </div>
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
        aria-label={`${props.label} permission`}
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
