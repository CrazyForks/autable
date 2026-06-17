package formruntime

import (
	"errors"
	"fmt"

	"github.com/dop251/goja"
)

type Definition struct {
	Table  string            `json:"table"`
	Fields map[string]string `json:"fields"`
}

func Evaluate(script string) (Definition, error) {
	runtime := goja.New()
	noop := func(goja.FunctionCall) goja.Value { return goja.Undefined() }
	createElement := func(goja.FunctionCall) goja.Value {
		return runtime.ToValue(map[string]any{
			"append":       noop,
			"appendChild":  noop,
			"setAttribute": noop,
			"classList": map[string]any{
				"add":    noop,
				"remove": noop,
				"toggle": noop,
			},
		})
	}
	api := map[string]any{
		"input": func(call goja.FunctionCall) goja.Value {
			return call.Argument(0)
		},
		"select": func(call goja.FunctionCall) goja.Value {
			return call.Argument(0)
		},
		"submit": func(call goja.FunctionCall) goja.Value {
			return runtime.ToValue(map[string]any{"label": call.Argument(0).String()})
		},
	}
	if err := runtime.Set("document", map[string]any{
		"createElement":  createElement,
		"createTextNode": createElement,
	}); err != nil {
		return Definition{}, err
	}
	rootElement := createElement(goja.FunctionCall{})
	root := map[string]any{
		"element":     rootElement,
		"append":      noop,
		"appendChild": noop,
	}
	if _, err := runtime.RunString(script); err != nil {
		return Definition{}, err
	}
	fn, ok := goja.AssertFunction(runtime.Get("render"))
	if !ok {
		return Definition{}, errors.New("form script must define function render(api, root)")
	}
	output, err := fn(goja.Undefined(), runtime.ToValue(api), runtime.ToValue(root))
	if err != nil {
		return Definition{}, err
	}
	definition, err := parseDefinition(output.Export())
	if err != nil {
		return Definition{}, err
	}
	return definition, nil
}

func parseDefinition(value any) (Definition, error) {
	values, ok := value.(map[string]any)
	if !ok {
		return Definition{}, errors.New("form script must return a definition object")
	}
	table, ok := values["table"].(string)
	if !ok || table == "" {
		return Definition{}, errors.New("form definition table is required")
	}
	fieldValues, ok := values["fields"].(map[string]any)
	if !ok || len(fieldValues) == 0 {
		return Definition{}, errors.New("form definition fields are required")
	}
	fields := make(map[string]string, len(fieldValues))
	for inputID, fieldName := range fieldValues {
		field, ok := fieldName.(string)
		if !ok || field == "" {
			return Definition{}, fmt.Errorf("form field mapping %q must target a field", inputID)
		}
		fields[inputID] = field
	}
	return Definition{Table: table, Fields: fields}, nil
}
