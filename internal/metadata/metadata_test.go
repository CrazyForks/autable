package metadata

import "testing"

func TestCatalogValidateRejectsUserRecordID(t *testing.T) {
	catalog := Catalog{Databases: []Database{{
		Name:       "main",
		SQLitePath: "./main.sqlite",
		Tables: []Table{{
			Name: "tasks",
			Fields: []Field{
				{Name: "record_id", Type: "text"},
			},
		}},
	}}}

	if err := catalog.Validate(); err == nil {
		t.Fatal("expected reserved field validation error")
	}
}

func TestActiveFieldsPreservesSoftDeletedMetadata(t *testing.T) {
	table := Table{Fields: []Field{
		{Name: "name", Type: "text"},
		{Name: "legacy", Type: "text", Deleted: true},
	}}

	active := table.ActiveFields()
	if len(active) != 1 || active[0].Name != "name" {
		t.Fatalf("unexpected active fields: %#v", active)
	}
	if _, ok := table.Field("legacy"); !ok {
		t.Fatal("soft-deleted field should remain addressable in metadata")
	}
}

func TestResolveViewComposesBaseView(t *testing.T) {
	table := Table{
		Name: "contacts",
		Fields: []Field{
			{Name: "status", Type: "text"},
			{Name: "name", Type: "text"},
		},
		Views: []View{
			{
				Name:    "active",
				Filters: []ViewFilter{{Field: "status", Op: "eq", Value: "active"}},
				Sorts:   []ViewSort{{Field: "name", Direction: "asc"}},
			},
			{
				Name:     "active-review",
				BaseView: "active",
				Filters:  []ViewFilter{{Field: "name", Op: "contains", Value: "Ada"}},
				Sorts:    []ViewSort{{Field: "record_id", Direction: "desc"}},
			},
		},
	}

	if err := table.validate("db", 0); err != nil {
		t.Fatal(err)
	}
	resolved, err := table.ResolveView("active-review")
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved.Filters) != 2 {
		t.Fatalf("expected composed filters, got %#v", resolved.Filters)
	}
	if len(resolved.Sorts) != 2 {
		t.Fatalf("expected composed sorts, got %#v", resolved.Sorts)
	}
}

func TestValidateRejectsViewCycles(t *testing.T) {
	table := Table{
		Name:   "contacts",
		Fields: []Field{{Name: "name", Type: "text"}},
		Views: []View{
			{Name: "a", BaseView: "b"},
			{Name: "b", BaseView: "a"},
		},
	}

	if err := table.validate("db", 0); err == nil {
		t.Fatal("expected view cycle validation error")
	}
}
