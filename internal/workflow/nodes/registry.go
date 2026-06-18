package nodes

import (
	"codetable/internal/history"
	"codetable/internal/workflow"
	"codetable/internal/workflow/nodes/codetable"
	"codetable/internal/workflow/nodes/dingtalk/notable/listrecords"
	"codetable/internal/workflow/nodes/dingtalk/robot"
	"codetable/internal/workflow/nodes/echo"
	"codetable/internal/workflow/nodes/table/field"
	"codetable/internal/workflow/nodes/table/recordchanged"
	rowcreate "codetable/internal/workflow/nodes/table/row/create"
	rowdelete "codetable/internal/workflow/nodes/table/row/delete"
	rowlist "codetable/internal/workflow/nodes/table/row/list"
	rowupdate "codetable/internal/workflow/nodes/table/row/update"
	rowupsert "codetable/internal/workflow/nodes/table/row/upsert"
	"codetable/internal/workflow/nodes/time/schedule"
)

type Dependencies struct {
	History   history.Store
	CodeTable codetable.Service
}

func All(deps Dependencies) []workflow.Node {
	nodes := []workflow.Node{
		echo.Node{},
		recordchanged.NewNode(deps.History),
		schedule.Node{},
		robot.NewNode(),
		listrecords.NewNode(),
	}
	nodes = append(nodes, CodeTableNodes(deps.CodeTable)...)
	return nodes
}

func CodeTableNodes(service codetable.Service) []workflow.Node {
	if service == nil {
		return nil
	}
	return []workflow.Node{
		rowcreate.NewNode(service),
		rowupdate.NewNode(service),
		rowupsert.NewNode(service),
		rowdelete.NewNode(service),
		rowlist.NewNode(service),
		field.NewCreateNode(service),
	}
}
