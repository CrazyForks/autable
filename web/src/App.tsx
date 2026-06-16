import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Label,
  AppItemStatic,
  Nav,
  NavCategory,
  NavCategoryItem,
  NavDivider,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  NavSubItem,
  NavSubItemGroup,
  Select,
  Text,
  Textarea,
  Toolbar,
  ToolbarButton,
  Tooltip
} from "@fluentui/react-components";
import {
  AddRegular,
  AppsListRegular,
  ArrowClockwiseRegular,
  DocumentFlowchartRegular,
  DocumentTableRegular,
  DatabaseRegular,
  FormRegular,
  PeopleRegular,
  PersonRegular,
  PlayRegular,
  SaveRegular,
  ShieldRegular
} from "@fluentui/react-icons";
import DataEditor, {
  type EditableGridCell,
  type GridCell,
  GridCellKind,
  type GridColumn,
  type Item
} from "@glideapps/glide-data-grid";
import { demoCatalog, initialForms, initialRows, initialWorkflowNodes, initialWorkflows } from "./demoData";
import { renderFormScript } from "./formRuntime";
import {
  createDatabase,
  createRow,
  createTable,
  listOIDCProviders,
  listForms,
  listRowHistory,
  listRows,
  listWorkflowRuns,
  listWorkflows,
  loadCurrentUser,
  loadMetadata,
  loadWorkflowNodes,
  login,
  logout,
  oidcStartURL,
  register,
  runWorkflow,
  saveForm,
  saveWorkflow,
  updateRow,
  type AuthUser,
  type Catalog,
  type DatabaseMetadata,
  type FormDefinition,
  type OIDCProvider,
  type RowChange,
  type RowRecord,
  type TableMetadata,
  type TableView,
  type WorkflowDefinition,
  type WorkflowNodeInfo,
  type WorkflowRunResponse
} from "./api";

type View = "table" | "workflow" | "form" | "permission";

const emptyDatabase: DatabaseMetadata = { name: "", sqlite_path: "", tables: [] };
const emptyTable: TableMetadata = { name: "", display_name: "", fields: [], views: [] };
const roleItems = ["owner", "editor", "viewer"];

export function App() {
  const [catalog, setCatalog] = useState<Catalog>(demoCatalog);
  const [rows, setRows] = useState(initialRows);
  const [rowsViewName, setRowsViewName] = useState("all");
  const [view, setView] = useState<View>("table");
  const [selectedDatabaseName, setSelectedDatabaseName] = useState(demoCatalog.databases[0]?.name ?? "");
  const [selectedTable, setSelectedTable] = useState("contacts");
  const [selectedTableView, setSelectedTableView] = useState("all");
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(initialWorkflows);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeInfo[]>(initialWorkflowNodes);
  const [forms, setForms] = useState<FormDefinition[]>(initialForms);
  const [selectedWorkflowID, setSelectedWorkflowID] = useState(initialWorkflows[0]?.id ?? 0);
  const [selectedFormID, setSelectedFormID] = useState(initialForms[0]?.id ?? 0);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [oidcProviders, setOIDCProviders] = useState<OIDCProvider[]>([]);
  const [selectedRecordID, setSelectedRecordID] = useState(0);
  const [rowHistory, setRowHistory] = useState<RowChange[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunResponse[]>([]);
  const [selectedWorkflowRunKey, setSelectedWorkflowRunKey] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [workflowSecretsText, setWorkflowSecretsText] = useState("{}");
  const [workflowVariablesText, setWorkflowVariablesText] = useState("{}");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [newDatabaseName, setNewDatabaseName] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [status, setStatus] = useState("Ready");

  const database =
    catalog.databases.find((item) => item.name === selectedDatabaseName) ?? catalog.databases[0] ?? emptyDatabase;
  const table = database.tables.find((item) => item.name === selectedTable) ?? database.tables[0] ?? emptyTable;
  const activeFields = table.fields.filter((field) => !field.deleted);
  const selectedWorkflow = workflows.find((item) => item.id === selectedWorkflowID) ?? workflows[0];
  const selectedForm = forms.find((item) => item.id === selectedFormID) ?? forms[0];
  const displayedRows = useMemo(
    () => (rowsViewName === selectedTableView ? rows : applyTableView(rows, table.views ?? [], selectedTableView)),
    [rows, rowsViewName, table.views, selectedTableView]
  );
  const displayedRecordIDs = useMemo(
    () => displayedRows.map((row) => Number(row.record_id)).filter((recordID) => Number.isFinite(recordID)),
    [displayedRows]
  );
  const selectedWorkflowRun =
    workflowRuns.find((run) => run.history_key === selectedWorkflowRunKey) ?? workflowRuns[0] ?? null;
  const renderedForm = useMemo(() => renderFormScript(selectedForm?.script ?? ""), [selectedForm?.script]);

  useEffect(() => {
    setFormValues({});
  }, [selectedForm?.id, selectedForm?.script]);

  useEffect(() => {
    if (!catalog.databases.some((item) => item.name === selectedDatabaseName)) {
      setSelectedDatabaseName(catalog.databases[0]?.name ?? "");
      return;
    }
    if (!database.tables.some((item) => item.name === selectedTable)) {
      setSelectedTable(database.tables[0]?.name ?? "");
      setSelectedTableView("all");
    }
  }, [catalog.databases, database.tables, selectedDatabaseName, selectedTable]);

  useEffect(() => {
    let cancelled = false;
    if (!database.name) {
      setWorkflows([]);
      setForms([]);
      return () => {
        cancelled = true;
      };
    }
    const userID = currentUser ? undefined : "demo-user";
    void Promise.all([listWorkflows(database.name, userID), listForms(database.name, userID), loadWorkflowNodes()])
      .then(([nextWorkflows, nextForms, nextWorkflowNodes]) => {
        if (cancelled) {
          return;
        }
        setWorkflows(nextWorkflows);
        setForms(nextForms);
        setWorkflowNodes(nextWorkflowNodes);
        setSelectedWorkflowID(nextWorkflows[0]?.id ?? 0);
        setSelectedFormID(nextForms[0]?.id ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, database.name]);

  useEffect(() => {
    if (displayedRecordIDs.length === 0) {
      setSelectedRecordID(0);
      setRowHistory([]);
      return;
    }
    if (!displayedRecordIDs.includes(selectedRecordID)) {
      setSelectedRecordID(displayedRecordIDs[0]);
      setRowHistory([]);
    }
  }, [displayedRecordIDs, selectedRecordID]);

  useEffect(() => {
    let cancelled = false;
    void loadCurrentUser()
      .then((user) => {
        if (cancelled || !user) {
          return;
        }
        setCurrentUser(user);
        setStatus(`Signed in as ${user.email}`);
      })
      .catch(() => undefined);
    void listOIDCProviders()
      .then((providers) => {
        if (!cancelled) {
          setOIDCProviders(providers);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!database.name || !table.name) {
      setRows([]);
      setRowsViewName(selectedTableView);
      return () => {
        cancelled = true;
      };
    }
    const userID = currentUser ? undefined : "demo-user";
    void listRows(database.name, table.name, selectedTableView, userID)
      .then((nextRows) => {
        if (cancelled) {
          return;
        }
        setRows(nextRows.map(rowRecordToValues));
        setRowsViewName(selectedTableView);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, database.name, table.name, selectedTableView]);

  useEffect(() => {
    setWorkflowSecretsText(stringMapToJSON(selectedWorkflow?.secrets ?? {}));
    setWorkflowVariablesText(stringMapToJSON(selectedWorkflow?.variables ?? {}));
  }, [selectedWorkflow?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedWorkflow?.id) {
      setWorkflowRuns([]);
      setSelectedWorkflowRunKey("");
      return () => {
        cancelled = true;
      };
    }
    const userID = currentUser ? undefined : "demo-user";
    void listWorkflowRuns(selectedWorkflow.id, userID)
      .then((runs) => {
        if (cancelled) {
          return;
        }
        const newestFirst = [...runs].reverse();
        setWorkflowRuns(newestFirst);
        setSelectedWorkflowRunKey(newestFirst[0]?.history_key ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setWorkflowRuns([]);
          setSelectedWorkflowRunKey("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, selectedWorkflow?.id]);

  const columns = useMemo<GridColumn[]>(
    () => [
      { id: "record_id", title: "record_id", width: 96 },
      ...activeFields.map((field) => ({
        id: field.name,
        title: field.required ? `${field.name} *` : field.name,
        width: Math.max(128, field.name.length * 14)
      }))
    ],
    [activeFields]
  );

  const getCellContent = ([columnIndex, rowIndex]: Item): GridCell => {
    const column = columns[columnIndex];
    const row = displayedRows[rowIndex];
    const value = row?.[String(column.id)] ?? "";
    return {
      kind: GridCellKind.Text,
      allowOverlay: true,
      displayData: String(value),
      data: String(value)
    };
  };

  async function editCell([columnIndex, rowIndex]: Item, newValue: EditableGridCell) {
    const column = columns[columnIndex];
    const field = String(column.id);
    const row = displayedRows[rowIndex];
    if (!row || field === "record_id" || newValue.kind !== GridCellKind.Text) {
      return;
    }
    const recordID = Number(row.record_id);
    const nextValue = newValue.data;
    setRows((current) =>
      current.map((item) => (Number(item.record_id) === recordID ? { ...item, [field]: nextValue } : item))
    );
    try {
      const saved = await updateRow(
        database.name,
        table.name,
        recordID,
        { [field]: nextValue },
        currentUser ? undefined : "demo-user"
      );
      setRows((current) =>
        current.map((item) =>
          Number(item.record_id) === saved.record_id ? rowRecordToValues(saved) : item
        )
      );
      setRowsViewName("local");
      setSelectedRecordID(saved.record_id);
      setRowHistory([]);
      setStatus(`Updated record ${saved.record_id}`);
    } catch (error) {
      setStatus(error instanceof Error ? `Local edit: ${error.message}` : "Local edit saved");
    }
  }

  async function refreshMetadata() {
    try {
      const nextCatalog = await loadMetadata();
      setCatalog(nextCatalog);
      const dbName = nextCatalog.databases.some((item) => item.name === selectedDatabaseName)
        ? selectedDatabaseName
        : nextCatalog.databases[0]?.name;
      if (dbName) {
        setSelectedDatabaseName(dbName);
        const userID = currentUser ? undefined : "demo-user";
        const [nextWorkflows, nextForms, nextWorkflowNodes] = await Promise.all([
          listWorkflows(dbName, userID),
          listForms(dbName, userID),
          loadWorkflowNodes()
        ]);
        setWorkflows(nextWorkflows);
        setForms(nextForms);
        setWorkflowNodes(nextWorkflowNodes);
        setSelectedWorkflowID(nextWorkflows[0]?.id ?? 0);
        setSelectedFormID(nextForms[0]?.id ?? 0);
      }
      setStatus("Metadata and db-level resources refreshed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Metadata refresh failed");
    }
  }

  async function createDatabaseFromSidebar() {
    const name = newDatabaseName.trim();
    if (!name) {
      setStatus("Database name is required");
      return;
    }
    try {
      const userID = currentUser ? undefined : "demo-user";
      const saved = await createDatabase({ name, sqlite_path: `./data/${name}.sqlite` }, userID);
      const nextCatalog = await loadMetadata();
      setCatalog(nextCatalog);
      setSelectedDatabaseName(saved.name);
      setSelectedTable(saved.tables[0]?.name ?? "");
      setSelectedTableView("all");
      setRows([]);
      setRowsViewName("all");
      setNewDatabaseName("");
      setStatus(`Created database ${saved.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Database creation failed");
    }
  }

  async function createTableFromSidebar() {
    if (!database.name) {
      setStatus("Select a database before creating a table");
      return;
    }
    const name = newTableName.trim();
    if (!name) {
      setStatus("Table name is required");
      return;
    }
    try {
      const userID = currentUser ? undefined : "demo-user";
      const saved = await createTable(
        database.name,
        {
          name,
          display_name: name,
          fields: [{ name: "name", type: "text", required: true, deleted: false }],
          views: []
        },
        userID
      );
      const nextCatalog = await loadMetadata();
      setCatalog(nextCatalog);
      setSelectedTable(saved.name);
      setSelectedTableView("all");
      setRows([]);
      setRowsViewName("all");
      setNewTableName("");
      setStatus(`Created table ${database.name}.${saved.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Table creation failed");
    }
  }

  async function addDraftRow() {
    if (!database.name || !table.name) {
      setStatus("Create a table before adding rows");
      return;
    }
    const values = Object.fromEntries(activeFields.map((field) => [field.name, field.name === "status" ? "Review" : ""]));
    values.name = `New record ${rows.length + 1}`;
    try {
      const saved = await createRow(database.name, table.name, values, currentUser ? undefined : "demo-user");
      setRows((current) => [...current, rowRecordToValues(saved)]);
      setRowsViewName("local");
      setSelectedRecordID(saved.record_id);
      setRowHistory([]);
      setStatus(`Created record ${saved.record_id}`);
    } catch (error) {
      const localID = Math.max(0, ...rows.map((row) => Number(row.record_id))) + 1;
      setRows((current) => [...current, { record_id: localID, ...values }]);
      setRowsViewName("local");
      setSelectedRecordID(localID);
      setRowHistory([]);
      setStatus(error instanceof Error ? `Local draft: ${error.message}` : "Local draft added");
    }
  }

  async function persistWorkflow() {
    if (!selectedWorkflow) {
      return;
    }
    try {
      const saved = await saveWorkflow(database.name, selectedWorkflow, currentUser ? undefined : "demo-user");
      setWorkflows((current) => replaceResource(current, saved));
      setSelectedWorkflowID(saved.id ?? 0);
      setStatus(`Workflow saved as #${saved.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Workflow save failed");
    }
  }

  async function executeWorkflow() {
    if (!selectedWorkflow?.id) {
      setStatus("Save workflow before running");
      return;
    }
    const sampleRow = rows[0] ?? {};
    try {
      const response = await runWorkflow(selectedWorkflow.id, {
        ...sampleRow,
        record_id: Number(sampleRow.record_id ?? 1)
      }, currentUser ? undefined : "demo-user");
      setWorkflowRuns((current) => [response, ...current.filter((run) => run.history_key !== response.history_key)]);
      setSelectedWorkflowRunKey(response.history_key);
      if (response.run.error) {
        setStatus(`Workflow failed: ${response.run.error}`);
        return;
      }
      setStatus(`Workflow run saved: ${response.history_key}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Workflow run failed");
    }
  }

  async function persistForm() {
    if (!selectedForm) {
      return;
    }
    try {
      const saved = await saveForm(database.name, selectedForm, currentUser ? undefined : "demo-user");
      setForms((current) => replaceResource(current, saved));
      setSelectedFormID(saved.id ?? 0);
      setStatus(`Form saved as #${saved.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Form save failed");
    }
  }

  async function submitRenderedForm(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const values = Object.fromEntries(
      renderedForm.elements.flatMap((element) => {
        if (element.kind === "input") {
          return [[element.name, formValues[element.name] ?? ""]];
        }
        if (element.kind === "select") {
          return [[element.name, formValues[element.name] ?? element.options[0] ?? ""]];
        }
        return [];
      })
    );
    if (!currentUser) {
      const localID = Math.max(0, ...rows.map((row) => Number(row.record_id))) + 1;
      setRows((current) => [...current, { record_id: localID, ...values }]);
      setRowsViewName("local");
      setSelectedRecordID(localID);
      setRowHistory([]);
      setStatus("Local form submitted");
      return;
    }
    try {
      const saved = await createRow(database.name, table.name, values);
      setRows((current) => [...current, rowRecordToValues(saved)]);
      setRowsViewName("local");
      setSelectedRecordID(saved.record_id);
      setRowHistory([]);
      setStatus(`Form created record ${saved.record_id}`);
    } catch (error) {
      const localID = Math.max(0, ...rows.map((row) => Number(row.record_id))) + 1;
      setRows((current) => [...current, { record_id: localID, ...values }]);
      setRowsViewName("local");
      setSelectedRecordID(localID);
      setRowHistory([]);
      setStatus(error instanceof Error ? `Local form: ${error.message}` : "Local form submitted");
    }
  }

  async function registerUser() {
    try {
      const user = await register(authEmail, authPassword);
      setCurrentUser(user);
      setStatus(`Signed in as ${user.email}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registration failed");
    }
  }

  async function loginUser() {
    try {
      const user = await login(authEmail, authPassword);
      setCurrentUser(user);
      setStatus(`Signed in as ${user.email}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    }
  }

  async function logoutUser() {
    try {
      await logout();
      setCurrentUser(null);
      setStatus("Signed out");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Logout failed");
    }
  }

  function loginWithOIDC(providerName: string) {
    window.location.assign(oidcStartURL(providerName));
  }

  async function loadSelectedRowHistory() {
    if (!selectedRecordID) {
      setStatus("Select a row before loading history");
      return;
    }
    try {
      const userID = currentUser ? undefined : "demo-user";
      const changes = await listRowHistory(database.name, table.name, selectedRecordID, userID);
      setRowHistory(changes);
      setStatus(`Loaded ${changes.length} history entries for record ${selectedRecordID}`);
    } catch (error) {
      setRowHistory([]);
      setStatus(error instanceof Error ? error.message : "Row history failed");
    }
  }

  function updateSelectedWorkflowScript(script: string) {
    setWorkflows((current) =>
      current.map((item) => (item.id === selectedWorkflow?.id ? { ...item, script } : item))
    );
  }

  function updateSelectedWorkflowJSON(kind: "secrets" | "variables", text: string) {
    if (kind === "secrets") {
      setWorkflowSecretsText(text);
    } else {
      setWorkflowVariablesText(text);
    }
    const parsed = parseStringMap(text);
    if (!parsed.ok) {
      setStatus(parsed.error);
      return;
    }
    setStatus("Workflow config updated");
    setWorkflows((current) =>
      current.map((item) => (item.id === selectedWorkflow?.id ? { ...item, [kind]: parsed.value } : item))
    );
  }

  function updateSelectedFormScript(script: string) {
    setForms((current) => current.map((item) => (item.id === selectedForm?.id ? { ...item, script } : item)));
  }

  function updateFormValue(name: string, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="app-shell">
      <NavDrawer className="primary-sidebar" type="inline" open>
        <NavDrawerHeader>
          <AppItemStatic icon={<DatabaseRegular />}>codetable</AppItemStatic>
        </NavDrawerHeader>
        <NavDrawerBody>
        <div className="sidebar-heading">
          <Text size={200} weight="semibold">Databases</Text>
          <Button size="small" icon={<AddRegular />} aria-label="Create database" onClick={createDatabaseFromSidebar} />
        </div>
        <Nav
          className="database-nav"
          aria-label="Database list"
          density="small"
          selectedValue={`${database.name}:${view}`}
          selectedCategoryValue={database.name}
          openCategories={database.name ? [database.name] : []}
          onNavCategoryItemToggle={(_, data) => {
            const nextDatabase = catalog.databases.find((item) => item.name === data.value);
            if (!nextDatabase) {
              return;
            }
            setSelectedDatabaseName(nextDatabase.name);
            setSelectedTable(nextDatabase.tables[0]?.name ?? "");
            setSelectedTableView("all");
          }}
          onNavItemSelect={(_, data) => {
            const [dbName, nextView] = data.value.split(":");
            const nextDatabase = catalog.databases.find((item) => item.name === dbName);
            if (!nextDatabase || !isView(nextView)) {
              return;
            }
            setSelectedDatabaseName(dbName);
            setView(nextView);
            if (nextView === "table") {
              setSelectedTable(nextDatabase.tables[0]?.name ?? "");
              setSelectedTableView("all");
            }
          }}
        >
          {catalog.databases.map((item) => (
            <NavCategory key={item.name} value={item.name}>
              <NavCategoryItem icon={<DatabaseRegular />}>{item.name}</NavCategoryItem>
              <NavSubItemGroup>
                <NavSubItem value={`${item.name}:table`}>
                  Table
                </NavSubItem>
                <NavSubItem value={`${item.name}:workflow`}>
                  Workflow
                </NavSubItem>
                <NavSubItem value={`${item.name}:form`}>
                  Form
                </NavSubItem>
                <NavSubItem value={`${item.name}:permission`}>
                  Permission
                </NavSubItem>
              </NavSubItemGroup>
            </NavCategory>
          ))}
        </Nav>
        <NavDivider />
        <div className="primary-actions">
          <Input
            aria-label="New database name"
            placeholder="new database"
            value={newDatabaseName}
            onChange={(_, data) => setNewDatabaseName(data.value)}
          />
          <Button onClick={createDatabaseFromSidebar}>Create DB</Button>
        </div>
        <div className="account-slot">
          {currentUser ? (
            <Button icon={<PersonRegular />} onClick={logoutUser}>
              {currentUser.email}
            </Button>
          ) : (
            <Button icon={<PersonRegular />} appearance="primary" onClick={() => setAuthDialogOpen(true)}>
              Login
            </Button>
          )}
        </div>
        </NavDrawerBody>
      </NavDrawer>

      <NavDrawer className="secondary-sidebar" type="inline" open>
        <NavDrawerHeader>
        <div className="secondary-title">
          <Text weight="semibold">
            {view === "table" && "Tables"}
            {view === "workflow" && "Workflows"}
            {view === "form" && "Forms"}
            {view === "permission" && "Roles"}
          </Text>
          <Text size={200}>{database.name || "No database"}</Text>
        </div>
        </NavDrawerHeader>
        <NavDrawerBody>
        {view === "table" && (
          <>
            <Nav
              className="resource-nav"
              aria-label="Table list"
              density="small"
              selectedValue={table.name}
              onNavItemSelect={(_, data) => {
                setSelectedTable(data.value);
                setSelectedTableView("all");
              }}
            >
              <NavSectionHeader>Tables</NavSectionHeader>
              {database.tables.map((item) => (
                <NavItem
                  key={item.name}
                  value={item.name}
                  icon={<DocumentTableRegular />}
                >
                  {item.display_name || item.name}
                </NavItem>
              ))}
            </Nav>
            <div className="create-rowline">
              <Input
                aria-label="New table name"
                placeholder="new table"
                value={newTableName}
                onChange={(_, data) => setNewTableName(data.value)}
                disabled={!database.name}
              />
              <Button icon={<AddRegular />} aria-label="Create Table" onClick={createTableFromSidebar} disabled={!database.name} />
            </div>
            <div className="side-section">
              <Text size={200} weight="semibold">Views</Text>
              <Nav
                className="resource-nav"
                aria-label="View list"
                density="small"
                selectedValue={selectedTableView}
                onNavItemSelect={(_, data) => setSelectedTableView(data.value)}
              >
                <NavItem value="all" icon={<AppsListRegular />}>
                  All records
                </NavItem>
                {(table.views ?? []).map((item) => (
                  <NavItem
                    key={item.name}
                    value={item.name}
                    icon={<AppsListRegular />}
                  >
                    {item.display_name || item.name}
                  </NavItem>
                ))}
              </Nav>
            </div>
          </>
        )}
        {view === "workflow" && (
          <Nav
            className="resource-nav"
            aria-label="Workflow list"
            density="small"
            selectedValue={selectedWorkflow?.id ? String(selectedWorkflow.id) : ""}
            onNavItemSelect={(_, data) => setSelectedWorkflowID(Number(data.value))}
          >
            <NavSectionHeader>Workflows</NavSectionHeader>
            {workflows.map((item) => (
              <NavItem
                key={item.id ?? item.name}
                value={String(item.id ?? 0)}
                icon={<DocumentFlowchartRegular />}
              >
                {item.name}
              </NavItem>
            ))}
          </Nav>
        )}
        {view === "form" && (
          <Nav
            className="resource-nav"
            aria-label="Form list"
            density="small"
            selectedValue={selectedForm?.id ? String(selectedForm.id) : ""}
            onNavItemSelect={(_, data) => setSelectedFormID(Number(data.value))}
          >
            <NavSectionHeader>Forms</NavSectionHeader>
            {forms.map((item) => (
              <NavItem
                key={item.id ?? item.name}
                value={String(item.id ?? 0)}
                icon={<FormRegular />}
              >
                {item.name}
              </NavItem>
            ))}
          </Nav>
        )}
        {view === "permission" && (
          <Nav
            className="resource-nav"
            aria-label="Role list"
            density="small"
            selectedValue="owner"
          >
            <NavSectionHeader>Roles</NavSectionHeader>
            {roleItems.map((role) => (
              <NavItem key={role} value={role} icon={<PeopleRegular />}>
                {role}
              </NavItem>
            ))}
          </Nav>
        )}
        </NavDrawerBody>
      </NavDrawer>

      <main className="workspace">
        <header className="topbar">
          <div className="workspace-title">
            <Text weight="semibold">
              {database.name || "No database"}
              {view === "table" && table.name ? ` / ${table.display_name || table.name}` : ""}
              {view === "workflow" && selectedWorkflow ? ` / ${selectedWorkflow.name}` : ""}
              {view === "form" && selectedForm ? ` / ${selectedForm.name}` : ""}
              {view === "permission" ? " / permissions" : ""}
            </Text>
            <Text size={200}>
              {view === "table" && `${displayedRows.length} of ${rows.length} records`}
              {view === "workflow" && `${workflows.length} workflows`}
              {view === "form" && `${forms.length} forms`}
              {view === "permission" && `${roleItems.length} roles`}
            </Text>
          </div>
          <Toolbar aria-label="Workspace actions">
            <Tooltip content="Refresh metadata" relationship="label">
              <ToolbarButton aria-label="Refresh metadata" icon={<ArrowClockwiseRegular />} onClick={refreshMetadata} />
            </Tooltip>
            <Tooltip content="Create row" relationship="label">
              <ToolbarButton aria-label="Create row" icon={<AddRegular />} onClick={addDraftRow} disabled={view !== "table"} />
            </Tooltip>
          </Toolbar>
        </header>

        <section className="content-band">
          {view === "table" && (
            <div className="table-view">
              <div className="section-header">
                <div>
                  <Text weight="semibold">{table.display_name || table.name}</Text>
                  <Text size={200}>
                    {displayedRows.length} of {rows.length} records
                  </Text>
                </div>
                <div className="table-actions">
                  <Select
                    aria-label="History record"
                    value={selectedRecordID ? String(selectedRecordID) : ""}
                    onChange={(_, data) => setSelectedRecordID(Number(data.value))}
                    disabled={displayedRecordIDs.length === 0}
                  >
                    {displayedRecordIDs.length === 0 ? (
                      <option value="">No records</option>
                    ) : (
                      displayedRecordIDs.map((recordID) => (
                        <option key={recordID} value={recordID}>
                          record #{recordID}
                        </option>
                      ))
                    )}
                  </Select>
                  <Button onClick={loadSelectedRowHistory} disabled={!selectedRecordID}>
                    History
                  </Button>
                  <Button icon={<AddRegular />} appearance="primary" onClick={addDraftRow}>
                    Row
                  </Button>
                </div>
              </div>
              <div className="grid-host">
                <DataEditor
                  getCellContent={getCellContent}
                  onCellEdited={editCell}
                  onCellClicked={([, rowIndex]) => {
                    const recordID = Number(displayedRows[rowIndex]?.record_id);
                    if (Number.isFinite(recordID)) {
                      setSelectedRecordID(recordID);
                    }
                  }}
                  columns={columns}
                  rows={displayedRows.length}
                  rowMarkers="number"
                  smoothScrollX
                  smoothScrollY
                  width="100%"
                  height="100%"
                />
              </div>
              <div className="row-history-panel" aria-label="Row history">
                {rowHistory.length === 0 ? (
                  <Text size={200}>No row history loaded</Text>
                ) : (
                  rowHistory.map((change) => (
                    <div key={change.history_key} className="row-history-entry">
                      <div>
                        <Text weight="semibold">{change.history_key}</Text>
                        <Text size={200}>{new Date(change.timestamp).toLocaleString()}</Text>
                      </div>
                      <pre>{JSON.stringify(change.values, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {view === "workflow" && (
            <div className="split-view">
              <div className="editor-pane">
                <div className="section-header">
                  <div>
                    <Text weight="semibold">{selectedWorkflow?.name ?? "workflow"}.js</Text>
                    <Text size={200}>{database.name} workflow</Text>
                  </div>
                  <Button icon={<SaveRegular />} appearance="primary" onClick={persistWorkflow}>
                    Save
                  </Button>
                </div>
                <Textarea
                  className="code-editor"
                  value={selectedWorkflow?.script ?? ""}
                  onChange={(_, data) => updateSelectedWorkflowScript(data.value)}
                  resize="none"
                  aria-label="Workflow JavaScript"
                />
                <div className="workflow-config-grid">
                  <label className="field-stack">
                    <span>Variables JSON</span>
                    <Textarea
                      className="json-editor"
                      value={workflowVariablesText}
                      onChange={(_, data) => updateSelectedWorkflowJSON("variables", data.value)}
                      resize="none"
                      aria-label="Workflow Variables JSON"
                    />
                  </label>
                  <label className="field-stack">
                    <span>Secrets JSON</span>
                    <Textarea
                      className="json-editor"
                      value={workflowSecretsText}
                      onChange={(_, data) => updateSelectedWorkflowJSON("secrets", data.value)}
                      resize="none"
                      aria-label="Workflow Secrets JSON"
                    />
                  </label>
                </div>
              </div>
              <div className="history-pane">
                <Text weight="semibold">Nodes</Text>
                <div className="node-list">
                  {workflowNodes.map((node) => (
                    <div key={node.type} className={node.trigger ? "node-item trigger" : "node-item"}>
                      <div className="node-title">
                        <span>{node.type}</span>
                        <span>{node.stateless ? "stateless" : "stateful"}</span>
                      </div>
                      <Text size={200}>{node.description ?? node.display_name}</Text>
                      <div className="node-ports">
                        <span>in {formatPorts(node.inputs)}</span>
                        <span>out {formatPorts(node.outputs)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Text weight="semibold">Run flow</Text>
                {workflowRuns.length > 0 && (
                  <div className="run-history-list" aria-label="Workflow run history">
                    {workflowRuns.map((run) => (
                      <button
                        key={run.history_key}
                        className={run.history_key === selectedWorkflowRun?.history_key ? "run-history-item selected" : "run-history-item"}
                        type="button"
                        onClick={() => setSelectedWorkflowRunKey(run.history_key)}
                      >
                        <span>{run.history_key}</span>
                        <span>{new Date(run.run.timestamp).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flow-line" aria-label="Workflow run flow">
                  {selectedWorkflowRun && selectedWorkflowRun.run.steps.length > 0 ? (
                    selectedWorkflowRun.run.steps.map((step, index) => (
                      <span key={`${step.node_id}-${index}`} className={step.error ? "flow-step error" : "flow-step"}>
                        {step.error ? `${step.node_id}: ${step.error}` : step.node_id}
                      </span>
                    ))
                  ) : (
                    <span className="flow-empty">No runs yet</span>
                  )}
                </div>
                <Button icon={<PlayRegular />} onClick={executeWorkflow} disabled={!selectedWorkflow?.id}>
                  Run
                </Button>
              </div>
            </div>
          )}

          {view === "form" && (
            <div className="split-view">
              <div className="editor-pane">
                <div className="section-header">
                  <div>
                    <Text weight="semibold">{selectedForm?.name ?? "form"}.js</Text>
                    <Text size={200}>{database.name} form</Text>
                  </div>
                  <Button icon={<SaveRegular />} appearance="primary" onClick={persistForm}>
                    Save
                  </Button>
                </div>
                <Textarea
                  className="code-editor"
                  value={selectedForm?.script ?? ""}
                  onChange={(_, data) => updateSelectedFormScript(data.value)}
                  resize="none"
                  aria-label="Form JavaScript"
                />
              </div>
              <form className="form-preview" onSubmit={submitRenderedForm}>
                <Text weight="semibold">Preview</Text>
                {renderedForm.error && <Text className="form-error">{renderedForm.error}</Text>}
                {renderedForm.elements.map((element) => {
                  if (element.kind === "input") {
                    return (
                      <label key={element.name} className="field-stack">
                        <span>{element.label}</span>
                        <Input
                          type={element.inputType}
                          required={element.required}
                          value={formValues[element.name] ?? ""}
                          onChange={(_, data) => updateFormValue(element.name, data.value)}
                        />
                      </label>
                    );
                  }
                  if (element.kind === "select") {
                    return (
                      <label key={element.name} className="field-stack">
                        <span>{element.label}</span>
                        <Select
                          value={formValues[element.name] ?? element.options[0] ?? ""}
                          onChange={(_, data) => updateFormValue(element.name, data.value)}
                        >
                          {element.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </Select>
                      </label>
                    );
                  }
                  if (element.kind === "html") {
                    return <div key={element.html} className="form-html" dangerouslySetInnerHTML={{ __html: element.html }} />;
                  }
                  return (
                    <Button key={element.label} type="button" appearance="primary" onClick={() => void submitRenderedForm()}>
                      {element.label}
                    </Button>
                  );
                })}
              </form>
            </div>
          )}

          {view === "permission" && (
            <div className="permission-view">
              <div className="section-header">
                <div>
                  <Text weight="semibold">Permission</Text>
                  <Text size={200}>{database.name} role access matrix</Text>
                </div>
                <Button icon={<PeopleRegular />} disabled>
                  Add role
                </Button>
              </div>
              <div className="permission-grid">
                <div className="permission-card">
                  <Text weight="semibold">Tables</Text>
                  {database.tables.map((item) => (
                    <div key={item.name} className="permission-row">
                      <span>{item.name}</span>
                      <span>field read/write</span>
                    </div>
                  ))}
                </div>
                <div className="permission-card">
                  <Text weight="semibold">Workflows</Text>
                  {workflows.map((item) => (
                    <div key={item.id ?? item.name} className="permission-row">
                      <span>{item.name}</span>
                      <span>run/edit</span>
                    </div>
                  ))}
                </div>
                <div className="permission-card">
                  <Text weight="semibold">Forms</Text>
                  {forms.map((item) => (
                    <div key={item.id ?? item.name} className="permission-row">
                      <span>{item.name}</span>
                      <span>submit/edit</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="statusbar">{status}</footer>
      </main>

      <Dialog open={authDialogOpen} onOpenChange={(_, data) => setAuthDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Login</DialogTitle>
            <DialogContent>
              <div className="auth-modal">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={authEmail}
                  onChange={(_, data) => setAuthEmail(data.value)}
                />
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={authPassword}
                  onChange={(_, data) => setAuthPassword(data.value)}
                />
                {oidcProviders.length > 0 && (
                  <div className="oidc-actions">
                    {oidcProviders.map((provider) => (
                      <Button key={provider.name} onClick={() => loginWithOIDC(provider.name)}>
                        Continue with {provider.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={async () => {
                  await loginUser();
                  setAuthDialogOpen(false);
                }}
              >
                Login
              </Button>
              <Button
                appearance="primary"
                onClick={async () => {
                  await registerUser();
                  setAuthDialogOpen(false);
                }}
              >
                Register
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function replaceResource<T extends { id?: number }>(items: T[], saved: T): T[] {
  if (!saved.id) {
    return items;
  }
  if (!items.some((item) => item.id === saved.id)) {
    return [...items, saved];
  }
  return items.map((item) => (item.id === saved.id ? saved : item));
}

function isView(value: string): value is View {
  return value === "table" || value === "workflow" || value === "form" || value === "permission";
}

function rowRecordToValues(row: RowRecord): Record<string, unknown> {
  return { record_id: row.record_id, ...row.values };
}

function stringMapToJSON(values: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify(sorted, null, 2);
}

function parseStringMap(text: string): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return { ok: false, error: "Workflow config must be a JSON object" };
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      return { ok: false, error: `Workflow config value for ${key} must be a string` };
    }
    values[key] = value;
  }
  return { ok: true, value: values };
}

function formatPorts(ports: Array<{ name: string; type: string }>): string {
  if (ports.length === 0) {
    return "none";
  }
  return ports.map((port) => `${port.name}:${port.type}`).join(", ");
}

function applyTableView(rows: Array<Record<string, unknown>>, views: TableView[], selectedView: string) {
  if (selectedView === "all") {
    return rows;
  }
  const resolved = resolveTableView(views, selectedView, new Set());
  if (!resolved) {
    return rows;
  }
  const filtered = rows.filter((row) =>
    resolved.filters.every((filter) => {
      const value = rowValue(row, filter.field);
      if (filter.op === "eq") {
        return String(value) === String(filter.value);
      }
      if (filter.op === "contains") {
        return String(value).toLowerCase().includes(String(filter.value ?? "").toLowerCase());
      }
      if (filter.op === "not_empty") {
        return value !== undefined && value !== null && String(value).trim() !== "";
      }
      return false;
    })
  );
  return [...filtered].sort((left, right) => {
    for (const sortDef of resolved.sorts) {
      const leftValue = String(rowValue(left, sortDef.field));
      const rightValue = String(rowValue(right, sortDef.field));
      if (leftValue === rightValue) {
        continue;
      }
      return sortDef.direction === "desc" ? rightValue.localeCompare(leftValue) : leftValue.localeCompare(rightValue);
    }
    return Number(left.record_id ?? 0) - Number(right.record_id ?? 0);
  });
}

function resolveTableView(views: TableView[], name: string, visiting: Set<string>): TableView | undefined {
  const view = views.find((item) => item.name === name);
  if (!view || visiting.has(name)) {
    return undefined;
  }
  visiting.add(name);
  if (!view.base_view) {
    visiting.delete(name);
    return view;
  }
  const base = resolveTableView(views, view.base_view, visiting);
  visiting.delete(name);
  if (!base) {
    return view;
  }
  return {
    ...view,
    filters: [...base.filters, ...view.filters],
    sorts: [...base.sorts, ...view.sorts]
  };
}

function rowValue(row: Record<string, unknown>, field: string) {
  return row[field];
}
