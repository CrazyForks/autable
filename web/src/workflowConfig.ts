export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function stringMapToJSON(values: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify(sorted, null, 2);
}

export function parseStringMap(text: string): ParseResult<Record<string, string>> {
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

export function parseAnyMap(text: string): ParseResult<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return { ok: false, error: "Workflow inputs must be a JSON object" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
