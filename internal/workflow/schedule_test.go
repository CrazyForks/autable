package workflow

import (
	"context"
	"testing"
)

func TestScheduleTriggerNodeEchoesScheduledAt(t *testing.T) {
	node := ScheduleTriggerNode{}
	info := node.Info()
	if !info.Trigger || !info.Stateless || info.Type != "time.schedule" {
		t.Fatalf("unexpected node info: %#v", info)
	}
	output, err := node.Run(context.Background(), map[string]any{"scheduled_at": int64(123)}, RuntimeInfo{})
	if err != nil {
		t.Fatal(err)
	}
	if output["scheduled_at"] != int64(123) {
		t.Fatalf("unexpected schedule output: %#v", output)
	}
}

func TestScheduleTriggerNodeRequiresScheduledAt(t *testing.T) {
	if _, err := (ScheduleTriggerNode{}).Run(context.Background(), map[string]any{}, RuntimeInfo{}); err == nil {
		t.Fatal("expected scheduled_at error")
	}
}
