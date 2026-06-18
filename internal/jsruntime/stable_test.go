package jsruntime

import (
	"testing"

	"github.com/dop251/goja"
)

func TestStableStringifyValueSemantics(t *testing.T) {
	runtime := goja.New()
	if err := InstallStableStringify(runtime); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`[
		stableStringify(undefined),
		stableStringify(null),
		stableStringify(12),
		stableStringify(false),
		stableStringify("text"),
		stableStringify({ b: 2, a: { d: 4, c: 3 } }),
		stableStringify([{ b: 2, a: 1 }, undefined])
	]`)
	if err != nil {
		t.Fatal(err)
	}
	got := value.Export().([]any)
	want := []any{
		"",
		"",
		"12",
		"false",
		"text",
		`{"a":{"c":3,"d":4},"b":2}`,
		`[{"a":1,"b":2},null]`,
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("stableStringify[%d] = %#v, want %#v", index, got[index], want[index])
		}
	}
}
