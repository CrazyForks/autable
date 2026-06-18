package nodes

import (
	"context"
	"testing"

	"codetable/internal/workflow"
)

type fakeTableRowRunner struct {
	kind  string
	input map[string]any
	info  workflow.RuntimeInfo
}

func (runner *fakeTableRowRunner) RunWorkflowTableNode(_ context.Context, kind string, input map[string]any, info workflow.RuntimeInfo) (map[string]any, error) {
	runner.kind = kind
	runner.input = input
	runner.info = info
	return map[string]any{"operation": "update"}, nil
}

func TestTableRowUpsertNodeCallsRunner(t *testing.T) {
	runner := &fakeTableRowRunner{}
	node := NewTableRowNode(runner, "upsert")
	output, err := node.Run(context.Background(), map[string]any{
		"table":       "contacts",
		"match_field": "external_id",
		"values":      map[string]any{"external_id": "remote-1"},
	}, workflow.RuntimeInfo{DatabaseName: "db", CreatorID: "owner"})
	if err != nil {
		t.Fatal(err)
	}
	if runner.kind != "upsert" || runner.input["match_field"] != "external_id" || runner.info.CreatorID != "owner" {
		t.Fatalf("unexpected runner capture: kind=%q input=%#v info=%#v", runner.kind, runner.input, runner.info)
	}
	if output["operation"] != "update" {
		t.Fatalf("unexpected output: %#v", output)
	}
}

func TestTableRowUpsertNodeInfo(t *testing.T) {
	info := NewTableRowNode(&fakeTableRowRunner{}, "upsert").Info()
	if info.Type != "table.row.upsert" || len(info.Inputs) != 4 || info.Inputs[2].Name != "match_field" {
		t.Fatalf("unexpected upsert node info: %#v", info)
	}
	if len(info.Outputs) != 2 || info.Outputs[1].Name != "operation" {
		t.Fatalf("unexpected upsert outputs: %#v", info.Outputs)
	}
	if info.Documentation["en-US"] == "" || info.Documentation["zh-CN"] == "" {
		t.Fatalf("expected embedded documentation, got %#v", info.Documentation)
	}
}
