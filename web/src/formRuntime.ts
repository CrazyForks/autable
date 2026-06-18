export type FormElement =
  | {
      kind: "input";
      field: string;
      label: string;
      inputType: "text" | "email" | "search" | "tel" | "url" | "password";
    }
  | { kind: "select"; field: string; label: string; options: string[] }
  | { kind: "relation"; field: string; label: string; table: string; view?: string }
  | { kind: "submit"; label: string }
  | { kind: "html"; html: string };

type InputType = Extract<FormElement, { kind: "input" }>["inputType"];

export type FormRenderResult = {
  elements: FormElement[];
  table?: string;
  fields?: Record<string, string>;
  error?: string;
};

type InputConfig = {
  field: string;
  label?: string;
  type?: string;
};

type SelectConfig = {
  field: string;
  label?: string;
  options?: string[];
};

type RelationConfig = {
  field: string;
  label?: string;
  table: string;
  view?: string;
};

const inputTypes = new Set<InputType>(["text", "email", "search", "tel", "url", "password"]);

export function renderFormScript(script: string): FormRenderResult {
  const elements: FormElement[] = [];
  const rootElement = typeof document === "undefined" ? undefined : document.createElement("div");
  const root = {
    element: rootElement,
    append: (...items: Array<FormElement | FormElement[] | string | Node>) => {
      for (const item of items.flat()) {
        appendFormItem(elements, rootElement, item);
      }
    },
    appendChild: (item: FormElement | string | Node) => {
      appendFormItem(elements, rootElement, item);
    }
  };
  const api = {
    input: (config: InputConfig): FormElement => {
      const field = formControlField(config);
      return {
        kind: "input",
        field,
        label: config.label ?? field,
        inputType: normalizeInputType(config.type)
      };
    },
    select: (config: SelectConfig): FormElement => {
      const field = formControlField(config);
      return {
        kind: "select",
        field,
        label: config.label ?? field,
        options: Array.isArray(config.options) ? config.options.map(String) : []
      };
    },
    relation: (config: RelationConfig): FormElement => {
      const field = formControlField(config);
      return {
        kind: "relation",
        field,
        label: config.label ?? field,
        table: String(config.table),
        view: config.view ? String(config.view) : undefined
      };
    },
    submit: (label: string): FormElement => ({
      kind: "submit",
      label: String(label)
    })
  };

  try {
    const run = new Function("api", "root", `"use strict";\n${script}\nreturn render(api, root);`);
    const returned = run(api, root);
    const definition = formDefinitionFromValue(returned);
    if (rootElement && rootElement.childNodes.length > 0) {
      elements.push({ kind: "html", html: rootElement.innerHTML });
    }
    const fields = Object.fromEntries(elements.flatMap((element) => ("field" in element ? [[element.field, element.field]] : [])));
    return { elements, table: definition.table, fields };
  } catch (error) {
    return {
      elements: [],
      error: error instanceof Error ? error.message : "Form script failed"
    };
  }
}

function formDefinitionFromValue(value: unknown): Required<Pick<FormRenderResult, "table" | "fields">> {
  if (!value || typeof value !== "object") {
    throw new Error("form render must return a definition object");
  }
  const maybeDefinition = value as { table?: unknown };
  if (typeof maybeDefinition.table !== "string" || maybeDefinition.table === "") {
    throw new Error("form render must return table");
  }
  return { table: maybeDefinition.table, fields: {} };
}

function normalizeInputType(value: string | undefined): InputType {
  if (value && inputTypes.has(value as InputType)) {
    return value as InputType;
  }
  return "text";
}

function formControlField(config: unknown): string {
  if (!config || typeof config !== "object") {
    throw new Error("form controls require field");
  }
  const field = (config as { field?: unknown }).field;
  if (typeof field !== "string" || field === "") {
    throw new Error("form controls require field");
  }
  return field;
}

function appendFormItem(elements: FormElement[], rootElement: HTMLDivElement | undefined, item: FormElement | string | Node) {
  if (isFormElement(item)) {
    elements.push(item);
    return;
  }
  if (typeof item === "string") {
    elements.push({ kind: "html", html: item });
    return;
  }
  if (rootElement && typeof Node !== "undefined" && item instanceof Node) {
    rootElement.appendChild(item);
  }
}

function isFormElement(value: unknown): value is FormElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "input" || kind === "select" || kind === "relation" || kind === "submit" || kind === "html";
}
