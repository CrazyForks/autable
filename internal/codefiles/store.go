package codefiles

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"codetable/internal/systemdb"
)

type Store struct {
	root string
}

func NewStore(root string) *Store {
	return &Store{root: root}
}

func (store *Store) SaveWorkflowScript(ctx context.Context, workflow systemdb.WorkflowDefinition) error {
	return store.writeScript(ctx, "workflows", workflow.DatabaseName, workflow.ID, workflow.Name, workflow.Script)
}

func (store *Store) SaveFormScript(ctx context.Context, form systemdb.FormDefinition) error {
	return store.writeScript(ctx, "forms", form.DatabaseName, form.ID, form.Name, form.Script)
}

func (store *Store) WorkflowScriptPath(workflow systemdb.WorkflowDefinition) string {
	return store.scriptPath("workflows", workflow.DatabaseName, workflow.ID, workflow.Name)
}

func (store *Store) FormScriptPath(form systemdb.FormDefinition) string {
	return store.scriptPath("forms", form.DatabaseName, form.ID, form.Name)
}

func (store *Store) writeScript(ctx context.Context, kind, databaseName string, id int64, name, script string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if store.root == "" {
		return nil
	}
	if databaseName == "" {
		return fmt.Errorf("%s database name is required", kind)
	}
	if id == 0 {
		return fmt.Errorf("%s id is required", kind)
	}

	dir := filepath.Join(store.root, kind, safeSegment(databaseName))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := removeOldScriptFiles(dir, id); err != nil {
		return err
	}
	return os.WriteFile(store.scriptPath(kind, databaseName, id, name), []byte(script), 0o644)
}

func (store *Store) scriptPath(kind, databaseName string, id int64, name string) string {
	return filepath.Join(store.root, kind, safeSegment(databaseName), fmt.Sprintf("%020d-%s.js", id, safeSegment(name)))
}

func removeOldScriptFiles(dir string, id int64) error {
	matches, err := filepath.Glob(filepath.Join(dir, fmt.Sprintf("%020d-*.js", id)))
	if err != nil {
		return err
	}
	for _, match := range matches {
		if err := os.Remove(match); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

var unsafeSegment = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func safeSegment(value string) string {
	segment := unsafeSegment.ReplaceAllString(strings.TrimSpace(value), "-")
	segment = strings.Trim(segment, ".-")
	if segment == "" {
		return "unnamed"
	}
	return segment
}
