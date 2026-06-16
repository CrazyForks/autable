package recorddb

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

type JSONMap map[string]any

func (values JSONMap) Value() (driver.Value, error) {
	if values == nil {
		return "{}", nil
	}
	data, err := json.Marshal(map[string]any(values))
	if err != nil {
		return nil, err
	}
	return string(data), nil
}

func (values *JSONMap) Scan(src any) error {
	if src == nil {
		*values = JSONMap{}
		return nil
	}

	var data []byte
	switch typed := src.(type) {
	case []byte:
		data = typed
	case string:
		data = []byte(typed)
	default:
		return fmt.Errorf("cannot scan %T into JSONMap", src)
	}

	target := map[string]any{}
	if err := json.Unmarshal(data, &target); err != nil {
		return err
	}
	*values = JSONMap(target)
	return nil
}

func (values JSONMap) Plain() map[string]any {
	plain := make(map[string]any, len(values))
	for key, value := range values {
		plain[key] = value
	}
	return plain
}
