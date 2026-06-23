package backup

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"

	"autable/internal/history"
)

type levelDBEntry struct {
	KeyBase64   string `json:"key_base64"`
	ValueBase64 string `json:"value_base64"`
}

func exportLevelDBSnapshot(ctx context.Context, store *history.LevelDBStore, destinationPath string) error {
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return err
	}
	file, err := os.Create(destinationPath)
	if err != nil {
		return err
	}
	defer file.Close()
	writer := bufio.NewWriter(file)

	encoder := json.NewEncoder(writer)
	if err := store.ForEachSnapshot(ctx, func(key []byte, value []byte) error {
		return encoder.Encode(levelDBEntry{
			KeyBase64:   base64.StdEncoding.EncodeToString(key),
			ValueBase64: base64.StdEncoding.EncodeToString(value),
		})
	}); err != nil {
		return err
	}
	return writer.Flush()
}
