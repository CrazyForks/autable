import { describe, expect, it } from "vitest";
import { renderFormScript } from "./formRuntime";

describe("renderFormScript", () => {
  it("executes form JavaScript against the form api and root", () => {
    const result = renderFormScript(`
      function render(api, root) {
        const email = api.input({ field: "email", label: "Email", type: "email" });
        const status = api.select({ field: "status", options: ["Active", "Review"] });
        root.append(email, status, api.submit("Create record"));
        return { table: "contacts" };
      }
    `);

    expect(result.error).toBeUndefined();
    expect(result.table).toBe("contacts");
    expect(result.fields).toEqual({ email: "email", status: "status" });
    expect(result.elements).toEqual([
      { kind: "input", field: "email", label: "Email", inputType: "email" },
      { kind: "select", field: "status", label: "status", options: ["Active", "Review"] },
      { kind: "submit", label: "Create record" }
    ]);
  });

  it("rejects direct scripts without a render function", () => {
    const result = renderFormScript(`root.append(api.submit("Create contact"));`);

    expect(result.elements).toEqual([]);
    expect(result.error).toContain("render is not defined");
  });

  it("supports field-bound inputs", () => {
    const result = renderFormScript(`
      function render(api, root) {
        root.append(api.input({ field: "name", label: "Name" }), api.submit("Submit"));
        return { table: "contacts" };
      }
    `);

    expect(result.error).toBeUndefined();
    expect(result.table).toBe("contacts");
    expect(result.fields).toEqual({ name: "name" });
    expect(result.elements).toEqual([
      { kind: "input", field: "name", label: "Name", inputType: "text" },
      { kind: "submit", label: "Submit" }
    ]);
  });

  it("rejects controls without field configs", () => {
    const oldNameResult = renderFormScript(`
      function render(api, root) {
        root.append(api.input({ name: "name" }));
        return { table: "contacts" };
      }
    `);
    const missingConfigResult = renderFormScript(`
      function render(api, root) {
        root.append(api.input());
        return { table: "contacts" };
      }
    `);

    expect(oldNameResult.error).toContain("form controls require field");
    expect(missingConfigResult.error).toContain("form controls require field");
  });

  it("supports relation inputs with a target table and view", () => {
    const result = renderFormScript(`
      function render(api, root) {
        root.append(api.relation({ field: "owner", label: "Owner", table: "users", view: "active" }), api.submit("Submit"));
        return { table: "tasks" };
      }
    `);

    expect(result.error).toBeUndefined();
    expect(result.fields).toEqual({ owner: "owner" });
    expect(result.elements).toEqual([
      { kind: "relation", field: "owner", label: "Owner", table: "users", view: "active" },
      { kind: "submit", label: "Submit" }
    ]);
  });

  it("returns script errors without throwing", () => {
    const result = renderFormScript(`throw new Error("bad form")`);

    expect(result.elements).toEqual([]);
    expect(result.error).toContain("bad form");
  });

  it("supports raw DOM elements appended to root", () => {
    const result = renderFormScript(`
      function render(api, root) {
        const note = document.createElement("strong");
        note.textContent = "Custom note";
        root.element.appendChild(note);
        return { table: "contacts" };
      }
    `);

    expect(result.error).toBeUndefined();
    expect(result.elements).toEqual([{ kind: "html", html: "<strong>Custom note</strong>" }]);
  });
});
