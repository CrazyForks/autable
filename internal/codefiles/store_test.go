package codefiles

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"codetable/internal/systemdb"
)

func TestStoreWritesWorkflowAndFormScripts(t *testing.T) {
	ctx := context.Background()
	store := NewStore(t.TempDir())

	workflow := systemdb.WorkflowDefinition{
		ID:           1,
		DatabaseName: "workspace",
		Name:         "welcome contact",
		Script:       "function run(info) { return info.inputs; }",
	}
	if err := store.SaveWorkflowScript(ctx, workflow); err != nil {
		t.Fatal(err)
	}
	workflowScript, err := os.ReadFile(filepath.Join(store.root, "workflows", "workspace", "00000000000000000001-welcome-contact.js"))
	if err != nil {
		t.Fatal(err)
	}
	if string(workflowScript) != workflow.Script {
		t.Fatalf("unexpected workflow script: %s", workflowScript)
	}

	form := systemdb.FormDefinition{
		ID:           2,
		DatabaseName: "workspace",
		Name:         "quick status",
		Script:       "root.append(api.input({ name: 'email' }))",
	}
	if err := store.SaveFormScript(ctx, form); err != nil {
		t.Fatal(err)
	}
	formScript, err := os.ReadFile(filepath.Join(store.root, "forms", "workspace", "00000000000000000002-quick-status.js"))
	if err != nil {
		t.Fatal(err)
	}
	if string(formScript) != form.Script {
		t.Fatalf("unexpected form script: %s", formScript)
	}
}

func TestStoreRemovesOldFileWhenResourceIsRenamed(t *testing.T) {
	ctx := context.Background()
	store := NewStore(t.TempDir())
	workflow := systemdb.WorkflowDefinition{
		ID:           1,
		DatabaseName: "workspace",
		Name:         "old name",
		Script:       "old",
	}
	if err := store.SaveWorkflowScript(ctx, workflow); err != nil {
		t.Fatal(err)
	}
	workflow.Name = "new name"
	workflow.Script = "new"
	if err := store.SaveWorkflowScript(ctx, workflow); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(store.root, "workflows", "workspace", "00000000000000000001-old-name.js")); !os.IsNotExist(err) {
		t.Fatalf("expected old workflow script to be removed, got %v", err)
	}
	newScript, err := os.ReadFile(filepath.Join(store.root, "workflows", "workspace", "00000000000000000001-new-name.js"))
	if err != nil {
		t.Fatal(err)
	}
	if string(newScript) != "new" {
		t.Fatalf("unexpected renamed script: %s", newScript)
	}
}

func TestStoreLoadsScriptFilesByCurrentPathOrID(t *testing.T) {
	ctx := context.Background()
	store := NewStore(t.TempDir())
	workflow := systemdb.WorkflowDefinition{
		ID:           1,
		DatabaseName: "workspace",
		Name:         "notify",
		Script:       "database copy",
	}
	if err := store.SaveWorkflowScript(ctx, workflow); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.WorkflowScriptPath(workflow), []byte("file copy"), 0o644); err != nil {
		t.Fatal(err)
	}
	script, ok, err := store.LoadWorkflowScript(ctx, workflow)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || script != "file copy" {
		t.Fatalf("expected workflow script from file, got ok=%v script=%q", ok, script)
	}

	workflow.Name = "renamed-in-db"
	script, ok, err = store.LoadWorkflowScript(ctx, workflow)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || script != "file copy" {
		t.Fatalf("expected workflow script fallback by id, got ok=%v script=%q", ok, script)
	}
}
