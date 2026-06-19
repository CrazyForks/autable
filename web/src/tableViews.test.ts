import { describe, expect, it } from "vitest";
import { resolveTableView } from "./tableViews";
import type { TableView } from "./api";

const views: TableView[] = [
  {
    name: "active",
    display_name: "Active",
    query: { combinator: "and", rules: [{ field: "status", operator: "=", value: "Active" }] },
    sorts: []
  },
  {
    name: "active-desc",
    display_name: "Active desc",
    base_view: "active",
    query: { combinator: "and", rules: [{ field: "name", operator: "contains", value: "a" }] },
    sorts: [{ field: "name", direction: "desc" }]
  }
];

describe("tableViews", () => {
  it("resolves inherited query and sorts", () => {
    expect(resolveTableView(views, "active-desc", new Set())).toEqual(
      expect.objectContaining({
        name: "active-desc",
        query: {
          combinator: "and",
          rules: [
            { combinator: "and", rules: [{ field: "status", operator: "=", value: "Active" }] },
            { combinator: "and", rules: [{ field: "name", operator: "contains", value: "a" }] }
          ]
        },
        sorts: [{ field: "name", direction: "desc" }]
      })
    );
  });

  it("handles missing and cyclic views without recursing forever", () => {
    const cyclic: TableView[] = [
      { name: "a", display_name: "a", base_view: "b", query: { combinator: "and", rules: [] }, sorts: [] },
      { name: "b", display_name: "b", base_view: "a", sorts: [] }
    ];

    expect(resolveTableView(views, "missing", new Set())).toBeUndefined();
    expect(resolveTableView(cyclic, "a", new Set())).toBeUndefined();
  });
});
