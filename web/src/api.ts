export type Field = {
  name: string;
  type: string;
  required: boolean;
  deleted: boolean;
};

export type TableViewFilter = {
  field: string;
  op: "eq" | "contains" | "not_empty";
  value?: unknown;
};

export type TableViewSort = {
  field: string;
  direction: "asc" | "desc";
};

export type TableView = {
  name: string;
  display_name: string;
  base_view?: string;
  filters: TableViewFilter[];
  sorts: TableViewSort[];
};

export type TableMetadata = {
  name: string;
  display_name: string;
  fields: Field[];
  views: TableView[];
};

export type DatabaseMetadata = {
  name: string;
  sqlite_path: string;
  tables: TableMetadata[];
};

export type Catalog = {
  databases: DatabaseMetadata[];
};

export type RowChange = {
  database: string;
  table: string;
  record_id: number;
  timestamp: string;
  values: Record<string, unknown>;
  actor_id?: string;
};

export type WorkflowDefinition = {
  id?: number;
  database_name: string;
  name: string;
  script: string;
  secrets: Record<string, string>;
  variables: Record<string, string>;
};

export type FormDefinition = {
  id?: number;
  database_name: string;
  name: string;
  script: string;
};

export async function loadMetadata(): Promise<Catalog> {
  const response = await fetch("/api/metadata");
  if (!response.ok) {
    throw new Error(`metadata request failed: ${response.status}`);
  }
  return response.json() as Promise<Catalog>;
}

export async function createRow(
  dbName: string,
  tableName: string,
  values: Record<string, unknown>,
  userID = "demo-user"
): Promise<{ record_id: number; values: Record<string, unknown> }> {
  const response = await fetch(`/api/tables/${dbName}/${tableName}/rows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Codetable-User": userID
    },
    body: JSON.stringify({ values })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? "row creation failed");
  }
  return response.json() as Promise<{ record_id: number; values: Record<string, unknown> }>;
}

export async function listWorkflows(dbName: string): Promise<WorkflowDefinition[]> {
  const response = await fetch(`/api/databases/${dbName}/workflows`);
  if (!response.ok) {
    throw new Error(`workflow list failed: ${response.status}`);
  }
  return response.json() as Promise<WorkflowDefinition[]>;
}

export async function saveWorkflow(dbName: string, workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
  const response = await fetch(`/api/databases/${dbName}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow)
  });
  if (!response.ok) {
    throw new Error(`workflow save failed: ${response.status}`);
  }
  return response.json() as Promise<WorkflowDefinition>;
}

export async function listForms(dbName: string): Promise<FormDefinition[]> {
  const response = await fetch(`/api/databases/${dbName}/forms`);
  if (!response.ok) {
    throw new Error(`form list failed: ${response.status}`);
  }
  return response.json() as Promise<FormDefinition[]>;
}

export async function saveForm(dbName: string, form: FormDefinition): Promise<FormDefinition> {
  const response = await fetch(`/api/databases/${dbName}/forms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form)
  });
  if (!response.ok) {
    throw new Error(`form save failed: ${response.status}`);
  }
  return response.json() as Promise<FormDefinition>;
}
