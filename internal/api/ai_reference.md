# Autable AI Editing Reference

Autable stores table definitions in `metadata/main.yml`. Workflows and forms are JavaScript files that belong to an existing database resource. AI editing is restricted to the current existing `workflow.js` or `form.js`; do not create, rename, delete, or move files.

## Workflows

Workflow scripts export a JavaScript object. The object declares `trigger`, `instances`, and `run`.

```js
export default {
  trigger: {
    node: "table.recordChanged",
    params: { database: "main", table: "items", operation: "create" }
  },
  instances: {
    queryRows: { node: "table.row.query" }
  },
  async run({ input, nodes, info }) {
    const rows = await nodes.queryRows.run({
      database: info.database,
      table: "items",
      query: { combinator: "and", rules: [{ field: "status", operator: "=", value: "open" }] }
    });
    return { rows };
  }
};
```

Keep node function type comments from existing workflow scripts intact. They drive editor type hints and document the expected inputs and outputs.

## Forms

Form scripts export an object that describes the target table, fields, optional actions, and submit behavior. Forms should keep table and field names aligned with `metadata/main.yml`.

## Table Query Rules

Structured queries use `{ combinator, rules, not }`. A list under `rules` is combined by the parent `combinator`; use `"and"` when every rule must match and `"or"` when any rule may match. Rules can be nested.

```js
{
  combinator: "and",
  rules: [
    { field: "userid", operator: "contains", value: "abc" },
    { field: "userid", operator: "beginsWith", value: "01" }
  ]
}
```

Prefer existing node APIs over direct database access. Keep secrets in node instance secrets or workflow variables, never hard-coded in generated JavaScript.
