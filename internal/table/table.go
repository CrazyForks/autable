package table

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"codetable/internal/history"
	"codetable/internal/metadata"
	"codetable/internal/permission"
)

var (
	ErrPermissionDenied = errors.New("permission denied")
	ErrDeletedField     = errors.New("field is soft-deleted")
)

type Row struct {
	RecordID int64
	Values   map[string]any
}

type RowRepository interface {
	CreateRow(ctx context.Context, dbName, tableName string, values map[string]any) (Row, error)
}

type Service struct {
	rows    RowRepository
	history history.Store
}

func NewService(historyStore history.Store) *Service {
	return NewServiceWithRepository(historyStore, NewMemoryRowRepository())
}

func NewServiceWithRepository(historyStore history.Store, rows RowRepository) *Service {
	return &Service{
		rows:    rows,
		history: historyStore,
	}
}

func (service *Service) CreateRow(ctx context.Context, catalog metadata.Catalog, perms permission.Set, actorID, dbName, tableName string, values map[string]any) (Row, error) {
	tableMeta, ok := catalog.Table(dbName, tableName)
	if !ok {
		return Row{}, fmt.Errorf("table %s.%s not found", dbName, tableName)
	}
	resource := dbName + "." + tableName
	for fieldName := range values {
		field, ok := tableMeta.Field(fieldName)
		if !ok {
			return Row{}, fmt.Errorf("%w: %s", metadata.ErrUnknownField, fieldName)
		}
		if field.Deleted {
			return Row{}, fmt.Errorf("%w: %s", ErrDeletedField, fieldName)
		}
		if !perms.CanWriteField(actorID, resource, fieldName) {
			return Row{}, fmt.Errorf("%w: %s", ErrPermissionDenied, fieldName)
		}
	}
	for _, field := range tableMeta.ActiveFields() {
		if field.Required {
			if _, ok := values[field.Name]; !ok {
				return Row{}, fmt.Errorf("required field %q is missing", field.Name)
			}
		}
	}

	row, err := service.rows.CreateRow(ctx, dbName, tableName, cloneValues(values))
	if err != nil {
		return Row{}, err
	}
	_, err = history.SaveRowChange(ctx, service.history, history.RowChange{
		Database:  dbName,
		Table:     tableName,
		RecordID:  row.RecordID,
		Timestamp: time.Now().UTC(),
		Values:    cloneValues(row.Values),
		ActorID:   actorID,
	})
	if err != nil {
		return Row{}, err
	}
	return row, nil
}

type MemoryRowRepository struct {
	mu     sync.Mutex
	nextID map[string]int64
	rows   map[string]map[int64]Row
}

func NewMemoryRowRepository() *MemoryRowRepository {
	return &MemoryRowRepository{
		nextID: map[string]int64{},
		rows:   map[string]map[int64]Row{},
	}
}

func (repository *MemoryRowRepository) CreateRow(_ context.Context, dbName, tableName string, values map[string]any) (Row, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	resource := dbName + "." + tableName
	repository.nextID[resource]++
	recordID := repository.nextID[resource]
	row := Row{RecordID: recordID, Values: cloneValues(values)}
	if repository.rows[resource] == nil {
		repository.rows[resource] = map[int64]Row{}
	}
	repository.rows[resource][recordID] = row
	return row, nil
}

func cloneValues(values map[string]any) map[string]any {
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
