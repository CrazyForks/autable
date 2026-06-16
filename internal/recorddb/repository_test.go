package recorddb

import (
	"context"
	"path/filepath"
	"testing"

	"codetable/internal/metadata"
)

func TestRepositoryCreatesOneSQLiteFilePerMetadataDatabase(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	catalog := metadata.Catalog{Databases: []metadata.Database{
		{Name: "sales", SQLitePath: filepath.Join(dir, "sales.sqlite")},
		{Name: "ops", SQLitePath: filepath.Join(dir, "ops.sqlite")},
	}}

	repository, err := OpenCatalog(ctx, catalog)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatal(err)
		}
	})

	if _, err := repository.CreateRow(ctx, "sales", "contacts", map[string]any{"name": "Ada"}); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.CreateRow(ctx, "ops", "contacts", map[string]any{"name": "Grace"}); err != nil {
		t.Fatal(err)
	}

	salesRows, err := repository.Rows(ctx, "sales", "contacts")
	if err != nil {
		t.Fatal(err)
	}
	opsRows, err := repository.Rows(ctx, "ops", "contacts")
	if err != nil {
		t.Fatal(err)
	}
	if len(salesRows) != 1 || salesRows[0].Values["name"] != "Ada" {
		t.Fatalf("unexpected sales rows: %#v", salesRows)
	}
	if len(opsRows) != 1 || opsRows[0].Values["name"] != "Grace" {
		t.Fatalf("unexpected ops rows: %#v", opsRows)
	}
}

func TestRepositoryPersistsRowsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "workspace.sqlite")
	catalog := metadata.Catalog{Databases: []metadata.Database{{Name: "workspace", SQLitePath: path}}}

	repository, err := OpenCatalog(ctx, catalog)
	if err != nil {
		t.Fatal(err)
	}
	row, err := repository.CreateRow(ctx, "workspace", "contacts", map[string]any{"name": "Ada"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, err := OpenCatalog(ctx, catalog)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Fatal(err)
		}
	})
	loaded, err := reopened.Row(ctx, "workspace", "contacts", row.RecordID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.RecordID != row.RecordID || loaded.Values["name"] != "Ada" {
		t.Fatalf("unexpected persisted row: %#v", loaded)
	}
}
