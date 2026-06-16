import { expect, type Page, test } from "@playwright/test";

type AuthUser = {
  id: string;
  email: string;
  provider: string;
};

let sequence = 0;

test.describe.configure({ mode: "serial" });

async function registerUser(page: Page): Promise<AuthUser> {
  sequence += 1;
  const email = `person-${Date.now()}-${sequence}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Login" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill("correct horse");
  await dialog.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("button", { name: email })).toBeVisible();
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      throw new Error(`auth/me failed: ${response.status}`);
    }
    return (await response.json()) as AuthUser;
  });
}

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method: requestMethod, path: requestPath, body: requestBody }) => {
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: requestBody === undefined ? undefined : { "Content-Type": "application/json" },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody)
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(`${requestMethod} ${requestPath} failed: ${response.status} ${text}`);
      }
      return json;
    },
    { method, path, body }
  );
}

async function grant(page: Page, userID: string, grantBody: Record<string, unknown>) {
  await api(page, "POST", "/api/permissions/grants", {
    subject_id: userID,
    field: "",
    ...grantBody
  });
}

async function setupWorkspace(page: Page) {
  const user = await registerUser(page);
  const suffix = `${Date.now()}-${sequence}`;
  await grant(page, user.id, { scope: "database", resource: "workspace", level: 2 });
  await grant(page, user.id, { scope: "table", resource: "workspace.contacts", level: 2 });
  await api(page, "POST", "/api/tables/workspace/contacts/rows", {
    values: { name: "Ada Lovelace", email: "ada@example.com", status: "Active" }
  });
  await api(page, "POST", "/api/databases/workspace/workflows", {
    database_name: "workspace",
    name: `welcome-contact-${suffix}`,
    script:
      'function run(info) { const echoed = info.node("echo", { value: info.inputs.name }); return { message: echoed.value }; }',
    secrets: {},
    variables: {}
  });
  await api(page, "POST", "/api/databases/workspace/forms", {
    database_name: "workspace",
    name: `quick-status-${suffix}`,
    script:
      "root.append(api.input({ name: 'name', label: 'Name', required: true }), api.input({ name: 'email', label: 'Email', type: 'email' }), api.select({ name: 'status', label: 'Status', options: ['Active', 'Review'] }), api.submit('Create record'));"
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Contacts/ })).toBeVisible();
  return user;
}

test("covers login modal and workspace navigation through the real backend", async ({ page }) => {
  await setupWorkspace(page);

  await expect(page.getByRole("button", { name: "Table", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await expect(page.getByRole("button", { name: /welcome-contact/ })).toBeVisible();
  await page.getByRole("button", { name: "Form", exact: true }).click();
  await expect(page.getByRole("button", { name: /quick-status/ })).toBeVisible();
  await page.getByRole("button", { name: "Permission", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
});

test("covers database and table creation through the real backend", async ({ page }) => {
  await setupWorkspace(page);

  const suffix = `${Date.now()}-${sequence}`;
  const databaseName = `sales${suffix}`;
  const tableName = `projects${suffix}`;
  await page.getByRole("textbox", { name: "New database name" }).fill(databaseName);
  await page.getByRole("button", { name: "Create DB" }).click();
  await expect(page.getByRole("button", { name: databaseName })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(`Created database ${databaseName}`)).toBeVisible();

  await page.getByRole("textbox", { name: "New table name" }).fill(tableName);
  await page.getByRole("button", { name: "Create Table" }).click();
  await expect(page.getByRole("button", { name: tableName })).toBeVisible();
  await expect(page.getByText(`Created table ${databaseName}.${tableName}`)).toBeVisible();
});

test("covers table views, row creation, and row history through the real backend", async ({ page }) => {
  await setupWorkspace(page);

  await expect(page.getByText(/\d+ of \d+ records/).first()).toBeVisible();
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page.getByText(/\d+ of \d+ records/).first()).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText(/rhistory_workspace_contacts_/)).toBeVisible();
  await page.getByRole("button", { name: "Row", exact: true }).click();
  await expect(page.getByText(/Created record \d+/)).toBeVisible();
});

test("covers workflow editor, node list, and run history through the real backend", async ({ page }) => {
  await setupWorkspace(page);

  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await expect(page.getByLabel("Workflow JavaScript")).toHaveValue(/info\.node/);
  await expect(page.getByText("echo").first()).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Workflow run saved: whistory_/)).toBeVisible();
  await expect(page.getByRole("button", { name: /whistory_/ })).toBeVisible();
});

test("covers form runtime preview and submit through the real backend", async ({ page }) => {
  await setupWorkspace(page);

  await page.getByRole("button", { name: "Form", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Margaret Hamilton");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("margaret@example.com");
  await page.getByRole("combobox").selectOption("Review");
  await page.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByText(/Form created record \d+/)).toBeVisible();
});

test("covers role members and resource permission grants through the real backend", async ({ page }) => {
  const user = await setupWorkspace(page);

  await page.getByRole("button", { name: "Permission", exact: true }).click();
  await page.getByRole("textbox", { name: "New role name" }).fill("editor");
  await page.getByRole("button", { name: "Create Role" }).click();
  await expect(page.getByRole("button", { name: /editor/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Role member user id" }).fill(user.id);
  await page.getByRole("button", { name: "Add role member" }).click();
  await expect(page.getByText(user.id)).toBeVisible();
  await page.getByLabel("contacts permission").selectOption("2");
  await page.getByLabel("email permission").selectOption("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved role editor")).toBeVisible();

  const roles = (await api(page, "GET", "/api/databases/workspace/roles")) as Array<{
    name: string;
    grants: Array<{ scope: string; resource: string; field: string; level: number }>;
    members: string[];
  }>;
  const role = roles.find((item) => item.name === "editor");
  expect(role?.members).toContain(user.id);
  expect(role?.grants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ scope: "table", resource: "workspace.contacts", field: "", level: 2 }),
      expect.objectContaining({ scope: "field", resource: "workspace.contacts", field: "email", level: 1 })
    ])
  );
});
