## 查询记录

通过后端 table API 查询记录。权限使用 workflow 创建者的权限。

这个节点使用和公开 `POST /api/tables/{database}/{table}/rows/query` API 一致的查询结构。

### 输入

- `database` (`string`): 可选数据库名，默认使用 workflow 所属数据库。
- `table` (`string`): 目标表名。
- `view` (`string`): 可选视图名。视图的 filter 和 sort 会先应用。
- `query` (`object`): 可选查询对象。可以传完整 `ViewQuery`，也可以传简写 `{ field, op/operator, value }`。
- `sorts` (`object[]`): 可选排序定义，例如 `{ field: "name", direction: "asc" }`。
- `limit` (`int`): 可选最大返回记录数。

### 输出

- `rows` (`RowRecord[]`): 匹配的记录列表。

### 示例

```js
/**
 * @param {AutableWorkflowDefinitionInfo} info
 * @returns {Record<string, string | AutableWorkflowInstanceDeclaration>}
 */
function instances(info) {
  return { query_contacts: "table.row.query" };
}

/**
 * @param {AutableWorkflowRunInfo} info
 * @returns {Record<string, unknown>}
 */
function run(info) {
  const result = info.instance("query_contacts").exec({
    table: "contacts",
    query: { field: "email", operator: "=", value: "ada@example.com" },
    limit: 1
  });
  return { count: result.rows.length, rows: result.rows };
}
```
