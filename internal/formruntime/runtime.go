package formruntime

import (
	"errors"

	"github.com/dop251/goja"
)

type Definition struct {
	Table  string            `json:"table"`
	Fields map[string]string `json:"fields"`
}

func Evaluate(script string) (Definition, error) {
	runtime := goja.New()
	fields := map[string]string{}
	noop := func(goja.FunctionCall) goja.Value { return goja.Undefined() }
	formControl := func(call goja.FunctionCall) goja.Value {
		config := call.Argument(0)
		if config == nil || goja.IsUndefined(config) || goja.IsNull(config) {
			panic(runtime.NewTypeError("form controls require field"))
		}
		fieldValue := config.ToObject(runtime).Get("field")
		if fieldValue == nil || goja.IsUndefined(fieldValue) || goja.IsNull(fieldValue) {
			panic(runtime.NewTypeError("form controls require field"))
		}
		field, ok := fieldValue.Export().(string)
		if !ok || field == "" {
			panic(runtime.NewTypeError("form controls require field"))
		}
		fields[field] = field
		return config
	}
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
		"input":    formControl,
		"relation": formControl,
		"select":   formControl,
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
	definition, err := parseDefinition(output.Export(), fields)
	if err != nil {
		return Definition{}, err
	}
	return definition, nil
}

func parseDefinition(value any, fields map[string]string) (Definition, error) {
	values, ok := value.(map[string]any)
	if !ok {
		return Definition{}, errors.New("form script must return a definition object")
	}
	table, ok := values["table"].(string)
	if !ok || table == "" {
		return Definition{}, errors.New("form definition table is required")
	}
	return Definition{Table: table, Fields: fields}, nil
}
