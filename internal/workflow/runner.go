package workflow

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"codetable/internal/history"

	"github.com/dop251/goja"
	"github.com/google/uuid"
)

type Definition struct {
	ID           int64
	DatabaseName string
	Script       string
	CreatorID    string
	Secrets      map[string]string
	Variables    map[string]string
}

var ErrMissingTrigger = errors.New("workflow script must define function trigger(info)")

type TriggerDeclaration struct {
	Node   string         `json:"node"`
	Params map[string]any `json:"params,omitempty"`
}

type Runner struct {
	store history.Store
	nodes map[string]Node
	now   func() time.Time
}

func NewRunner(store history.Store, nodes ...Node) *Runner {
	runner := &Runner{
		store: store,
		nodes: map[string]Node{},
		now:   func() time.Time { return time.Now().UTC() },
	}
	for _, node := range nodes {
		runner.Register(node)
	}
	return runner
}

func (runner *Runner) Register(node Node) {
	info := node.Info()
	runner.nodes[info.Type] = node
}

func (runner *Runner) NodeInfos() []NodeInfo {
	infos := make([]NodeInfo, 0, len(runner.nodes))
	for _, node := range runner.nodes {
		infos = append(infos, node.Info())
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Type < infos[j].Type
	})
	return infos
}

func (runner *Runner) Run(ctx context.Context, definition Definition, inputs map[string]any) (history.WorkflowRun, string, error) {
	return runner.RunAt(ctx, definition, inputs, runner.now())
}

func (runner *Runner) RunAt(ctx context.Context, definition Definition, inputs map[string]any, timestamp time.Time) (history.WorkflowRun, string, error) {
	runID := uuid.NewString()
	run := history.WorkflowRun{
		WorkflowID: definition.ID,
		Timestamp:  timestamp.UTC(),
		Inputs:     cloneAnyMap(inputs),
		Steps:      []history.StepRecord{},
	}
	runtime := newRuntime()
	info := workflowInfo(definition, runID, inputs)
	info["node"] = func(call goja.FunctionCall) goja.Value {
		nodeType := call.Argument(0).String()
		nodeInput := exportedMap(call.Argument(1).Export())
		output, err := runner.runNode(ctx, definition, runID, nodeType, nodeInput, &run)
		if err != nil {
			panic(runtime.ToValue(err.Error()))
		}
		return runtime.ToValue(output)
	}

	if _, err := runtime.RunString(definition.Script); err != nil {
		return runner.finish(ctx, run, err)
	}
	fn, ok := goja.AssertFunction(runtime.Get("run"))
	if !ok {
		return runner.finish(ctx, run, errors.New("workflow script must define function run(info)"))
	}
	output, err := fn(goja.Undefined(), runtime.ToValue(info))
	if err != nil {
		return runner.finish(ctx, run, err)
	}
	run.Outputs = exportedMap(output.Export())
	return runner.finish(ctx, run, nil)
}

func (runner *Runner) Trigger(ctx context.Context, definition Definition) (TriggerDeclaration, error) {
	runtime := newRuntime()
	if _, err := runtime.RunString(definition.Script); err != nil {
		return TriggerDeclaration{}, err
	}
	fn, ok := goja.AssertFunction(runtime.Get("trigger"))
	if !ok {
		return TriggerDeclaration{}, ErrMissingTrigger
	}
	info := workflowInfo(definition, "", nil)
	delete(info, "run_id")
	delete(info, "inputs")
	value, err := fn(goja.Undefined(), runtime.ToValue(info))
	if err != nil {
		return TriggerDeclaration{}, err
	}
	declaration := triggerDeclarationFromExport(value.Export())
	if declaration.Node == "" {
		return TriggerDeclaration{}, errors.New("workflow trigger must return a node")
	}
	node, ok := runner.nodes[declaration.Node]
	if !ok {
		return TriggerDeclaration{}, fmt.Errorf("trigger node %q is not registered", declaration.Node)
	}
	if !node.Info().Trigger {
		return TriggerDeclaration{}, fmt.Errorf("node %q is not a trigger node", declaration.Node)
	}
	if declaration.Params == nil {
		declaration.Params = map[string]any{}
	}
	return declaration, ctx.Err()
}

func (runner *Runner) runNode(ctx context.Context, definition Definition, runID, nodeType string, input map[string]any, run *history.WorkflowRun) (map[string]any, error) {
	node, ok := runner.nodes[nodeType]
	step := history.StepRecord{NodeID: nodeType, Input: cloneAnyMap(input)}
	if !ok {
		step.Error = "node is not registered"
		run.Steps = append(run.Steps, step)
		return nil, fmt.Errorf("node %q is not registered", nodeType)
	}
	output, err := node.Run(ctx, input, RuntimeInfo{
		WorkflowID:   definition.ID,
		DatabaseName: definition.DatabaseName,
		RunID:        runID,
		CreatorID:    definition.CreatorID,
		Secrets:      cloneStringMap(definition.Secrets),
		Variables:    cloneStringMap(definition.Variables),
	})
	if err != nil {
		step.Error = err.Error()
		run.Steps = append(run.Steps, step)
		return nil, err
	}
	step.Output = cloneAnyMap(output)
	run.Steps = append(run.Steps, step)
	return output, nil
}

func (runner *Runner) finish(ctx context.Context, run history.WorkflowRun, runErr error) (history.WorkflowRun, string, error) {
	if runErr != nil {
		run.Error = runErr.Error()
		run.Outputs = map[string]any{"error": runErr.Error()}
	}
	key, err := history.SaveWorkflowRun(ctx, runner.store, run)
	if err != nil {
		return run, "", err
	}
	return run, key, runErr
}

func newRuntime() *goja.Runtime {
	runtime := goja.New()
	runtime.SetFieldNameMapper(goja.TagFieldNameMapper("json", true))
	return runtime
}

func workflowInfo(definition Definition, runID string, inputs map[string]any) map[string]any {
	return map[string]any{
		"workflow_id":   definition.ID,
		"database_name": definition.DatabaseName,
		"run_id":        runID,
		"inputs":        cloneAnyMap(inputs),
		"secrets":       cloneStringMap(definition.Secrets),
		"variables":     cloneStringMap(definition.Variables),
	}
}

func triggerDeclarationFromExport(value any) TriggerDeclaration {
	values, ok := value.(map[string]any)
	if !ok {
		return TriggerDeclaration{}
	}
	declaration := TriggerDeclaration{}
	if node, ok := values["node"].(string); ok {
		declaration.Node = node
	}
	declaration.Params = exportedMap(values["params"])
	return declaration
}

func exportedMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if values, ok := value.(map[string]any); ok {
		return cloneAnyMap(values)
	}
	return map[string]any{"value": value}
}

func cloneAnyMap(values map[string]any) map[string]any {
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneStringMap(values map[string]string) map[string]string {
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
