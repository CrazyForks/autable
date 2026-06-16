import { describe, expect, it } from "vitest";
import { parseAnyMap, parseStringMap, stringMapToJSON } from "./workflowConfig";

describe("workflowConfig", () => {
  it("serializes string maps with stable key order", () => {
    expect(stringMapToJSON({ ZED: "last", API_KEY: "secret" })).toBe('{\n  "API_KEY": "secret",\n  "ZED": "last"\n}');
  });

  it("parses workflow config string maps", () => {
    expect(parseStringMap('{"TOKEN":"abc"}')).toEqual({ ok: true, value: { TOKEN: "abc" } });
    expect(parseStringMap('{"TOKEN":42}')).toEqual({
      ok: false,
      error: "Workflow config value for TOKEN must be a string"
    });
    expect(parseStringMap("[]")).toEqual({ ok: false, error: "Workflow config must be a JSON object" });
  });

  it("parses workflow input objects", () => {
    expect(parseAnyMap('{"record_id":1,"name":"Ada"}')).toEqual({
      ok: true,
      value: { record_id: 1, name: "Ada" }
    });
    expect(parseAnyMap("[]")).toEqual({ ok: false, error: "Workflow inputs must be a JSON object" });
  });
});
