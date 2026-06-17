package formruntime

import "testing"

func TestEvaluateFormDefinition(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			try {
				root.append(api.input({ name: "person_name" }), api.submit("Submit"));
			} finally {
				return { table: "contacts", fields: { person_name: "name", person_email: "email" } };
			}
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Table != "contacts" {
		t.Fatalf("unexpected table: %#v", definition)
	}
	if definition.Fields["person_name"] != "name" || definition.Fields["person_email"] != "email" {
		t.Fatalf("unexpected fields: %#v", definition.Fields)
	}
}

func TestEvaluateRequiresDefinition(t *testing.T) {
	if _, err := Evaluate(`root.append(api.input({ name: "name" }))`); err == nil {
		t.Fatal("expected missing render function error")
	}
	if _, err := Evaluate(`function render() { return { fields: { name: "name" } }; }`); err == nil {
		t.Fatal("expected missing table error")
	}
}

func TestEvaluateAllowsDisplayDOMOperations(t *testing.T) {
	definition, err := Evaluate(`
		function render(api, root) {
			const note = document.createElement("strong");
			note.textContent = "Custom note";
			note.classList.add("note");
			root.element.appendChild(note);
			return { table: "contacts", fields: { name: "name" } };
		}
	`)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Table != "contacts" || definition.Fields["name"] != "name" {
		t.Fatalf("unexpected definition: %#v", definition)
	}
}
