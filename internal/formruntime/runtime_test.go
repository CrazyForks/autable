package formruntime

import "testing"

func TestEvaluateFormDefinition(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			try {
				root.append(api.input({ field: "name" }), api.input({ field: "email" }), api.submit("Submit"));
			} finally {
				return { table: "contacts" };
			}
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Table != "contacts" {
		t.Fatalf("unexpected table: %#v", definition)
	}
	if definition.Fields["name"] != "name" || definition.Fields["email"] != "email" {
		t.Fatalf("unexpected fields: %#v", definition.Fields)
	}
}

func TestEvaluateRequiresDefinition(t *testing.T) {
	if _, err := Evaluate(`root.append(api.input({ field: "name" }))`); err == nil {
		t.Fatal("expected missing render function error")
	}
	if _, err := Evaluate(`function render() { return {}; }`); err == nil {
		t.Fatal("expected missing table error")
	}
	if _, err := Evaluate(`function render(api, root) { root.append(api.input({ name: "name" })); return { table: "contacts" }; }`); err == nil {
		t.Fatal("expected missing field error")
	}
	if _, err := Evaluate(`function render(api, root) { root.append(api.input()); return { table: "contacts" }; }`); err == nil {
		t.Fatal("expected missing field error")
	}
}

func TestEvaluateAllowsDisplayDOMOperations(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			const note = document.createElement("strong");
			note.textContent = "Custom note";
			note.classList.add("note");
			root.element.appendChild(note);
			return { table: "contacts" };
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Table != "contacts" || len(definition.Fields) != 0 {
		t.Fatalf("unexpected definition: %#v", definition)
	}
}

func TestEvaluateAllowsRelationInput(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			root.append(api.relation({ field: "owner", table: "users", view: "active" }), api.submit("Submit"));
			return { table: "tasks" };
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Table != "tasks" || definition.Fields["owner"] != "owner" {
		t.Fatalf("unexpected definition: %#v", definition)
	}
}

func TestEvaluateProvidesStableStringify(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			root.append(api.input({ field: stableStringify({ b: 2, a: 1 }) }));
			return { table: "contacts" };
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := definition.Fields[`{"a":1,"b":2}`]; !ok {
		t.Fatalf("expected stableStringify field key, got %#v", definition.Fields)
	}
}
