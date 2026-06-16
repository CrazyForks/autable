package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"codetable/internal/history"
	"codetable/internal/metadata"
	"codetable/internal/permission"
	"codetable/internal/recorddb"
	"codetable/internal/systemdb"
	"codetable/internal/table"
)

func TestCreateRowAPIEnforcesPermissionsAndWritesHistory(t *testing.T) {
	ctx := context.Background()
	server, system := newTestServer(t)
	grant := permission.Grant{
		SubjectID: "u1",
		Scope:     permission.ScopeTable,
		Resource:  "db.contacts",
		Level:     permission.Write,
	}
	if err := system.SaveGrant(ctx, grant); err != nil {
		t.Fatal(err)
	}

	body := bytes.NewBufferString(`{"values":{"name":"Ada","email":"ada@example.com"}}`)
	request := httptest.NewRequest(http.MethodPost, "/api/tables/db/contacts/rows", body)
	request.Header.Set("X-Codetable-User", "u1")
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var row rowResponse
	if err := json.NewDecoder(recorder.Body).Decode(&row); err != nil {
		t.Fatal(err)
	}
	if row.RecordID != 1 {
		t.Fatalf("expected record_id 1, got %d", row.RecordID)
	}

	historyRequest := httptest.NewRequest(http.MethodGet, "/api/tables/db/contacts/rows/1/history", nil)
	historyRecorder := httptest.NewRecorder()
	server.ServeHTTP(historyRecorder, historyRequest)
	if historyRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", historyRecorder.Code, historyRecorder.Body.String())
	}

	var changes []history.RowChange
	if err := json.NewDecoder(historyRecorder.Body).Decode(&changes); err != nil {
		t.Fatal(err)
	}
	if len(changes) != 1 || changes[0].Values["name"] != "Ada" {
		t.Fatalf("unexpected row history: %#v", changes)
	}
}

func TestCreateRowAPIDeniesMissingWritePermission(t *testing.T) {
	server, _ := newTestServer(t)
	body := bytes.NewBufferString(`{"values":{"name":"Ada"}}`)
	request := httptest.NewRequest(http.MethodPost, "/api/tables/db/contacts/rows", body)
	request.Header.Set("X-Codetable-User", "u1")
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestCreateRowAPICanUsePersistentRepository(t *testing.T) {
	ctx := context.Background()
	system, err := systemdb.Open(ctx, filepath.Join(t.TempDir(), "system.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := system.Close(); err != nil {
			t.Fatal(err)
		}
	})

	catalog := testCatalog(filepath.Join(t.TempDir(), "workspace.sqlite"))
	repository, err := recorddb.OpenCatalog(ctx, catalog)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatal(err)
		}
	})
	historyStore := history.NewMemoryStore()
	server := NewServer(catalog, system, table.NewServiceWithRepository(historyStore, repository), historyStore)
	if err := system.SaveGrant(ctx, permission.Grant{
		SubjectID: "u1",
		Scope:     permission.ScopeTable,
		Resource:  "db.contacts",
		Level:     permission.Write,
	}); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/tables/db/contacts/rows", bytes.NewBufferString(`{"values":{"name":"Ada"}}`))
	request.Header.Set("X-Codetable-User", "u1")
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recorder.Code, recorder.Body.String())
	}

	rows, err := repository.Rows(ctx, "db", "contacts")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Values["name"] != "Ada" {
		t.Fatalf("unexpected persisted API rows: %#v", rows)
	}
}

func TestWorkflowAndFormAPI(t *testing.T) {
	server, _ := newTestServer(t)

	workflowRequest := httptest.NewRequest(http.MethodPost, "/api/workflows", bytes.NewBufferString(`{
		"name":"notify",
		"script":"export default async function run() {}",
		"secrets":{"TOKEN":"secret"},
		"variables":{"CHANNEL":"ops"}
	}`))
	workflowRecorder := httptest.NewRecorder()
	server.ServeHTTP(workflowRecorder, workflowRequest)
	if workflowRecorder.Code != http.StatusCreated {
		t.Fatalf("expected workflow 201, got %d: %s", workflowRecorder.Code, workflowRecorder.Body.String())
	}

	var workflow systemdb.WorkflowDefinition
	if err := json.NewDecoder(workflowRecorder.Body).Decode(&workflow); err != nil {
		t.Fatal(err)
	}
	getWorkflow := httptest.NewRequest(http.MethodGet, "/api/workflows/1", nil)
	getWorkflowRecorder := httptest.NewRecorder()
	server.ServeHTTP(getWorkflowRecorder, getWorkflow)
	if getWorkflowRecorder.Code != http.StatusOK {
		t.Fatalf("expected workflow 200, got %d: %s", getWorkflowRecorder.Code, getWorkflowRecorder.Body.String())
	}

	formRequest := httptest.NewRequest(http.MethodPost, "/api/forms", bytes.NewBufferString(`{
		"name":"contact-intake",
		"script":"root.append(api.input({ name: 'email' }))"
	}`))
	formRecorder := httptest.NewRecorder()
	server.ServeHTTP(formRecorder, formRequest)
	if formRecorder.Code != http.StatusCreated {
		t.Fatalf("expected form 201, got %d: %s", formRecorder.Code, formRecorder.Body.String())
	}

	var form systemdb.FormDefinition
	if err := json.NewDecoder(formRecorder.Body).Decode(&form); err != nil {
		t.Fatal(err)
	}
	if workflow.ID != 1 || form.ID != 1 {
		t.Fatalf("expected autoincrement ids, got workflow=%d form=%d", workflow.ID, form.ID)
	}
}

func newTestServer(t *testing.T) (*Server, *systemdb.DB) {
	t.Helper()
	system, err := systemdb.Open(context.Background(), filepath.Join(t.TempDir(), "system.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := system.Close(); err != nil {
			t.Fatal(err)
		}
	})
	historyStore := history.NewMemoryStore()
	catalog := testCatalog("./db.sqlite")
	return NewServer(catalog, system, table.NewService(historyStore), historyStore), system
}

func testCatalog(sqlitePath string) metadata.Catalog {
	return metadata.Catalog{Databases: []metadata.Database{{
		Name:       "db",
		SQLitePath: sqlitePath,
		Tables: []metadata.Table{{
			Name: "contacts",
			Fields: []metadata.Field{
				{Name: "name", Type: "text", Required: true},
				{Name: "email", Type: "email"},
			},
		}},
	}}}
}
