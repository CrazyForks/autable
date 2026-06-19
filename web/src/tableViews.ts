import type { TableView } from "./api";

export function resolveTableView(views: TableView[], name: string, visiting: Set<string>): TableView | undefined {
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
    return undefined;
  }
  return {
    ...view,
    query: combineQueries(base.query, view.query),
    sorts: [...base.sorts, ...view.sorts]
  };
}

function combineQueries(base: TableView["query"], child: TableView["query"]): TableView["query"] {
  if (!base) {
    return child;
  }
  if (!child) {
    return base;
  }
  return {
    combinator: "and",
    rules: [
      { combinator: base.combinator, rules: base.rules, ...(base.not ? { not: true } : {}) },
      { combinator: child.combinator, rules: child.rules, ...(child.not ? { not: true } : {}) }
    ]
  };
}
