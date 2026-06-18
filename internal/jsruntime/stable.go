package jsruntime

import "github.com/dop251/goja"

const stableStringifySource = `
function stableStringify(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  const seen = [];
  function normalize(input) {
    if (input === null || typeof input !== "object") {
      return input;
    }
    if (typeof input.toJSON === "function") {
      return normalize(input.toJSON());
    }
    if (seen.indexOf(input) !== -1) {
      throw new TypeError("Converting circular structure to JSON");
    }
    seen.push(input);
    try {
      if (Array.isArray(input)) {
        return input.map((item) => {
          const normalized = normalize(item);
          if (normalized === undefined || typeof normalized === "function" || typeof normalized === "symbol") {
            return null;
          }
          return normalized;
        });
      }
      const output = {};
      for (const key of Object.keys(input).sort()) {
        const normalized = normalize(input[key]);
        if (normalized !== undefined && typeof normalized !== "function" && typeof normalized !== "symbol") {
          output[key] = normalized;
        }
      }
      return output;
    } finally {
      seen.pop();
    }
  }
  return JSON.stringify(normalize(value)) || "";
}
`

func InstallStableStringify(runtime *goja.Runtime) error {
	_, err := runtime.RunString(stableStringifySource)
	return err
}
