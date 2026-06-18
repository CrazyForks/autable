package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"codetable/internal/metadata"
	"codetable/internal/permission"
	"codetable/internal/table"
	"codetable/internal/workflow"
	"codetable/internal/workflow/nodes"
)

func (server *Server) RunWorkflowTableNode(ctx context.Context, kind string, input map[string]any, info workflow.RuntimeInfo) (map[string]any, error) {
	if info.CreatorID == "" {
		return nil, errors.New("workflow creator is required")
	}
	dbName, tableName, err := workflowTableTarget(input, info)
	if err != nil {
		return nil, err
	}
	perms, err := server.system.EffectiveGrantsForSubject(ctx, info.CreatorID)
	if err != nil {
		return nil, err
	}
	catalog := server.catalogSnapshot()
	switch kind {
	case "create":
		values, err := workflowValuesInput(input)
		if err != nil {
			return nil, err
		}
		row, err := server.tables.CreateRow(ctx, catalog, perms, info.CreatorID, dbName, tableName, values)
		return workflowRowOutput(row, err)
	case "update":
		recordID, err := workflowRecordIDInput(input)
		if err != nil {
			return nil, err
		}
		values, err := workflowValuesInput(input)
		if err != nil {
			return nil, err
		}
		row, err := server.tables.UpdateRow(ctx, catalog, perms, info.CreatorID, dbName, tableName, recordID, values)
		return workflowRowOutput(row, err)
	case "upsert":
		values, err := workflowValuesInput(input)
		if err != nil {
			return nil, err
		}
		matchField, err := workflowMatchFieldInput(input, values)
		if err != nil {
			return nil, err
		}
		row, operation, err := server.upsertWorkflowTableRow(ctx, catalog, perms, info.CreatorID, dbName, tableName, matchField, values)
		return workflowRowMutationOutput(row, operation, err)
	case "delete":
		recordID, err := workflowRecordIDInput(input)
		if err != nil {
			return nil, err
		}
		row, err := server.tables.DeleteRow(ctx, catalog, perms, info.CreatorID, dbName, tableName, recordID)
		return workflowRowOutput(row, err)
	default:
		viewName, _ := input["view"].(string)
		rows, err := server.tables.Rows(ctx, catalog, perms, info.CreatorID, dbName, tableName, viewName)
		if err != nil {
			return nil, err
		}
		output := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			output = append(output, workflowRowRecord(row))
		}
		return map[string]any{"rows": output}, nil
	}
}

func workflowTableTarget(input map[string]any, info workflow.RuntimeInfo) (string, string, error) {
	dbName := info.DatabaseName
	if value, ok := input["database"].(string); ok && value != "" {
		dbName = value
	}
	tableName, _ := input["table"].(string)
	if dbName == "" {
		return "", "", errors.New("database is required")
	}
	if tableName == "" {
		return "", "", errors.New("table is required")
	}
	return dbName, tableName, nil
}

func workflowValuesInput(input map[string]any) (map[string]any, error) {
	values, ok := input["values"].(map[string]any)
	if !ok {
		return nil, errors.New("values is required")
	}
	return values, nil
}

func workflowMatchFieldInput(input map[string]any, values map[string]any) (string, error) {
	matchField, _ := input["match_field"].(string)
	if matchField == "" {
		return "", errors.New("match_field is required")
	}
	if _, ok := values[matchField]; !ok {
		return "", fmt.Errorf("values.%s is required", matchField)
	}
	return matchField, nil
}

func workflowRecordIDInput(input map[string]any) (int64, error) {
	switch value := input["record_id"].(type) {
	case int:
		return int64(value), nil
	case int64:
		return value, nil
	case float64:
		return int64(value), nil
	case json.Number:
		return value.Int64()
	default:
		return 0, errors.New("record_id is required")
	}
}

func (server *Server) upsertWorkflowTableRow(ctx context.Context, catalog metadata.Catalog, perms permission.Set, actorID string, dbName string, tableName string, matchField string, values map[string]any) (table.Row, string, error) {
	matchValue := values[matchField]
	rows, err := server.tables.Rows(ctx, catalog, perms, actorID, dbName, tableName, "")
	if err != nil {
		return table.Row{}, "", err
	}
	for _, row := range rows {
		if workflowValuesEqual(row.Values[matchField], matchValue) {
			updated, err := server.tables.UpdateRow(ctx, catalog, perms, actorID, dbName, tableName, row.RecordID, values)
			return updated, "update", err
		}
	}
	created, err := server.tables.CreateRow(ctx, catalog, perms, actorID, dbName, tableName, values)
	return created, "create", err
}

func workflowValuesEqual(left any, right any) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return fmt.Sprint(left) == fmt.Sprint(right)
}

func workflowRowOutput(row table.Row, err error) (map[string]any, error) {
	if err != nil {
		return nil, err
	}
	return map[string]any{"record": workflowRowRecord(row)}, nil
}

func workflowRowMutationOutput(row table.Row, operation string, err error) (map[string]any, error) {
	if err != nil {
		return nil, err
	}
	return map[string]any{"record": workflowRowRecord(row), "operation": operation}, nil
}

func workflowRowRecord(row table.Row) map[string]any {
	return map[string]any{
		"record_id": row.RecordID,
		"values":    row.Values,
	}
}

func (server *Server) registerWorkflowTableNodes() {
	server.runner.Register(nodes.NewTableRowNode(server, "create"))
	server.runner.Register(nodes.NewTableRowNode(server, "update"))
	server.runner.Register(nodes.NewTableRowNode(server, "upsert"))
	server.runner.Register(nodes.NewTableRowNode(server, "delete"))
	server.runner.Register(nodes.NewTableRowNode(server, "list"))
	server.registerWorkflowTableFieldNodes()
}
