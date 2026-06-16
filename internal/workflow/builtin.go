package workflow

import "context"

type EchoNode struct{}

func (EchoNode) Info() NodeInfo {
	return NodeInfo{
		Type:        "echo",
		DisplayName: "Echo",
		Description: "Returns its input unchanged.",
		Inputs:      []Port{{Name: "value", Type: "any"}},
		Outputs:     []Port{{Name: "value", Type: "any"}},
		Stateless:   true,
	}
}

func (EchoNode) Run(_ context.Context, input map[string]any, _ RuntimeInfo) (map[string]any, error) {
	return input, nil
}
