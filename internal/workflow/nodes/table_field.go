package nodes

import (
	"context"

	"codetable/internal/workflow"
)

type TableFieldRunner interface {
	RunWorkflowTableFieldNode(ctx context.Context, input map[string]any, info workflow.RuntimeInfo) (map[string]any, error)
}

type TableFieldNode struct {
	runner TableFieldRunner
}

func NewTableFieldNode(runner TableFieldRunner) TableFieldNode {
	return TableFieldNode{runner: runner}
}

func (node TableFieldNode) Info() workflow.NodeInfo {
	return workflow.NodeInfo{
		Type:          "table.field.create",
		DisplayName:   "Create table fields",
		Description:   "Adds missing fields to a table through the server metadata API using the workflow creator permissions.",
		Documentation: documentation("table.field.create"),
		Inputs: []workflow.Port{
			{Name: "database", Type: "string", Description: "Optional database name. Defaults to the workflow database."},
			{Name: "table", Type: "string", Description: "Target table name."},
			{Name: "fields", Type: "string[] | object[]", Description: "Fields to ensure. Strings default to string fields; objects support name and type."},
		},
		Outputs: []workflow.Port{
			{Name: "created", Type: "Field[]"},
			{Name: "restored", Type: "Field[]"},
			{Name: "existing", Type: "Field[]"},
			{Name: "fields", Type: "Field[]"},
		},
		Stateless: true,
	}
}

func (node TableFieldNode) Run(ctx context.Context, input map[string]any, info workflow.RuntimeInfo) (map[string]any, error) {
	return node.runner.RunWorkflowTableFieldNode(ctx, input, info)
}

var _ workflow.Node = TableFieldNode{}
