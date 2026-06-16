package systemdb

import (
	"context"
	"path/filepath"
	"testing"

	"codetable/internal/auth"
	"codetable/internal/permission"
)

func TestUserUpsertUsesEmailFallback(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)

	passwordUser, err := auth.NewPasswordUser(auth.PasswordRegistration{
		Email:    "person@example.com",
		Password: "correct horse",
	})
	if err != nil {
		t.Fatal(err)
	}
	inserted, err := db.UpsertUserByEmail(ctx, passwordUser)
	if err != nil {
		t.Fatal(err)
	}

	oidcUser, err := auth.NewOIDCUser(auth.OIDCIdentity{
		ProviderName: "main",
		Subject:      "sub-123",
		Email:        "PERSON@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	upserted, err := db.UpsertUserByEmail(ctx, oidcUser)
	if err != nil {
		t.Fatal(err)
	}
	if upserted.ID != inserted.ID {
		t.Fatalf("expected email fallback to keep existing user id %q, got %q", inserted.ID, upserted.ID)
	}

	loaded, err := db.UserByEmail(ctx, "person@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Provider != auth.ProviderOIDC || loaded.Subject != "sub-123" {
		t.Fatalf("unexpected loaded user: %#v", loaded)
	}
}

func TestOpenCreatesParentDirectory(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "nested", "system.sqlite")

	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestPermissionGrantPersistence(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	grant := permission.Grant{
		SubjectID: "u1",
		Scope:     permission.ScopeField,
		Resource:  "db.contacts",
		Field:     "email",
		Level:     permission.Write,
	}
	if err := db.SaveGrant(ctx, grant); err != nil {
		t.Fatal(err)
	}

	perms, err := db.GrantsForSubject(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if !perms.CanWriteField("u1", "db.contacts", "email") {
		t.Fatal("expected persisted grant to allow field write")
	}
	if perms.CanWriteField("u1", "db.contacts", "name") {
		t.Fatal("did not expect grant to apply to another field")
	}
}

func TestWorkflowDefinitionStoresSecretsAndVariablesAsJSON(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)

	saved, err := db.SaveWorkflow(ctx, WorkflowDefinition{
		DatabaseName: "workspace",
		Name:         "notify",
		Script:       "export default async function run() {}",
		Secrets:      map[string]string{"TOKEN": "secret"},
		Variables:    map[string]string{"CHANNEL": "ops"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == 0 {
		t.Fatal("expected autoincrement workflow id")
	}

	loaded, err := db.Workflow(ctx, saved.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Secrets["TOKEN"] != "secret" || loaded.Variables["CHANNEL"] != "ops" {
		t.Fatalf("unexpected workflow JSON fields: %#v", loaded)
	}
	list, err := db.Workflows(ctx, "workspace")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != saved.ID {
		t.Fatalf("unexpected workflow list: %#v", list)
	}
}

func TestFormDefinitionAutoincrementsID(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)

	saved, err := db.SaveForm(ctx, FormDefinition{
		DatabaseName: "workspace",
		Name:         "contact-intake",
		Script:       "root.append(api.input({ name: 'email' }))",
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID != 1 {
		t.Fatalf("expected first form id to be 1, got %d", saved.ID)
	}
	list, err := db.Forms(ctx, "workspace")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != saved.ID {
		t.Fatalf("unexpected form list: %#v", list)
	}
}

func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(context.Background(), filepath.Join(t.TempDir(), "system.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
	})
	return db
}
