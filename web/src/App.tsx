import { useMemo, useState } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  Tab,
  TabList,
  Text,
  Textarea,
  Toolbar,
  ToolbarButton,
  Tooltip
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowClockwiseRegular,
  DatabaseRegular,
  PlayRegular,
  SaveRegular
} from "@fluentui/react-icons";
import DataEditor, {
  type GridCell,
  GridCellKind,
  type GridColumn,
  type Item
} from "@glideapps/glide-data-grid";
import { demoCatalog, initialForms, initialRows, initialWorkflows } from "./demoData";
import { previewFormElements } from "./formRuntime";
import {
  createRow,
  listForms,
  listWorkflows,
  loadMetadata,
  saveForm,
  saveWorkflow,
  type Catalog,
  type FormDefinition,
  type TableView,
  type WorkflowDefinition
} from "./api";

type View = "table" | "workflow" | "form";

export function App() {
  const [catalog, setCatalog] = useState<Catalog>(demoCatalog);
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = useState<View>("table");
  const [selectedTable, setSelectedTable] = useState("contacts");
  const [selectedTableView, setSelectedTableView] = useState("all");
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(initialWorkflows);
  const [forms, setForms] = useState<FormDefinition[]>(initialForms);
  const [selectedWorkflowID, setSelectedWorkflowID] = useState(initialWorkflows[0]?.id ?? 0);
  const [selectedFormID, setSelectedFormID] = useState(initialForms[0]?.id ?? 0);
  const [status, setStatus] = useState("Ready");

  const database = catalog.databases[0];
  const table = database.tables.find((item) => item.name === selectedTable) ?? database.tables[0];
  const activeFields = table.fields.filter((field) => !field.deleted);
  const selectedWorkflow = workflows.find((item) => item.id === selectedWorkflowID) ?? workflows[0];
  const selectedForm = forms.find((item) => item.id === selectedFormID) ?? forms[0];
  const displayedRows = useMemo(
    () => applyTableView(rows, table.views ?? [], selectedTableView),
    [rows, table.views, selectedTableView]
  );

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

  async function refreshMetadata() {
    try {
      const nextCatalog = await loadMetadata();
      setCatalog(nextCatalog);
      const dbName = nextCatalog.databases[0]?.name;
      if (dbName) {
        const [nextWorkflows, nextForms] = await Promise.all([listWorkflows(dbName), listForms(dbName)]);
        setWorkflows(nextWorkflows);
        setForms(nextForms);
        setSelectedWorkflowID(nextWorkflows[0]?.id ?? 0);
        setSelectedFormID(nextForms[0]?.id ?? 0);
      }
      setStatus("Metadata and db-level resources refreshed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Metadata refresh failed");
    }
  }

  async function addDraftRow() {
    const values = Object.fromEntries(activeFields.map((field) => [field.name, field.name === "status" ? "Review" : ""]));
    values.name = `New record ${rows.length + 1}`;
    try {
      const saved = await createRow(database.name, table.name, values);
      setRows((current) => [...current, { record_id: saved.record_id, ...saved.values }]);
      setStatus(`Created record ${saved.record_id}`);
    } catch (error) {
      const localID = Math.max(0, ...rows.map((row) => Number(row.record_id))) + 1;
      setRows((current) => [...current, { record_id: localID, ...values }]);
      setStatus(error instanceof Error ? `Local draft: ${error.message}` : "Local draft added");
    }
  }

  async function persistWorkflow() {
    if (!selectedWorkflow) {
      return;
    }
    try {
      const saved = await saveWorkflow(database.name, selectedWorkflow);
      setWorkflows((current) => replaceResource(current, saved));
      setSelectedWorkflowID(saved.id ?? 0);
      setStatus(`Workflow saved as #${saved.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Workflow save failed");
    }
  }

  async function persistForm() {
    if (!selectedForm) {
      return;
    }
    try {
      const saved = await saveForm(database.name, selectedForm);
      setForms((current) => replaceResource(current, saved));
      setSelectedFormID(saved.id ?? 0);
      setStatus(`Form saved as #${saved.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Form save failed");
    }
  }

  function updateSelectedWorkflowScript(script: string) {
    setWorkflows((current) =>
      current.map((item) => (item.id === selectedWorkflow?.id ? { ...item, script } : item))
    );
  }

  function updateSelectedFormScript(script: string) {
    setForms((current) => current.map((item) => (item.id === selectedForm?.id ? { ...item, script } : item)));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <DatabaseRegular />
          <Text weight="semibold">codetable</Text>
        </div>
        <Label htmlFor="table-select">Table</Label>
        <Select id="table-select" value={selectedTable} onChange={(_, data) => setSelectedTable(data.value)}>
          {database.tables.map((item) => (
            <option key={item.name} value={item.name}>
              {item.display_name || item.name}
            </option>
          ))}
        </Select>
        <Label htmlFor="view-select">View</Label>
        <Select id="view-select" value={selectedTableView} onChange={(_, data) => setSelectedTableView(data.value)}>
          <option value="all">All records</option>
          {(table.views ?? []).map((item) => (
            <option key={item.name} value={item.name}>
              {item.display_name || item.name}
            </option>
          ))}
        </Select>
        <div className="metadata-block">
          <Text size={200}>{database.name}</Text>
          <Text size={200}>{database.sqlite_path}</Text>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <TabList selectedValue={view} onTabSelect={(_, data) => setView(data.value as View)}>
            <Tab value="table">Table</Tab>
            <Tab value="workflow">Workflow</Tab>
            <Tab value="form">Form</Tab>
          </TabList>
          <Toolbar aria-label="Workspace actions">
            <Tooltip content="Refresh metadata" relationship="label">
              <ToolbarButton aria-label="Refresh metadata" icon={<ArrowClockwiseRegular />} onClick={refreshMetadata} />
            </Tooltip>
            <Tooltip content="Create row" relationship="label">
              <ToolbarButton aria-label="Create row" icon={<AddRegular />} onClick={addDraftRow} />
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
                <Button icon={<AddRegular />} appearance="primary" onClick={addDraftRow}>
                  Row
                </Button>
              </div>
              <div className="grid-host">
                <DataEditor
                  getCellContent={getCellContent}
                  columns={columns}
                  rows={displayedRows.length}
                  rowMarkers="number"
                  smoothScrollX
                  smoothScrollY
                  width="100%"
                  height="100%"
                />
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
              </div>
              <div className="history-pane">
                <Text weight="semibold">Workflows</Text>
                <div className="resource-list">
                  {workflows.map((item) => (
                    <button
                      key={item.id ?? item.name}
                      className={item.id === selectedWorkflow?.id ? "resource-item selected" : "resource-item"}
                      type="button"
                      onClick={() => setSelectedWorkflowID(item.id ?? 0)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <Text weight="semibold">Run flow</Text>
                <div className="flow-line">
                  <span>trigger.recordChanged</span>
                  <span>table.getRecord</span>
                  <span>notification.send</span>
                </div>
                <Button icon={<PlayRegular />}>Run</Button>
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
              <form className="form-preview">
                <Text weight="semibold">Forms</Text>
                <div className="resource-list">
                  {forms.map((item) => (
                    <button
                      key={item.id ?? item.name}
                      className={item.id === selectedForm?.id ? "resource-item selected" : "resource-item"}
                      type="button"
                      onClick={() => setSelectedFormID(item.id ?? 0)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                {previewFormElements().map((element) => {
                  if (element.kind === "input") {
                    return (
                      <label key={element.name} className="field-stack">
                        <span>{element.label}</span>
                        <Input type={element.inputType} required={element.required} />
                      </label>
                    );
                  }
                  if (element.kind === "select") {
                    return (
                      <label key={element.name} className="field-stack">
                        <span>{element.label}</span>
                        <Select>
                          {element.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </Select>
                      </label>
                    );
                  }
                  return (
                    <Button key={element.label} appearance="primary">
                      {element.label}
                    </Button>
                  );
                })}
              </form>
            </div>
          )}
        </section>

        <footer className="statusbar">{status}</footer>
      </main>
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
