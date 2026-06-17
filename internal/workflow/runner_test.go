package workflow

import (
	"context"
	"testing"
	"time"

	"codetable/internal/history"
)

type creatorCaptureNode struct {
	creatorID string
}

func (node *creatorCaptureNode) Info() NodeInfo {
	return NodeInfo{
		Type:        "creator.capture",
		DisplayName: "Creator capture",
		Inputs:      []Port{},
		Outputs:     []Port{{Name: "creator_id", Type: "string"}},
		Stateless:   true,
	}
}

func (node *creatorCaptureNode) Run(_ context.Context, _ map[string]any, info RuntimeInfo) (map[string]any, error) {
	node.creatorID = info.CreatorID
	return map[string]any{"creator_id": info.CreatorID}, nil
}

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

func TestRunnerUsesCreatorIdentityOnlyInsideNodes(t *testing.T) {
	ctx := context.Background()
	capture := &creatorCaptureNode{}
	runner := NewRunner(history.NewMemoryStore(), capture)

	run, _, err := runner.Run(ctx, Definition{
		ID:        15,
		CreatorID: "creator-user",
		Script: `
function run(info) {
  const captured = info.node("creator.capture", {});
  return {
    has_js_creator: Object.prototype.hasOwnProperty.call(info, "creator_id"),
    node_creator: captured.creator_id
  };
}
`,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if capture.creatorID != "creator-user" || run.Outputs["node_creator"] != "creator-user" {
		t.Fatalf("expected node to receive creator identity, got node=%q outputs=%#v", capture.creatorID, run.Outputs)
	}
	if run.Outputs["has_js_creator"] != false {
		t.Fatalf("workflow JS should not receive creator identity directly: %#v", run.Outputs)
	}
}

func TestRunnerReadsTriggerDeclaration(t *testing.T) {
	ctx := context.Background()
	store := history.NewMemoryStore()
	runner := NewRunner(store, NewRecordChangedTriggerNode(store))

	declaration, err := runner.Trigger(ctx, Definition{
		ID: 11,
		Script: `
function trigger(info) {
  return {
    node: "table.record.changed",
    params: {
      table: "contacts",
      operations: ["update"],
      fields: ["status"]
    }
  };
}
function run(info) { return {}; }
`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if declaration.Node != "table.record.changed" {
		t.Fatalf("unexpected trigger node: %#v", declaration)
	}
	if declaration.Params["table"] != "contacts" {
		t.Fatalf("unexpected trigger params: %#v", declaration.Params)
	}
	operations, ok := declaration.Params["operations"].([]any)
	if !ok || len(operations) != 1 || operations[0] != "update" {
		t.Fatalf("unexpected trigger operations: %#v", declaration.Params["operations"])
	}
	fields, ok := declaration.Params["fields"].([]any)
	if !ok || len(fields) != 1 || fields[0] != "status" {
		t.Fatalf("unexpected trigger fields: %#v", declaration.Params["fields"])
	}
}

func TestRunnerRejectsNonTriggerDeclarationNode(t *testing.T) {
	ctx := context.Background()
	runner := NewRunner(history.NewMemoryStore(), EchoNode{})

	_, err := runner.Trigger(ctx, Definition{
		ID:     12,
		Script: `function trigger(info) { return { node: "echo" }; } function run(info) { return {}; }`,
	})
	if err == nil {
		t.Fatal("expected non-trigger node error")
	}
}

func TestRunnerRequiresTriggerFunction(t *testing.T) {
	ctx := context.Background()
	runner := NewRunner(history.NewMemoryStore(), EchoNode{})

	_, err := runner.Trigger(ctx, Definition{
		ID:     13,
		Script: `function run(info) { return {}; }`,
	})
	if err == nil {
		t.Fatal("expected missing trigger function error")
	}
}

func TestRunnerDoesNotNormalizeExportDefaultScripts(t *testing.T) {
	ctx := context.Background()
	runner := NewRunner(history.NewMemoryStore(), EchoNode{})

	_, _, err := runner.Run(ctx, Definition{
		ID:     14,
		Script: `export default function run(info) { return {}; }`,
	}, nil)
	if err == nil {
		t.Fatal("expected export default script to fail")
	}
}

func TestRunnerExecutesRecordChangedTriggerNode(t *testing.T) {
	ctx := context.Background()
	store := history.NewMemoryStore()
	historyKey, err := history.SaveRowChange(ctx, store, history.RowChange{
		Database:  "db",
		Table:     "contacts",
		RecordID:  5,
		Timestamp: time.Unix(99, 0).UTC(),
		Values:    map[string]any{"name": "Ada"},
		Diff:      history.RowDiff{"name": {Old: nil, New: "Ada"}},
		ActorID:   "u1",
	})
	if err != nil {
		t.Fatal(err)
	}
	runner := NewRunner(store, NewRecordChangedTriggerNode(store))

	run, _, err := runner.Run(ctx, Definition{
		ID:     10,
		Script: `function run(info) { const changed = info.node("table.record.changed", { history_key: info.inputs.history_key }); return { record_id: changed.record.record_id, name: changed.values.name, actor: changed.actor_id, diff_name: changed.diff.name.new }; }`,
	}, map[string]any{"history_key": historyKey})
	if err != nil {
		t.Fatal(err)
	}
	if run.Outputs["record_id"] != int64(5) || run.Outputs["name"] != "Ada" || run.Outputs["actor"] != "u1" || run.Outputs["diff_name"] != "Ada" {
		t.Fatalf("unexpected trigger workflow outputs: %#v", run.Outputs)
	}
	if len(run.Steps) != 1 || run.Steps[0].NodeID != "table.record.changed" {
		t.Fatalf("unexpected trigger workflow steps: %#v", run.Steps)
	}
}
