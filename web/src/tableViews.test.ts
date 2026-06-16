import { describe, expect, it } from "vitest";
import { applyTableView, resolveTableView } from "./tableViews";
import type { TableView } from "./api";

const views: TableView[] = [
  {
    name: "active",
    display_name: "Active",
    filters: [{ field: "status", op: "eq", value: "Active" }],
    sorts: []
  },
  {
    name: "active-desc",
    display_name: "Active desc",
    base_view: "active",
    filters: [{ field: "name", op: "contains", value: "a" }],
    sorts: [{ field: "name", direction: "desc" }]
  }
];

describe("tableViews", () => {
  it("applies base view filters and child sorts", () => {
    const rows = [
      { record_id: 1, name: "Ada", status: "Active" },
      { record_id: 2, name: "Grace", status: "Active" },
      { record_id: 3, name: "Linus", status: "Archived" }
    ];

    expect(applyTableView(rows, views, "active-desc").map((row) => row.name)).toEqual(["Grace", "Ada"]);
  });

  it("resolves inherited filters and sorts", () => {
    expect(resolveTableView(views, "active-desc", new Set())).toEqual(
      expect.objectContaining({
        name: "active-desc",
        filters: [
          { field: "status", op: "eq", value: "Active" },
          { field: "name", op: "contains", value: "a" }
        ],
        sorts: [{ field: "name", direction: "desc" }]
      })
    );
  });

  it("handles missing and cyclic views without recursing forever", () => {
    const rows = [{ record_id: 1, name: "Ada" }];
    const cyclic: TableView[] = [
      { name: "a", display_name: "a", base_view: "b", filters: [{ field: "name", op: "eq", value: "Grace" }], sorts: [] },
      { name: "b", display_name: "b", base_view: "a", filters: [], sorts: [] }
    ];

    expect(applyTableView(rows, views, "missing")).toBe(rows);
    expect(applyTableView(rows, cyclic, "a")).toEqual([]);
  });
});
