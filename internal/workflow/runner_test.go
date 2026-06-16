package workflow

import (
	"context"
	"testing"

	"codetable/internal/history"
)

func TestRunnerExecutesJavaScriptAndPersistsWorkflowHistory(t *testing.T) {
	ctx := context.Background()
	store := history.NewMemoryStore()
	runner := NewRunner(store, EchoNode{})

	run, key, err := runner.Run(ctx, Definition{
		ID:        7,
		Script:    `function run(info) { const echoed = info.node("echo", { value: info.inputs.name }); return { message: echoed.value + "-" + info.variables.suffix }; }`,
		Variables: map[string]string{"suffix": "done"},
	}, map[string]any{"name": "Ada"})
	if err != nil {
		t.Fatal(err)
	}
	if key == "" {
		t.Fatal("expected history key")
	}
	if run.Outputs["message"] != "Ada-done" {
		t.Fatalf("unexpected outputs: %#v", run.Outputs)
	}
	if len(run.Steps) != 1 || run.Steps[0].NodeID != "echo" || run.Steps[0].Output["value"] != "Ada" {
		t.Fatalf("unexpected steps: %#v", run.Steps)
	}

	entries, err := store.GetPrefix(ctx, history.WorkflowPrefix(7))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one workflow history entry, got %d", len(entries))
	}
	saved, err := history.DecodeWorkflowRun(entries[0])
	if err != nil {
		t.Fatal(err)
	}
	if saved.Outputs["message"] != "Ada-done" {
		t.Fatalf("unexpected saved run: %#v", saved)
	}
}

func TestRunnerPersistsFailedRuns(t *testing.T) {
	ctx := context.Background()
	store := history.NewMemoryStore()
	runner := NewRunner(store)

	run, _, err := runner.Run(ctx, Definition{
		ID:     9,
		Script: `function run(info) { return info.node("missing", { value: 1 }); }`,
	}, nil)
	if err == nil {
		t.Fatal("expected missing node error")
	}
	if run.Error == "" || len(run.Steps) != 1 || run.Steps[0].Error == "" {
		t.Fatalf("expected failed run details, got %#v", run)
	}
	entries, err := store.GetPrefix(ctx, history.WorkflowPrefix(9))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected failed run to be persisted, got %d", len(entries))
	}
}
